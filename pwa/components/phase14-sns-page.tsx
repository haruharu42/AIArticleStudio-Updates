"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PresetSelect } from "@/components/preset-select";
import { ActiveWorkspacePresetBadge } from "@/features/presets/active-workspace-preset-badge";
import { workspacePresetSocialDefaults } from "@/features/presets/preset-adapters";
import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import { consumeFreeTrialUsage, trialUsageMessage } from "@/lib/free-trial";
import { buildSocialPrompt, type SocialGoal, type SocialPlatform } from "@/lib/phase14-sns";
import { getCloudArticleDetail, listCloudArticles, type ArticleDetail, type ArticleSummary } from "@/lib/phase7-articles";
import { SOCIAL_PLATFORM_OPTIONS, socialLaunchHint, socialPlatformLabel, socialPlatformUrl } from "@/lib/social-links";
import { getSupabaseClient } from "@/lib/supabase";
import { CHARACTER_LIMIT_OPTIONS, TONE_OPTIONS } from "@/lib/tool-options";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied"; message: string }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

const GOAL_OPTIONS: readonly { value: SocialGoal; label: string }[] = [
  { value: "article_traffic", label: "記事・ブログへの導線" },
  { value: "engagement", label: "交流・反応を増やす" },
  { value: "product_interest", label: "商品・有料コンテンツへの関心" },
  { value: "profile_growth", label: "プロフィール・フォロー導線" },
  { value: "community", label: "コミュニティ・会話づくり" },
  { value: "lead_generation", label: "相談・問い合わせ導線" },
  { value: "brand_awareness", label: "認知・専門テーマの定着" },
];

export function Phase14SnsPage() {
  const { preference: workspacePreference } = useWorkspacePreset();
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [articleId, setArticleId] = useState("");
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform>("x");
  const [goal, setGoal] = useState<SocialGoal>("article_traffic");
  const [tone, setTone] = useState("親しみやすく具体的");
  const [maxCharacters, setMaxCharacters] = useState("140");
  const [hashtags, setHashtags] = useState(true);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [generatedFingerprint, setGeneratedFingerprint] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const generateInFlightRef = useRef(false);
  const workspacePresetAppliedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) { setGate({ kind: "signed_out" }); return; }
        const { data: profile, error: profileError } = await client.from("profiles").select("id,aas_user_id,status").eq("id", user.id).single();
        if (profileError || !profile || profile.id !== user.id) throw new Error("プロフィールを確認できません。");
        if (profile.status !== "active") { setGate({ kind: "denied", message: "activeアカウントが必要です。" }); return; }
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

  useEffect(() => {
    if (workspacePresetAppliedRef.current || !workspacePreference?.applySns) return;
    workspacePresetAppliedRef.current = true;
    const preferred = ["x", "instagram", "threads", "tiktok", "youtube"].includes(
      workspacePresetSocialDefaults(workspacePreference, "x")?.preferredPlatform ?? "",
    )
      ? workspacePresetSocialDefaults(workspacePreference, "x")?.preferredPlatform
      : null;
    const nextPlatform = (preferred ?? "x") as SocialPlatform;
    const defaults = ["x", "instagram", "threads", "tiktok", "youtube"].includes(nextPlatform)
      ? workspacePresetSocialDefaults(workspacePreference, nextPlatform as "x" | "instagram" | "threads" | "tiktok" | "youtube")
      : null;
    queueMicrotask(() => {
      setPlatform(nextPlatform);
      if (defaults) setMaxCharacters(String(defaults.targetCharacters));
    });
  }, [workspacePreference]);

  const changePlatform = (next: SocialPlatform) => {
    setPlatform(next);
    if (!workspacePreference?.applySns) return;
    if (!["x", "instagram", "threads", "tiktok", "youtube"].includes(next)) return;
    const defaults = workspacePresetSocialDefaults(
      workspacePreference,
      next as "x" | "instagram" | "threads" | "tiktok" | "youtube",
    );
    if (defaults) setMaxCharacters(String(defaults.targetCharacters));
  };

  const loadArticle = async (id: string) => {
    if (gate.kind !== "ready") return;
    setArticleId(id); setDetail(null); setGeneratedPrompt(""); setGeneratedFingerprint(""); setMessage("");
    if (!id) return;
    setBusy(true);
    try { setDetail(await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "記事を読み込めませんでした。"); }
    finally { setBusy(false); }
  };

  const promptFingerprint = useMemo(() => detail ? JSON.stringify({ id: detail.id, revision: detail.revision, platform, goal, tone, maxCharacters, hashtags }) : "", [detail, goal, hashtags, maxCharacters, platform, tone]);
  const promptReady = Boolean(generatedPrompt) && generatedFingerprint === promptFingerprint;

  const generatePrompt = async () => {
    if (!detail || generateInFlightRef.current) return;

    const trimmedMax = maxCharacters.trim();
    let parsedMax: number | null = null;
    if (trimmedMax) {
      const candidate = Number(trimmedMax);
      if (!Number.isFinite(candidate) || candidate < 1 || candidate > 100000) {
        setMessage("編集上の文字数目安は1〜100000の数字で入力してください。無効な入力では利用回数を消費しません。");
        return;
      }
      parsedMax = Math.trunc(candidate);
    }

    generateInFlightRef.current = true; setGenerateBusy(true); setMessage("");
    try {
      const result = await consumeFreeTrialUsage(getSupabaseClient(), "sns_generate");
      if (!result.allowed) { setGeneratedPrompt(""); setGeneratedFingerprint(""); setMessage(trialUsageMessage(result)); return; }
      const prompt = buildSocialPrompt(detail, {
        platform, goal, tone,
        maxCharacters: parsedMax,
        hashtags,
      });
      setGeneratedPrompt(prompt); setGeneratedFingerprint(promptFingerprint);
      setMessage(result.bypassLimits ? "SNS投稿プロンプトを作成しました。" : `SNS投稿プロンプトを1回作成しました。${trialUsageMessage(result)}`);
    } catch (error) {
      setGeneratedPrompt(""); setGeneratedFingerprint("");
      setMessage(error instanceof Error ? error.message : "SNS投稿作成の利用回数を確認できませんでした。");
    } finally { generateInFlightRef.current = false; setGenerateBusy(false); }
  };

  const copy = async () => {
    if (!promptReady) return;
    try { await navigator.clipboard.writeText(generatedPrompt); setMessage("SNS投稿生成プロンプトをコピーしました。"); }
    catch { setMessage("自動コピーできません。テキスト欄からコピーしてください。"); }
  };

  if (gate.kind !== "ready") return (
    <main className="standalone-page"><section className="standalone-card">
      <p className="eyebrow">SNS CONTENT</p><h1>SNS投稿作成</h1>
      {gate.kind === "loading" && <p className="route-notice">記事ライブラリを確認しています…</p>}
      {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
      {gate.kind === "denied" && <p className="route-notice error">{gate.message}</p>}
      {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
      <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
    </section></main>
  );

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">SNS CONTENT</p><h1>記事からSNS投稿を作る</h1><p>{gate.aasId} / SNSごとの投稿プロンプトを選択式で作成できます</p></div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>
      <ActiveWorkspacePresetBadge feature="sns" />
      <section className="creator-card">
        <div className="creator-form-grid">
          <label className="route-field full"><span>元記事</span><select value={articleId} onChange={(event) => void loadArticle(event.target.value)} disabled={busy || generateBusy}><option value="">記事を選択</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label>
          <label className="route-field"><span>SNS</span><select value={platform} onChange={(event) => changePlatform(event.target.value as SocialPlatform)}>{SOCIAL_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="route-field"><span>目的</span><select value={goal} onChange={(event) => setGoal(event.target.value as SocialGoal)}>{GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <PresetSelect label="トーン" value={tone} onChange={setTone} options={TONE_OPTIONS} customPlaceholder="例: 静かで落ち着いた専門家風" />
          <PresetSelect label="編集上の文字数目安" value={maxCharacters} onChange={setMaxCharacters} options={CHARACTER_LIMIT_OPTIONS} customPlaceholder="数字を入力（例: 2500）" customInputType="number" customMin={1} customMax={100000} />
          <label className="choice-card compact"><input type="checkbox" checked={hashtags} onChange={(event) => setHashtags(event.target.checked)} /><span><strong>ハッシュタグ候補を含める</strong></span></label>
        </div>

        <div className="route-notice">
          <strong>{socialPlatformLabel(platform)}を開く:</strong>{" "}
          <a href={socialPlatformUrl(platform)} target="_blank" rel="noreferrer">{socialPlatformLabel(platform)}を開く ↗</a>
          <div><small>{socialLaunchHint()}</small></div>
        </div>

        {detail && <>
          <div className="route-notice"><strong>選択中:</strong> {detail.title}</div>
          <p className="panel-muted">記事選択やSNS条件の変更だけでは回数を消費しません。「SNS投稿プロンプトを作成」を押した時だけSNS生成1回として記録されます。</p>
          <button className="primary-action" type="button" disabled={generateBusy} onClick={() => void generatePrompt()}>{generateBusy ? "利用回数を確認中…" : promptReady ? "SNS投稿プロンプトを作り直す" : "SNS投稿プロンプトを作成"}</button>
          {promptReady && <>
            <label className="route-field"><span>AI用SNS投稿プロンプト</span><textarea className="prompt-area large" readOnly value={generatedPrompt} /></label>
            <button className="secondary-action" type="button" onClick={() => void copy()}>プロンプトをコピー</button>
            <p className="beginner-help">生成後のコピーでは追加消費しません。条件を変えて作り直した時だけ次の1回として記録されます。</p>
          </>}
        </>}
        {!detail && articles.length === 0 && <p className="panel-muted">記事ライブラリに記事がありません。先に記事を作成してください。</p>}
        {message && <div className="route-notice">{message}</div>}
      </section>
    </main>
  );
}
