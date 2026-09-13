"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getCloudArticleDetail,
  listCloudArticles,
  type ArticleDetail,
  type ArticleSummary,
} from "@/lib/phase7-articles";
import { buildSocialPrompt, type SocialGoal, type SocialPlatform } from "@/lib/phase14-sns";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied"; message: string }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

export function Phase14SnsPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [articleId, setArticleId] = useState("");
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform>("x");
  const [goal, setGoal] = useState<SocialGoal>("article_traffic");
  const [tone, setTone] = useState("親しみやすく具体的");
  const [maxCharacters, setMaxCharacters] = useState("140");
  const [hashtags, setHashtags] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) {
          setGate({ kind: "signed_out" });
          return;
        }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,status")
          .eq("id", user.id)
          .single();
        if (profileError || !profile || profile.id !== user.id) {
          throw new Error("プロフィールを確認できません。");
        }
        if (profile.status !== "active") {
          setGate({ kind: "denied", message: "activeアカウントが必要です。" });
          return;
        }
        const next = await listCloudArticles(client, user.id, 200);
        if (!active) return;
        setArticles(next);
        setGate({ kind: "ready", ownerId: user.id, aasId: profile.aas_user_id });
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
    return () => { active = false; };
  }, []);

  const loadArticle = async (id: string) => {
    if (gate.kind !== "ready") return;
    setArticleId(id);
    setDetail(null);
    setMessage("");
    if (!id) return;
    setBusy(true);
    try {
      setDetail(await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const prompt = useMemo(() => {
    if (!detail) return "";
    const parsedMax = maxCharacters.trim() ? Number(maxCharacters) : null;
    return buildSocialPrompt(detail, {
      platform,
      goal,
      tone,
      maxCharacters:
        parsedMax !== null && Number.isFinite(parsedMax) && parsedMax > 0
          ? Math.trunc(parsedMax)
          : null,
      hashtags,
    });
  }, [detail, goal, hashtags, maxCharacters, platform, tone]);

  const copy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("SNS投稿生成プロンプトをコピーしました。");
    } catch {
      setMessage("自動コピーできません。テキスト欄からコピーしてください。");
    }
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">SNS CONTENT</p><h1>SNS投稿作成</h1>
        {gate.kind === "loading" && <p className="route-notice">記事ライブラリを確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {gate.kind === "denied" && <p className="route-notice error">{gate.message}</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
      </section></main>
    );
  }

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">SNS CONTENT</p><h1>記事からSNS投稿を作る</h1><p>{gate.aasId} / X・Instagram・Threads向けの投稿プロンプトを作成できます</p></div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>
      <section className="creator-card">
        <div className="creator-form-grid">
          <label className="route-field full"><span>元記事</span><select value={articleId} onChange={(event) => void loadArticle(event.target.value)} disabled={busy}><option value="">記事を選択</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label>
          <label className="route-field"><span>SNS</span><select value={platform} onChange={(event) => setPlatform(event.target.value as SocialPlatform)}><option value="x">X</option><option value="instagram">Instagram</option><option value="threads">Threads</option></select></label>
          <label className="route-field"><span>目的</span><select value={goal} onChange={(event) => setGoal(event.target.value as SocialGoal)}><option value="article_traffic">記事への導線</option><option value="engagement">交流・反応</option><option value="product_interest">有料コンテンツへの関心</option></select></label>
          <label className="route-field"><span>トーン</span><input value={tone} onChange={(event) => setTone(event.target.value)} /></label>
          <label className="route-field"><span>編集上の文字数目安（任意）</span><input type="number" min={1} max={10000} value={maxCharacters} onChange={(event) => setMaxCharacters(event.target.value)} /></label>
          <label className="choice-card compact"><input type="checkbox" checked={hashtags} onChange={(event) => setHashtags(event.target.checked)} /><span><strong>ハッシュタグ候補を含める</strong></span></label>
        </div>
        {detail && (
          <>
            <div className="route-notice"><strong>選択中:</strong> {detail.title}</div>
            <label className="route-field"><span>AI用SNS投稿プロンプト</span><textarea className="prompt-area large" readOnly value={prompt} /></label>
            <button className="primary-action" type="button" onClick={() => void copy()}>プロンプトをコピー</button>
          </>
        )}
        {!detail && articles.length === 0 && <p className="panel-muted">記事ライブラリに記事がありません。先に記事を作成してください。</p>}
        {message && <div className="route-notice">{message}</div>}
      </section>
    </main>
  );
}
