"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AasReferenceBottomNav, AasReferenceHeader } from "@/components/aas-reference-shell";
import { ActiveWorkspacePresetBadge } from "@/features/presets/active-workspace-preset-badge";
import { applyWorkspacePresetToArticleDraft } from "@/features/presets/preset-adapters";
import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import { applyAccountDesignToArticleDraft } from "@/features/account-design";
import { ArticlePresetPanel } from "@/components/article-create/article-preset-panel";
import {
  ArticleConditionsStep,
  BodyStep,
  GenerationMethodStep,
  ImagePlanStep,
  PreviewStep,
  SaveStep,
  TitleStep,
} from "@/components/article-create/article-create-steps";
import { loadCoreAccessState } from "@/lib/access-control";
import { DEFAULT_MAGAZINE_PLAN, type MagazinePlanDraft } from "@/lib/magazine-planner";
import { applyArticlePreset, type ArticlePreset } from "@/lib/article-presets";
import {
  ARTICLE_CREATE_STEPS,
  initialDraftFromLocation,
  initialMessageFromLocation,
  validateArticleCreateStep,
  withArticleTags,
} from "@/lib/article-create-draft";
import { consumeFreeTrialUsage, trialUsageMessage } from "@/lib/free-trial";
import {
  buildArticlePrompt,
  buildTitlePrompt,
  createArticleFromWizard,
  suggestLocalTitles,
  type ArticleCreationDraft,
  type ArticleType,
} from "@/lib/phase11-create";
import {
  clearArticleWizardProgress,
  loadArticleWizardProgress,
  saveArticleWizardProgress,
} from "@/lib/phase11-wizard-progress";
import { subgenreOptionsFor } from "@/lib/phase18-content-options";
import {
  loadPlatformAccountDesigns,
  setRuntimePlatformAccountDesigns,
  type AccountDesignPlatform,
  type PlatformAccountDesign,
} from "@/lib/platform-account-design";
import { getSupabaseClient } from "@/lib/supabase";

const ARTICLE_CREATE_UI_STEPS = [
  "種類の選択",
  "条件の入力",
  "タイトルの選択",
  "記事の生成",
] as const;

function displayStepForInternalStep(step: number): number {
  if (step <= 0) return 0;
  if (step <= 2) return 1;
  if (step === 3) return 2;
  return 3;
}

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied"; message: string }
  | { kind: "ready"; ownerId: string }
  | { kind: "error"; message: string };

export function Phase11CreatePage() {
  const { preference: workspacePreference } = useWorkspacePreset();
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ArticleCreationDraft>(() => initialDraftFromLocation());
  const [tagsText, setTagsText] = useState("");
  const [magazinePlan, setMagazinePlan] = useState<MagazinePlanDraft>(() => ({ ...DEFAULT_MAGAZINE_PLAN, articleTitles: [] }));
  const [message, setMessage] = useState(() => initialMessageFromLocation());
  const [busy, setBusy] = useState(false);
  const [titleBusy, setTitleBusy] = useState(false);
  const [articleBusy, setArticleBusy] = useState(false);
  const [titlePromptAuthorized, setTitlePromptAuthorized] = useState("");
  const [articlePromptAuthorized, setArticlePromptAuthorized] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [wizardRestored, setWizardRestored] = useState<boolean | null>(null);
  const [accountDesigns, setAccountDesigns] = useState<Record<AccountDesignPlatform, PlatformAccountDesign> | null>(null);
  const progressOwnerIdRef = useRef("");
  const titleQuotaInFlightRef = useRef(false);
  const articleQuotaInFlightRef = useRef(false);
  const workspacePresetAppliedRef = useRef(false);

  useEffect(() => {
    let active = true;
    setRuntimePlatformAccountDesigns(null);
    const boot = async () => {
      try {
        const access = await loadCoreAccessState(getSupabaseClient());
        if (!active) return;

        if (access.kind === "signed_out") {
          setGate({ kind: "signed_out" });
          return;
        }
        if (access.kind === "entitlement_denied") {
          setGate({ kind: "denied", message: "PWA利用権が必要です。" });
          return;
        }
        if (access.kind !== "ready") {
          setGate({ kind: "denied", message: "記事作成にはactiveアカウントが必要です。" });
          return;
        }

        const ownerId = access.user.id;
        try {
          const loadedDesigns = await loadPlatformAccountDesigns(getSupabaseClient(), ownerId);
          if (active) {
            setAccountDesigns(loadedDesigns);
            setRuntimePlatformAccountDesigns(loadedDesigns);
          }
        } catch {
          if (active) {
            setAccountDesigns(null);
            setRuntimePlatformAccountDesigns(null);
          }
        }

        const saved = loadArticleWizardProgress(ownerId);
        if (saved) {
          setStep(saved.step);
          setDraft(saved.draft);
          setMagazinePlan(saved.magazinePlan);
          setTagsText(saved.tagsText);
          setActivePresetId(saved.activePresetId);
          setWizardRestored(true);
          setMessage("前回の作業内容を復元しました。");
        } else {
          setWizardRestored(false);
        }
        progressOwnerIdRef.current = ownerId;
        setGate({ kind: "ready", ownerId });
      } catch (error) {
        if (active) {
          setGate({
            kind: "error",
            message: error instanceof Error ? error.message : "初期化に失敗しました。",
          });
        }
      }
    };
    void boot();
    return () => {
      active = false;
      setRuntimePlatformAccountDesigns(null);
    };
  }, []);

  useEffect(() => {
    if (gate.kind !== "ready" || progressOwnerIdRef.current !== gate.ownerId || createdId) return;
    saveArticleWizardProgress(gate.ownerId, { step, draft, magazinePlan, tagsText, activePresetId });
  }, [gate, step, draft, magazinePlan, tagsText, activePresetId, createdId]);

  useEffect(() => {
    if (
      workspacePresetAppliedRef.current
      || wizardRestored !== false
      || !workspacePreference?.applyArticle
    ) return;
    workspacePresetAppliedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    if (params.has("from") || params.has("publicationTarget") || params.has("title") || params.has("theme")) return;

    const next = applyWorkspacePresetToArticleDraft(draft, workspacePreference);
    const subgenres = subgenreOptionsFor(next.genre);
    const normalized = {
      ...next,
      subgenre: subgenres.includes(next.subgenre) ? next.subgenre : subgenres[0] ?? "AIおまかせ",
    };
    queueMicrotask(() => {
      setDraft(normalized);
      setTagsText(normalized.tags.join(", "));
      setMessage("設定画面の共通プリセットを新規記事の初期条件へ反映しました。個別条件はこの画面で変更できます。");
    });
  }, [draft, wizardRestored, workspacePreference]);

  const displayStep = displayStepForInternalStep(step);
  const articleDraft = useMemo(() => withArticleTags(draft, tagsText), [draft, tagsText]);
  const localTitles = useMemo(() => suggestLocalTitles(draft), [draft]);
  const activeAccountDesign = draft.publicationTarget === "blog"
    ? null
    : accountDesigns?.[draft.publicationTarget] ?? null;
  const accountDesignPromptKey = activeAccountDesign?.ready
    ? `${activeAccountDesign.platform}:${activeAccountDesign.updatedAt ?? "unsaved"}`
    : "none";
  const titlePrompt = useMemo(
    () => buildTitlePrompt(articleDraft, draft.magazineEnabled ? magazinePlan : undefined),
    [articleDraft, draft.magazineEnabled, magazinePlan, accountDesignPromptKey],
  );
  const articlePrompt = useMemo(
    () => buildArticlePrompt(articleDraft, draft.magazineEnabled ? magazinePlan : undefined),
    [articleDraft, draft.magazineEnabled, magazinePlan, accountDesignPromptKey],
  );
  const titleCandidatesReady = titlePromptAuthorized === titlePrompt;
  const articlePromptReady = articlePromptAuthorized === articlePrompt;

  const patch = <K extends keyof ArticleCreationDraft>(key: K, value: ArticleCreationDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const applyPreset = useCallback((preset: ArticlePreset) => {
    setDraft((current) => {
      const next = applyArticlePreset(current, preset);
      return current.magazineEnabled
        ? { ...next, publicationTarget: "note", magazineEnabled: true }
        : next;
    });
    setTagsText(preset.tags.join(", "));
    setActivePresetId(preset.id);
  }, []);

  const setGenre = (genre: string) => {
    if (genre === "その他") {
      setDraft((current) => ({ ...current, genre: "その他", subgenre: "AIおまかせ" }));
      return;
    }
    const nextSubgenres = subgenreOptionsFor(genre);
    setDraft((current) => ({
      ...current,
      genre,
      subgenre: nextSubgenres.includes(current.subgenre) ? current.subgenre : nextSubgenres[0] ?? "AIおまかせ",
    }));
  };

  const setCustomGenre = (value: string) => {
    setDraft((current) => ({ ...current, genre: value.slice(0, 120), subgenre: "AIおまかせ" }));
  };

  const setSubgenre = (value: string) => {
    patch("subgenre", value === "その他" ? "その他" : value);
  };

  const setArticleType = (value: ArticleType) => {
    setDraft((current) => ({
      ...current,
      articleType: value,
      price: value === "free" ? null : current.price !== null && current.price > 0 ? current.price : 1,
    }));
  };

  const applyActiveAccountDesign = () => {
    if (!activeAccountDesign?.ready) return;
    const result = applyAccountDesignToArticleDraft(draft, activeAccountDesign);
    setDraft(result.draft);
    setTagsText(result.draft.tags.join(", "));
    setMessage(`アカウント設計を記事条件へ反映しました。\n${result.summary.join(" / ")}`);
  };

  const generateTitleCandidates = async () => {
    if (titleQuotaInFlightRef.current) return;
    titleQuotaInFlightRef.current = true;
    setTitleBusy(true);
    setMessage("");
    try {
      const result = await consumeFreeTrialUsage(getSupabaseClient(), "title_generate");
      if (!result.allowed) {
        setTitlePromptAuthorized("");
        setMessage(trialUsageMessage(result));
        return;
      }
      setTitlePromptAuthorized(titlePrompt);
      setMessage(
        result.bypassLimits
          ? "タイトル候補を生成しました。"
          : `タイトル候補を1回生成しました。${trialUsageMessage(result)}`,
      );
    } catch (error) {
      setTitlePromptAuthorized("");
      setMessage(error instanceof Error ? error.message : "タイトル候補の利用回数を確認できませんでした。");
    } finally {
      titleQuotaInFlightRef.current = false;
      setTitleBusy(false);
    }
  };

  const generateArticlePrompt = async () => {
    if (articleQuotaInFlightRef.current) return;
    articleQuotaInFlightRef.current = true;
    setArticleBusy(true);
    setMessage("");
    try {
      const result = await consumeFreeTrialUsage(getSupabaseClient(), "article_generate");
      if (!result.allowed) {
        setArticlePromptAuthorized("");
        setMessage(trialUsageMessage(result));
        return;
      }
      setArticlePromptAuthorized(articlePrompt);
      setMessage(
        result.bypassLimits
          ? "完成記事プロンプトを作成しました。"
          : `完成記事プロンプトを1回作成しました。${trialUsageMessage(result)}`,
      );
    } catch (error) {
      setArticlePromptAuthorized("");
      setMessage(error instanceof Error ? error.message : "記事生成の利用回数を確認できませんでした。");
    } finally {
      articleQuotaInFlightRef.current = false;
      setArticleBusy(false);
    }
  };

  const next = () => {
    setMessage("");
    if (step === 0 && draft.magazineEnabled && !magazinePlan.name.trim()) {
      setMessage("マガジン構成案を生成し、「このマガジンを使用する」を選んでから次へ進んでください。");
      return;
    }
    const validationMessage = validateArticleCreateStep(step, draft);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    setStep((current) => Math.min(ARTICLE_CREATE_STEPS.length - 1, current + 1));
  };

  const back = () => {
    setMessage("");
    setStep((current) => Math.max(0, current - 1));
  };

  const save = async () => {
    if (gate.kind !== "ready") return;
    setBusy(true);
    setMessage("");
    try {
      const result = await createArticleFromWizard(
        getSupabaseClient(),
        gate.ownerId,
        articleDraft,
        draft.magazineEnabled ? magazinePlan : undefined,
        activePresetId,
      );
      clearArticleWizardProgress(gate.ownerId);
      setCreatedId(result.id);
      setMessage(`「${result.title}」をクラウド記事ライブラリへ保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">ARTICLE CREATOR</p><h1>記事を作る</h1>
        {gate.kind === "loading" && <p className="route-notice">アカウントと利用権を確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にホームからログインしてください。</p>}
        {gate.kind === "denied" && <p className="route-notice error">{gate.message}</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/">← ホームへ戻る</a>
      </section></main>
    );
  }

  return (
    <main className="creator-page beginner-creator-page reference-create-shell">
      <AasReferenceHeader />
      <header className="creator-head">
        <div>
          <p className="eyebrow">ARTICLE CREATOR</p>
          <h1>✎ 記事を作成</h1>
          <p>目的に合わせて、通常記事またはマガジン記事の作成方法を選択してください。</p>
        </div>
        <a className="reference-help-link" href="/manual">? ヘルプ</a>
      </header>

      <ActiveWorkspacePresetBadge feature="article" />

      <ol className="wizard-steps" aria-label="記事作成の進行状況">
        {ARTICLE_CREATE_UI_STEPS.map((label, index) => (
          <li
            key={label}
            className={index === displayStep ? "active" : index < displayStep ? "done" : ""}
            aria-current={index === displayStep ? "step" : undefined}
          >
            <span>{index + 1}</span>{label}
          </li>
        ))}
      </ol>

      <section className="creator-card">
        <ArticlePresetPanel
          ownerId={gate.ownerId}
          draft={draft}
          tagsText={tagsText}
          activePresetId={activePresetId}
          autoApplyDefault={wizardRestored === false && typeof window !== "undefined" && window.location.search.length === 0}
          onApply={applyPreset}
          onActivePresetChange={setActivePresetId}
          setMessage={setMessage}
        />

        {draft.publicationTarget !== "blog" && (
          <div className={`account-design-create-status ${activeAccountDesign?.ready ? "ready" : "missing"}`}>
            <div>
              <strong>{activeAccountDesign?.ready ? "✓ アカウント設計を自動反映" : "アカウント設計は未完了"}</strong>
              <small>
                {activeAccountDesign?.ready
                  ? `${draft.publicationTarget === "note" ? "note" : draft.publicationTarget === "tips" ? "Tips" : "Brain"}の保存済み設計をタイトル・本文プロンプトへ反映します。`
                  : "設計なしでも記事作成はできます。設定すると読者・トーン・収益化方針をAI指示へ自動反映できます。"}
              </small>
            </div>
            <div className="account-design-create-actions">
              {activeAccountDesign?.ready && (
                <button type="button" onClick={applyActiveAccountDesign}>記事条件にも反映</button>
              )}
              <a href={`/account-design?platform=${draft.publicationTarget}`}>
                {activeAccountDesign?.ready ? "設計を確認" : "アカウント設計を設定"}
              </a>
            </div>
          </div>
        )}

        {step === 0 && <GenerationMethodStep draft={draft} patch={patch} magazinePlan={magazinePlan} onMagazinePlanChange={setMagazinePlan} setGenre={setGenre} setSubgenre={setSubgenre} />}
        {step === 1 && <ImagePlanStep draft={draft} patch={patch} />}
        {step === 2 && (
          <ArticleConditionsStep
            draft={draft}
            patch={patch}
            tagsText={tagsText}
            setTagsText={setTagsText}
            setGenre={setGenre}
            setCustomGenre={setCustomGenre}
            setSubgenre={setSubgenre}
            setArticleType={setArticleType}
          />
        )}
        {step === 3 && (
          <TitleStep
            draft={draft}
            patch={patch}
            titleBusy={titleBusy}
            titleCandidatesReady={titleCandidatesReady}
            localTitles={localTitles}
            titlePrompt={titlePrompt}
            onGenerate={generateTitleCandidates}
            setMessage={setMessage}
          />
        )}
        {step === 4 && (
          <BodyStep
            draft={draft}
            patch={patch}
            articleBusy={articleBusy}
            articlePromptReady={articlePromptReady}
            articlePrompt={articlePrompt}
            onGenerate={generateArticlePrompt}
            setMessage={setMessage}
          />
        )}
        {step === 5 && <PreviewStep draft={draft} />}
        {step === 6 && <SaveStep draft={draft} patch={patch} busy={busy} createdId={createdId} onSave={save} />}

        {message && <div className="route-notice" role="status" aria-live="polite">{message}</div>}

        <footer className="wizard-actions">
          <button className="secondary-action" type="button" disabled={step === 0 || busy || titleBusy || articleBusy} onClick={back}>戻る</button>
          {step < ARTICLE_CREATE_STEPS.length - 1 && <button className="primary-action" type="button" disabled={busy || titleBusy || articleBusy} onClick={next}>次へ →</button>}
          {createdId && <a className="primary-action" href="/">ホームへ戻る</a>}
        </footer>
      </section>
      <AasReferenceBottomNav active="create" />
    </main>
  );
}
