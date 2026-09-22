"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";

import {
  getCloudArticleDetail,
  listCloudArticles,
  type ArticleDetail,
  type ArticleSummary,
} from "@/lib/phase7-articles";
import { savePublicationState, type PublicationUpdate } from "@/lib/phase16-publish";
import { getSupabaseClient } from "@/lib/supabase";

function localInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function Phase16PublishPage() {
  const { state: accessState, client } = useSharedAccessState();
  const [loadError, setLoadError] = useState("");
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [status, setStatus] = useState<PublicationUpdate["status"]>("ready");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reloadList = async () => {
    if (accessState.kind !== "ready" || !client) return;
    setArticles(await listCloudArticles(client, accessState.profile.id, 200));
  };

  useEffect(() => {
    if (accessState.kind !== "ready" || !client) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setLoadError("");
    });
    void listCloudArticles(client, accessState.profile.id, 200).then(
      (next) => {
        if (active) setArticles(next);
      },
      (error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "記事一覧を読み込めませんでした。");
      },
    );
    return () => { active = false; };
  }, [accessState, client]);

  const choose = async (articleId: string) => {
    if (accessState.kind !== "ready" || !client) return;
    setDetail(null);
    setMessage("");
    if (!articleId) return;
    setBusy(true);
    try {
      const next = await getCloudArticleDetail(client, accessState.profile.id, articleId);
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
    if (accessState.kind !== "ready" || !client || !detail) return;
    setBusy(true);
    setMessage("");
    try {
      await savePublicationState(client, accessState.profile.id, detail, {
        status,
        scheduledAt: scheduledAt || null,
        publishedAt: publishedAt || null,
        publishedUrl: publishedUrl || null,
      });
      const refreshed = await getCloudArticleDetail(client, accessState.profile.id, detail.id);
      setDetail(refreshed);
      setScheduledAt(localInput(refreshed.scheduledAt));
      setPublishedAt(localInput(refreshed.publishedAt));
      setPublishedUrl(refreshed.publishedUrl || "");
      await reloadList();
      setMessage(`公開状態を保存しました。revision ${refreshed.revision}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "公開状態を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  if (accessState.kind !== "ready" || !client) {
    if (accessState.kind === "loading") return null;
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">PUBLISHING</p><h1>公開管理</h1>
        {accessState.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {accessState.kind === "unavailable" && <p className="route-notice error">AASへ接続できませんでした。通信状態を確認してください。</p>}
        {accessState.kind !== "signed_out" && accessState.kind !== "unavailable" && <p className="route-notice error">現在のアカウント状態では利用できません。</p>}
        <Link className="route-back" href="/tools">← 機能一覧へ戻る</Link>
      </section></main>
    );
  }

  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">PUBLISHING</p><h1>記事の公開状態を管理</h1><p>{accessState.profile.aas_user_id} / note・Tips・Brain・ブログの公開情報を記事ライブラリと一緒に管理できます</p></div>
        <Link className="route-back" href="/tools">← 機能一覧</Link>
      </header>
      {loadError && <div className="route-notice error" role="alert">{loadError}</div>}
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
