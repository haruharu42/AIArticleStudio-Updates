"use client";

import { useEffect, useMemo, useState } from "react";

import { OPENAI_LINKS } from "@/lib/openai-links";
import {
  getCloudArticleDetail,
  listCloudArticles,
  type ArticleDetail,
  type ArticleSummary,
} from "@/lib/phase7-articles";
import {
  buildImagePromptPlan,
  type ImagePromptItem,
} from "@/lib/phase13-image-prompts";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

type PublicationTarget = "note" | "tips" | "brain" | "blog";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function boolValue(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function integerValue(value: unknown, fallback: number): number { return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback; }
function publicationTarget(value: string): PublicationTarget { return value === "note" || value === "tips" || value === "brain" || value === "blog" ? value : "note"; }

export function Phase13ImagePromptPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [theme, setTheme] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [gender, setGender] = useState("");
  const [coverEnabled, setCoverEnabled] = useState(true);
  const [inlineEnabled, setInlineEnabled] = useState(false);
  const [inlineCount, setInlineCount] = useState(2);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) { setGate({ kind: "signed_out" }); return; }
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,status")
          .eq("id", user.id)
          .single();
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
    setDetail(null); setMessage("");
    if (!articleId) return;
    setBusy(true);
    try {
      const next = await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, articleId);
      const request = next.workspace.requestJson;
      const plan = next.workspace.imagePlanJson;
      const cover = objectValue(plan.cover);
      const inline = objectValue(plan.inline);
      setDetail(next);
      setTheme(stringValue(request.theme) || next.title);
      setAgeGroup(stringValue(request.age_group));
      setGender(stringValue(request.gender));
      setCoverEnabled(boolValue(cover.enabled, true));
      setInlineEnabled(boolValue(inline.enabled, false));
      setInlineCount(Math.max(1, Math.min(10, integerValue(inline.count, 2))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const prompts = useMemo<ImagePromptItem[]>(() => {
    if (!detail) return [];
    return buildImagePromptPlan({
      title: detail.title,
      theme,
      publicationTarget: publicationTarget(detail.publicationTarget),
      genre: detail.genre || "",
      subgenre: detail.subgenre || "",
      ageGroup,
      gender,
      coverEnabled,
      inlineEnabled,
      inlineCount,
    });
  }, [ageGroup, coverEnabled, detail, gender, inlineCount, inlineEnabled, theme]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("画像生成プロンプトをコピーしました。次にChatGPT Imagesを開いて貼り付けてください。");
    } catch {
      setMessage("自動コピーできません。テキスト欄からコピーしてください。");
    }
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">IMAGE PLAN · PHASE 13</p><h1>画像生成計画</h1>
        {gate.kind === "loading" && <p className="route-notice">記事ライブラリを確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
      </section></main>
    );
  }

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">IMAGE PLAN · PHASE 13</p>
          <h1>記事から画像生成プロンプトを作る</h1>
          <p>{gate.aasId} / アイキャッチと挿絵を同じ世界観で設計</p>
        </div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>

      <section className="creator-card">
        <label className="route-field">
          <span>元記事</span>
          <select defaultValue="" onChange={(event) => void choose(event.target.value)} disabled={busy}>
            <option value="">記事を選択</option>
            {articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}
          </select>
        </label>

        {detail && (
          <>
            <dl className="route-meta">
              <div><dt>タイトル</dt><dd>{detail.title}</dd></div>
              <div><dt>掲載先</dt><dd>{detail.publicationTarget}</dd></div>
              <div><dt>ジャンル</dt><dd>{detail.genre || "未指定"}</dd></div>
              <div><dt>revision</dt><dd>{detail.revision}</dd></div>
            </dl>

            <div className="creator-form-grid">
              <label className="route-field full"><span>画像へ反映するテーマ</span><textarea value={theme} onChange={(event) => setTheme(event.target.value)} /></label>
              <label className="route-field"><span>対象年齢</span><input value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)} /></label>
              <label className="route-field"><span>対象性別</span><input value={gender} onChange={(event) => setGender(event.target.value)} /></label>
              <label className="choice-card compact"><input type="checkbox" checked={coverEnabled} onChange={(event) => setCoverEnabled(event.target.checked)} /><span><strong>アイキャッチを作る</strong></span></label>
              <label className="choice-card compact"><input type="checkbox" checked={inlineEnabled} onChange={(event) => setInlineEnabled(event.target.checked)} /><span><strong>挿絵を作る</strong></span></label>
              {inlineEnabled && <label className="route-field"><span>挿絵枚数</span><input type="number" min={1} max={10} value={inlineCount} onChange={(event) => setInlineCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} /></label>}
            </div>

            <div className="image-prompt-list">
              {prompts.map((item) => (
                <article className="image-prompt-card" key={`${item.kind}-${item.order}`}>
                  <header>
                    <div><span>{item.kind === "cover" ? "アイキャッチ" : `挿絵 ${item.order}`}</span>{item.insertionMarker && <small>{`<!-- ${item.insertionMarker} -->`}</small>}</div>
                    <div className="image-prompt-actions">
                      <button className="secondary-action" type="button" onClick={() => void copy(item.prompt)}>コピー</button>
                      <a className="openai-launch-action" href={OPENAI_LINKS.images} target="_blank" rel="noreferrer">ChatGPT Imagesを開く ↗</a>
                    </div>
                  </header>
                  <textarea className="prompt-area" readOnly value={item.prompt} />
                </article>
              ))}
            </div>

            {prompts.length === 0 && <p className="route-notice">アイキャッチまたは挿絵をONにしてください。</p>}
          </>
        )}

        {articles.length === 0 && <p className="panel-muted">記事がありません。先に記事を作成してください。</p>}
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">この画面は画像生成プロンプトを作成します。プロンプトをコピーして公式のChatGPT Imagesで生成し、完成画像は記事ライブラリの画像管理から保存できます。</p>
      </section>
    </main>
  );
}
