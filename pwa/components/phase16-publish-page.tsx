"use client";

import { useEffect, useState } from "react";

import {
  getCloudArticleDetail,
  listCloudArticles,
  type ArticleDetail,
  type ArticleSummary,
} from "@/lib/phase7-articles";
import { savePublicationState, type PublicationUpdate } from "@/lib/phase16-publish";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; ownerId: string; aasId: string }
  | { kind: "error"; message: string };

function localInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function Phase16PublishPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [status, setStatus] = useState<PublicationUpdate["status"]>("ready");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reloadList = async (ownerId: string) => {
    setArticles(await listCloudArticles(getSupabaseClient(), ownerId, 200));
  };

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
        if (profileError || !profile || profile.id !== user.id || profile.status !== "active") {
          throw new Error("activeプロフィールを確認できません。");
        }
        await reloadList(user.id);
        if (active) setGate({ kind: "ready", ownerId: user.id, aasId: profile.aas_user_id });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "初期化に失敗しました。" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  const choose = async (articleId: string) => {
    if (gate.kind !== "ready") return;
    setDetail(null);
    setMessage("");
    if (!articleId) return;
    setBusy(true);
    try {
      const next = await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, articleId);
      setDetail(next);
      setStatus(
        next.status === "published" || next.status === "waiting_publish"
          ? next.status
          : "ready",
      );
      setScheduledAt(localInput(next.scheduledAt));
      setPublishedAt(localInput(next.publishedAt));
      setPublishedUrl(next.publishedUrl || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (gate.kind !== "ready" || !detail) return;
    setBusy(true);
    setMessage("");
    try {
      await savePublicationState(getSupabaseClient(), gate.ownerId, detail, {
        status,
        scheduledAt: scheduledAt || null,
        publishedAt: publishedAt || null,
        publishedUrl: publishedUrl || null,
      });
      const refreshed = await getCloudArticleDetail(getSupabaseClient(), gate.ownerId, detail.id);
      setDetail(refreshed);
      setScheduledAt(localInput(refreshed.scheduledAt));
      setPublishedAt(localInput(refreshed.publishedAt));
      setPublishedUrl(refreshed.publishedUrl || "");
      await reloadList(gate.ownerId);
      setMessage(`公開状態を保存しました。revision ${refreshed.revision}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "公開状態を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">PUBLISHING</p><h1>公開管理</h1>
        {gate.kind === "loading" && <p className="route-notice">記事を確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
      </section></main>
    );
  }

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">PUBLISHING</p><h1>記事の公開状態を管理</h1><p>{gate.aasId} / note・Tips・Brain・ブログの公開情報を記事ライブラリと一緒に管理できます</p></div>
        <a className="route-back" href="/tools">← 機能一覧</a>
      </header>
      <section className="creator-card">
        <label className="route-field"><span>記事</span><select defaultValue="" onChange={(event) => void choose(event.target.value)} disabled={busy}><option value="">選択してください</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title} / {article.status}</option>)}</select></label>
        {detail && (
          <>
            <dl className="route-meta"><div><dt>タイトル</dt><dd>{detail.title}</dd></div><div><dt>revision</dt><dd>{detail.revision}</dd></div><div><dt>掲載先</dt><dd>{detail.publicationTarget}</dd></div><div><dt>現在状態</dt><dd>{detail.status}</dd></div></dl>
            <div className="creator-form-grid">
              <label className="route-field"><span>公開状態</span><select value={status} onChange={(event) => setStatus(event.target.value as PublicationUpdate["status"])}><option value="ready">完成</option><option value="waiting_publish">公開待ち</option><option value="published">公開済み</option></select></label>
              {status === "waiting_publish" && <label className="route-field"><span>公開予定日時</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}
              {status === "published" && <><label className="route-field"><span>公開日時</span><input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /></label><label className="route-field full"><span>公開URL</span><input type="url" value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} placeholder="https://..." /></label></>}
            </div>
            <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "公開情報を保存"}</button>
          </>
        )}
        {message && <div className="route-notice">{message}</div>}
        <p className="panel-muted">この画面では公開予定・公開済みURL・公開日時を記録します。外部サービスへの自動投稿は行いません。</p>
      </section>
    </main>
  );
}
