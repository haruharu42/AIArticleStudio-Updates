"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AasReferenceBottomNav, AasReferenceHeader } from "@/components/aas-reference-shell";
import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
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
} from "@/features/account-design";
import { buildCombinedImagePrompt, buildImagePromptPlan } from "@/lib/phase13-image-prompts";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied"; message: string }
  | { kind: "ready"; ownerId: string }
  | { kind: "error"; message: string };

export function Phase11CreatePage() {
  const { accountPresets } = useWorkspacePreset();
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ArticleCreationDraft>(() => initialDraftFromLocation());
  const [tagsText, setTagsText] = useState("");
  const [titleCandidatesText, setTitleCandidatesText] = useState("");
  const [magazinePlan, setMagazinePlan] = useState<MagazinePlanDraft>(() => ({ ...DEFAULT_MAGAZINE_PLAN, articleTitles: [] }));
  const [message, setMessage] = useState(() => initialMessageFromLocation());
  const [busy, setBusy] = useState(false);
  const [articleBusy, setArticleBusy] = useState(false);
  const [articlePromptAuthorized, setArticlePromptAuthorized] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [wizardRestored, setWizardRestored] = useState<boolean | null>(null);
  const [accountDesigns, setAccountDesigns] = useState<Record<AccountDesignPlatform, PlatformAccountDesign> | null>(null);
  const progressOwnerIdRef = useRef("");
  const articleQuotaInFlightRef = useRef(false);
  const accountPresetAppliedRef = useRef(false);

  const persistWizardProgress = useCallback(() => {
    if (gate.kind !== "ready" || progressOwnerIdRef.current !== gate.ownerId || createdId) return;
    saveArticleWizardProgress(gate.ownerId, {
      step,
      draft,
      magazinePlan,
      tagsText,
      titleCandidatesText,
      activePresetId,
    });
  }, [activePresetId, createdId, draft, gate, magazinePlan, step, tagsText, titleCandidatesText]);

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
          setTitleCandidatesText(saved.titleCandidatesText);
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
    persistWizardProgress();
  }, [persistWizardProgress]);

  useEffect(() => {
    if (gate.kind !== "ready") return;

    const persistBeforePageLeaves = () => {
      persistWizardProgress();
    };
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persistWizardProgress();
    };

    window.addEventListener("pagehide", persistBeforePageLeaves);
    window.addEventListener("beforeunload", persistBeforePageLeaves);
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.removeEventListener("pagehide", persistBeforePageLeaves);
      window.removeEventListener("beforeunload", persistBeforePageLeaves);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, [gate.kind, persistWizardProgress]);

  const activeAccountPreset = draft.publicationTarget === "blog"
    ? null
    : accountPresets.find((preset) => preset.platform === draft.publicationTarget && preset.isDefault) ?? null;

  useEffect(() => {
    if (accountPresetAppliedRef.current || wizardRestored !== false || !activeAccountPreset) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has("from") || params.has("genre") || params.has("title")) {
      accountPresetAppliedRef.current = true;
      return;
    }

    const presetGenre = activeAccountPreset.genre.trim();
    accountPresetAppliedRef.current = true;
    if (!presetGenre) return;

    queueMicrotask(() => {
      setDraft((current) => {
        const subgenres = subgenreOptionsFor(presetGenre);
        return {
          ...current,
          genre: presetGenre,
          subgenre: subgenres.includes(current.subgenre) ? current.subgenre : subgenres[0] ?? "AIおまかせ",
        };
      });
      setMessage(`投稿アカウントプリセット「${activeAccountPreset.presetName}」の固定ジャンルを初期値へ反映しました。サブジャンル・年齢・性別・文字数・価格はこの記事ごとに設定できます。`);
    });
  }, [activeAccountPreset, wizardRestored]);

  const displayStep = step;
  const articleDraft = useMemo(() => withArticleTags(draft, tagsText), [draft, tagsText]);
  const activeAccountDesign = draft.publicationTarget === "blog"
    ? null
    : accountDesigns?.[draft.publicationTarget] ?? null;
  const accountDesignPromptKey = activeAccountDesign?.ready
    ? `${activeAccountDesign.platform}:${activeAccountDesign.updatedAt ?? "unsaved"}`
    : "none";
  const accountPresetPromptKey = activeAccountPreset
    ? `${activeAccountPreset.id}:${activeAccountPreset.updatedAt}`
    : "none";
  const titlePrompt = useMemo(
    () => buildTitlePrompt(articleDraft, draft.magazineEnabled ? magazinePlan : undefined),
    [articleDraft, draft.magazineEnabled, magazinePlan, accountDesignPromptKey, accountPresetPromptKey],
  );
  const articlePrompt = useMemo(
    () => buildArticlePrompt(articleDraft, draft.magazineEnabled ? magazinePlan : undefined),
    [articleDraft, draft.magazineEnabled, magazinePlan, accountDesignPromptKey, accountPresetPromptKey],
  );
  const imagePrompts = useMemo(
    () => buildImagePromptPlan({
      title: draft.title,
      theme: draft.theme || draft.title,
      publicationTarget: draft.publicationTarget,
      genre: draft.genre,
      subgenre: draft.subgenre,
      ageGroup: draft.ageGroup,
      gender: draft.gender,
      body: draft.body,
      coverEnabled: draft.coverEnabled,
      inlineEnabled: draft.inlineEnabled,
      inlineCount: draft.inlineCount,
    }),
    [draft, accountDesignPromptKey, accountPresetPromptKey],
  );
  const combinedImagePrompt = useMemo(() => buildCombinedImagePrompt(imagePrompts), [imagePrompts]);
  const articlePromptReady = articlePromptAuthorized === articlePrompt;

  const patch = <K extends keyof ArticleCreationDraft>(key: K, value: ArticleCreationDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

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
      price: value === "free" ? null : current.price !== null && current.price > 0 ? current.price : 980,
    }));
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

      <ol className="wizard-steps" aria-label="記事作成の進行状況">
        {ARTICLE_CREATE_STEPS.map((label, index) => (
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
        {draft.publicationTarget !== "blog" && (
          <div className={`account-design-create-status ${activeAccountPreset ? "ready" : "missing"}`}>
            <div>
              <strong>
                {activeAccountPreset
                  ? `✓ 投稿アカウントプリセット「${activeAccountPreset.presetName}」を使用`
                  : `${draft.publicationTarget === "note" ? "note" : draft.publicationTarget === "tips" ? "Tips" : "Brain"}の投稿アカウントプリセットは未設定`}
              </strong>
              <small>
                {activeAccountPreset
                  ? `${activeAccountPreset.accountName || "ユーザー名未設定"} / 固定ジャンル: ${activeAccountPreset.genre || "未設定"}。サブジャンル・年齢・性別・文字数・価格はこの記事で決め、タグは最後に設定します。`
                  : "設定でユーザー名と主な投稿ジャンルを一度登録すると、記事作成時の固定設定として自動参照します。"}
              </small>
            </div>
            <div className="account-design-create-actions">
              <a href="/settings">{activeAccountPreset ? "プリセットを確認" : "プリセットを登録"}</a>
            </div>
          </div>
        )}

        {step === 0 && <GenerationMethodStep draft={draft} patch={patch} magazinePlan={magazinePlan} onMagazinePlanChange={setMagazinePlan} setGenre={setGenre} setSubgenre={setSubgenre} />}
        {step === 1 && <ImagePlanStep draft={draft} patch={patch} />}
        {step === 2 && (
          <ArticleConditionsStep
            draft={draft}
            patch={patch}
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
            titlePrompt={titlePrompt}
            titleCandidatesText={titleCandidatesText}
            setTitleCandidatesText={setTitleCandidatesText}
            onBeforeExternalLaunch={persistWizardProgress}
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
            onBeforeExternalLaunch={persistWizardProgress}
            setMessage={setMessage}
          />
        )}
        {step === 5 && (
          <PreviewStep
            draft={draft}
            imagePrompts={imagePrompts}
            combinedImagePrompt={combinedImagePrompt}
            onBeforeExternalLaunch={persistWizardProgress}
            setMessage={setMessage}
          />
        )}
        {step === 6 && <SaveStep draft={draft} patch={patch} tagsText={tagsText} setTagsText={setTagsText} busy={busy} createdId={createdId} onSave={save} setMessage={setMessage} />}

        {message && <div className="route-notice" role="status" aria-live="polite">{message}</div>}

        <footer className="wizard-actions">
          <button className="secondary-action" type="button" disabled={step === 0 || busy || articleBusy} onClick={back}>戻る</button>
          {step < ARTICLE_CREATE_STEPS.length - 1 && <button className="primary-action" type="button" disabled={busy || articleBusy} onClick={next}>次へ →</button>}
          {createdId && <a className="primary-action" href="/">ホームへ戻る</a>}
        </footer>
      </section>
      <AasReferenceBottomNav active="create" />
    </main>
  );
}
