"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";

import { loadContentAnalytics, type ContentAnalytics } from "@/lib/phase17-analytics";

const statusLabel: Record<string, string> = {
  draft: "下書き",
  writing: "執筆中",
  ready: "完成",
  waiting_publish: "公開待ち",
  published: "公開済み",
  on_hold: "保留",
  archived: "アーカイブ",
};

export function Phase17AnalyticsPage() {
  const { state: accessState, client } = useSharedAccessState();
  const [analytics, setAnalytics] = useState<ContentAnalytics | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (accessState.kind !== "ready" || !client) return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLoadError("");
        setAnalytics(null);
      }
    });
    void loadContentAnalytics(client, accessState.profile.id).then(
      (next) => {
        if (active) setAnalytics(next);
      },
      (error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "集計を取得できませんでした。");
      },
    );
    return () => { active = false; };
  }, [accessState, client]);

  if (accessState.kind !== "ready" || !client) {
    if (accessState.kind === "loading") return null;
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">CONTENT ANALYTICS</p><h1>コンテンツ分析</h1>
        {accessState.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {accessState.kind === "unavailable" && <p className="route-notice error">AASへ接続できませんでした。通信状態を確認してください。</p>}
        {accessState.kind !== "signed_out" && accessState.kind !== "unavailable" && <p className="route-notice error">現在のアカウント状態では利用できません。</p>}
        <Link className="route-back" href="/tools">← 機能一覧へ戻る</Link>
      </section></main>
    );
  }

  if (!analytics) {
    if (!loadError) return null;
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">CONTENT ANALYTICS</p><h1>コンテンツ分析</h1>
        <p className="route-notice error">{loadError}</p>
        <Link className="route-back" href="/tools">← 機能一覧へ戻る</Link>
      </section></main>
    );
  }

  const a = analytics;
  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">CONTENT ANALYTICS</p><h1>コンテンツ分析</h1><p>{accessState.profile.aas_user_id} / AASに保存されている記事の状態を分かりやすく集計します</p></div>
        <Link className="route-back" href="/tools">← 機能一覧</Link>
      </header>
      <section className="analytics-grid">
        <article className="metric-card"><span>記事ストック</span><strong>{a.currentArticles}</strong><small>{a.unlimited ? "上限なし" : `上限 ${a.maxArticles ?? "—"} / 残り ${a.remainingArticles ?? "—"}`}</small></article>
        <article className="metric-card"><span>公開済み</span><strong>{a.statusCounts.published ?? 0}</strong><small>記事ストック内 {a.publishedRate}%</small></article>
        <article className="metric-card"><span>公開準備</span><strong>{a.readyOrWaiting}</strong><small>完成 + 公開待ち</small></article>
        <article className="metric-card"><span>執筆中</span><strong>{(a.statusCounts.writing ?? 0) + (a.statusCounts.draft ?? 0)}</strong><small>下書き + 執筆中</small></article>
      </section>
      <section className="admin-grid analytics-sections">
        <article className="admin-panel"><h2>掲載先別</h2><div className="analytics-list">{Object.entries(a.publicationCounts).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div></article>
        <article className="admin-panel"><h2>状態別</h2><div className="analytics-list">{Object.entries(a.statusCounts).map(([key, value]) => <div key={key}><span>{statusLabel[key] ?? key}</span><strong>{value}</strong></div>)}</div></article>
      </section>
      <section className="admin-panel analytics-recent">
        <h2>最近更新した記事</h2>
        <div className="analytics-list">{a.recent.map((article) => <div key={article.id}><span>{article.title}</span><strong>{statusLabel[article.status] ?? article.status}</strong></div>)}</div>
        {a.recent.length === 0 && <p className="panel-muted">記事がまだありません。</p>}
      </section>
      <p className="analytics-note">ここではAAS内の記事件数・掲載先・状態を集計しています。閲覧数・売上・SNS反応など外部サービスの実績値は、連携されるまで表示しません。</p>
    </main>
  );
}
