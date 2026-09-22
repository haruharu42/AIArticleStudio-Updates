"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PresetSelect, type PresetOption } from "@/components/preset-select";
import { ActiveWorkspacePresetBadge } from "@/features/presets/active-workspace-preset-badge";
import { workspacePresetImageDefaults } from "@/features/presets/preset-adapters";
import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import { consumeFreeTrialUsage, trialUsageMessage } from "@/lib/free-trial";
import { OPENAI_LINKS } from "@/lib/openai-links";
import { buildImagePromptPlan, type ImagePromptItem } from "@/lib/phase13-image-prompts";
import { AGE_GROUP_OPTIONS, GENDER_OPTIONS, IMAGE_STYLE_OPTIONS, isImageStyleValue } from "@/lib/phase18-content-options";
import { getCloudArticleDetail, listCloudArticles, type ArticleDetail, type ArticleSummary } from "@/lib/phase7-articles";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

type PublicationTarget = "note" | "tips" | "brain" | "blog";

const AGE_OPTIONS: readonly PresetOption[] = AGE_GROUP_OPTIONS.map((value) => ({ value, label: value }));
const GENDER_SELECT_OPTIONS: readonly PresetOption[] = GENDER_OPTIONS.map((value) => ({ value, label: value }));
const INLINE_COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function boolValue(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function integerValue(value: unknown, fallback: number): number { return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback; }
function publicationTarget(value: string): PublicationTarget { return value === "note" || value === "tips" || value === "brain" || value === "blog" ? value : "note"; }

export function Phase13ImagePromptPage() {
  const { preference: workspacePreference } = useWorkspacePreset();
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [theme, setTheme] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [gender, setGender] = useState("");
  const [coverEnabled, setCoverEnabled] = useState(true);
  const [inlineEnabled, setInlineEnabled] = useState(false);
  const [inlineCount, setInlineCount] = useState(2);
  const [imageStyle, setImageStyle] = useState("auto");
  const [generatedPrompts, setGeneratedPrompts] = useState<ImagePromptItem[]>([]);
  const [generatedFingerprint, setGeneratedFingerprint] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const generateInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) { setGate({ kind: "signed_out" }); return; }
        const { data: profile, error: profileError } = await client.from("profiles").select("id,aas_user_id,status").eq("id", user.id).single();
        if (profileError || !profile || profile.id !== user.id || profile.status !== "active") throw new Error("activeプロフィールを確認できません。");
        const next = await listCloudArticles(client, user.id, 200);
        if (!active) return;
        setArticles(next);
        setGate({ kind: "ready", ownerId: user.id, aasId: profile.aas_user_id });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "初期化に失敗しました。" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const choose = async (articleId: string) => {
    if (gate.kind !== "ready") return;
    setDetail(null); setGeneratedPrompts([]); setGeneratedFingerprint(""); setMessage("");
    if (!articleId) return;
    setBusy(true);
    try {
      const next = await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, articleId);
      const request = next.workspace.requestJson;
      const plan = next.workspace.imagePlanJson;
      const cover = objectValue(plan.cover);
      const inline = objectValue(plan.inline);
      const presetDefaults = workspacePresetImageDefaults(workspacePreference);
      setDetail(next);
      setTheme(stringValue(request.theme) || next.title);
      setAgeGroup(stringValue(request.age_group) || "AIおまかせ");
      setGender(stringValue(request.gender) || "AIおまかせ");
      setCoverEnabled(typeof cover.enabled === "boolean" ? cover.enabled : presetDefaults?.coverEnabled ?? true);
      setInlineEnabled(typeof inline.enabled === "boolean" ? inline.enabled : presetDefaults?.inlineEnabled ?? false);
      setInlineCount(Math.max(1, Math.min(10, typeof inline.count === "number" && Number.isSafeInteger(inline.count)
        ? inline.count
        : presetDefaults?.inlineCount ?? 2)));
      const storedStyle = stringValue(plan.style) || stringValue(request.image_style);
      setImageStyle(isImageStyleValue(storedStyle) ? storedStyle : "auto");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事を読み込めませんでした。");
    } finally { setBusy(false); }
  };

  const promptFingerprint = useMemo(() => detail ? JSON.stringify({ id: detail.id, revision: detail.revision, theme, ageGroup, gender, coverEnabled, inlineEnabled, inlineCount, imageStyle }) : "", [ageGroup, coverEnabled, detail, gender, imageStyle, inlineCount, inlineEnabled, theme]);
  const promptsReady = Boolean(promptFingerprint) && generatedFingerprint === promptFingerprint;

  const generatePrompts = async () => {
    if (!detail || generateInFlightRef.current) return;
    if (!coverEnabled && !inlineEnabled) { setMessage("アイキャッチまたは挿絵をONにしてください。"); return; }
    generateInFlightRef.current = true; setGenerateBusy(true); setMessage("");
    try {
      const result = await consumeFreeTrialUsage(getSupabaseClient(), "image_generate");
      if (!result.allowed) { setGeneratedPrompts([]); setGeneratedFingerprint(""); setMessage(trialUsageMessage(result)); return; }
      setGeneratedPrompts(buildImagePromptPlan({
        title: detail.title, theme, publicationTarget: publicationTarget(detail.publicationTarget),
        genre: detail.genre || "", subgenre: detail.subgenre || "", ageGroup, gender,
        coverEnabled, inlineEnabled, inlineCount, imageStyle,
      }));
      setGeneratedFingerprint(promptFingerprint);
      setMessage(result.bypassLimits ? "画像生成プロンプトと保存用ファイル名を作成しました。" : `画像生成プロンプトを1回作成しました。${trialUsageMessage(result)}`);
    } catch (error) {
      setGeneratedPrompts([]); setGeneratedFingerprint("");
      setMessage(error instanceof Error ? error.message : "画像生成の利用回数を確認できませんでした。");
    } finally { generateInFlightRef.current = false; setGenerateBusy(false); }
  };

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setMessage(`${label}をコピーしました。`); }
    catch { setMessage("自動コピーできません。表示欄から手動でコピーしてください。"); }
  };

  if (gate.kind !== "ready") return (
    <main className="standalone-page"><section className="standalone-card">
      <p className="eyebrow">IMAGE CREATION</p><h1>画像生成計画</h1>
      {gate.kind === "loading" && <p className="route-notice">記事ライブラリを確認しています…</p>}
      {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
      {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
      <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
    </section></main>
  );

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">IMAGE CREATION</p><h1>記事から画像生成プロンプトを作る</h1><p>{gate.aasId} / アイキャッチと挿絵を同じ世界観で設計できます</p></div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>

      <ActiveWorkspacePresetBadge feature="images" />

      <section className="creator-card">
        <div className="route-notice" role="note">画像本体はAASのSupabase Storageへアップロードしません。ChatGPT Images等で生成した画像はスマホ・PCへ保存し、AASが表示する推奨ファイル名で管理してください。</div>
        <label className="route-field"><span>元記事</span><select defaultValue="" onChange={(event) => void choose(event.target.value)} disabled={busy || generateBusy}><option value="">記事を選択</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label>

        {detail && <>
          <dl className="route-meta"><div><dt>タイトル</dt><dd>{detail.title}</dd></div><div><dt>掲載先</dt><dd>{detail.publicationTarget}</dd></div><div><dt>ジャンル</dt><dd>{detail.genre || "未指定"}</dd></div><div><dt>revision</dt><dd>{detail.revision}</dd></div></dl>
          <div className="creator-form-grid">
            <label className="route-field full"><span>画像へ反映するテーマ</span><textarea value={theme} onChange={(event) => setTheme(event.target.value)} /></label>
            <PresetSelect label="対象年齢" value={ageGroup} onChange={setAgeGroup} options={AGE_OPTIONS} customPlaceholder="例: 35〜45歳、シニア層" />
            <PresetSelect label="対象性別" value={gender} onChange={setGender} options={GENDER_SELECT_OPTIONS} customPlaceholder="対象を自由に入力" />
            <label className="choice-card compact"><input type="checkbox" checked={coverEnabled} onChange={(event) => setCoverEnabled(event.target.checked)} /><span><strong>アイキャッチを作る</strong></span></label>
            <label className="choice-card compact"><input type="checkbox" checked={inlineEnabled} onChange={(event) => setInlineEnabled(event.target.checked)} /><span><strong>挿絵を作る</strong></span></label>
            {(coverEnabled || inlineEnabled) && <label className="route-field"><span>画像の画風</span><select value={imageStyle} onChange={(event) => setImageStyle(event.target.value)}>{IMAGE_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
            {inlineEnabled && <label className="route-field"><span>挿絵枚数</span><select value={inlineCount} onChange={(event) => setInlineCount(Number(event.target.value))}>{INLINE_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}枚</option>)}</select></label>}
          </div>

          <p className="panel-muted">対象年齢・性別は選択肢から選べます。「その他（自由入力）」を選ぶと独自条件を入力できます。画像テーマは内容そのものなので自由記述のままです。</p>
          <p className="panel-muted">設定変更だけでは回数を消費しません。「画像生成プロンプトを作成」を押した時だけ画像生成1回として記録されます。</p>
          <button className="primary-action" type="button" disabled={generateBusy || (!coverEnabled && !inlineEnabled)} onClick={() => void generatePrompts()}>{generateBusy ? "利用回数を確認中…" : promptsReady ? "画像生成プロンプトを作り直す" : "画像生成プロンプトを作成"}</button>

          {promptsReady && <div className="image-prompt-list">{generatedPrompts.map((item) => (
            <article className="image-prompt-card" key={`${item.kind}-${item.order}`}>
              <header><div><span>{item.kind === "cover" ? "アイキャッチ" : `挿絵 ${item.order}`}</span>{item.insertionMarker && <small>{`<!-- ${item.insertionMarker} -->`}</small>}</div><div className="image-prompt-actions"><button className="secondary-action" type="button" onClick={() => void copy(item.prompt, "画像生成プロンプト")}>プロンプトをコピー</button><a className="openai-launch-action" href={OPENAI_LINKS.images} target="_blank" rel="noreferrer">ChatGPT Imagesを開く ↗</a></div></header>
              <div className="route-field"><span>推奨ファイル名</span><div className="image-prompt-actions"><code style={{ overflowWrap: "anywhere" }}>{item.suggestedFilename}</code><button className="secondary-action" type="button" onClick={() => void copy(item.suggestedFilename, "ファイル名")}>ファイル名をコピー</button></div></div>
              <div className="route-field"><span>alt候補</span><div className="image-prompt-actions"><span>{item.altText}</span><button className="secondary-action" type="button" onClick={() => void copy(item.altText, "alt候補")}>altをコピー</button></div></div>
              <textarea className="prompt-area" readOnly value={item.prompt} />
            </article>
          ))}</div>}
          {promptsReady && <p className="beginner-help">生成後のコピーやChatGPT Images起動では追加消費しません。画像生成後はAASへアップロードせず端末へ保存してください。推奨ファイル名には記事タイトルと「アイキャッチ / 挿絵番号」が入るため、後から見ても用途を判別できます。</p>}
          {!coverEnabled && !inlineEnabled && <p className="route-notice">アイキャッチまたは挿絵をONにしてください。</p>}
        </>}

        {articles.length === 0 && <p className="panel-muted">記事がありません。先に記事を作成してください。</p>}
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">記事条件から画像生成用プロンプト・推奨ファイル名・alt候補を作成します。生成画像は端末へ保存して管理するため、Supabase Storage容量を消費しません。</p>
      </section>
    </main>
  );
}
