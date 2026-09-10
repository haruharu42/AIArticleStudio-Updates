"use client";

import { useEffect, useState } from "react";

import { loadContentAnalytics, type ContentAnalytics } from "@/lib/phase17-analytics";
import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; aasId: string; analytics: ContentAnalytics }
  | { kind: "error"; message: string };

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
  const [gate, setGate] = useState<Gate>({ kind: "loading" });

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
        const analytics = await loadContentAnalytics(client, user.id);
        if (active) setGate({ kind: "ready", aasId: profile.aas_user_id, analytics });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "集計を取得できませんでした。" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">ANALYTICS · PHASE 17</p><h1>コンテンツ分析</h1>
        {gate.kind === "loading" && <p className="route-notice">記事集計を作成しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        <a className="route-back" href="/tools">← 機能一覧へ戻る</a>
      </section></main>
    );
  }

  const a = gate.analytics;
  return (
    <main className="creator-page">
      <header className="creator-head">
        <div><p className="eyebrow">ANALYTICS · PHASE 17</p><h1>コンテンツ分析</h1><p>{gate.aasId} / 現在保存されている記事の内部集計</p></div>
        <a className="route-back" href="/tools">← 機能一覧</a>
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
      <p className="analytics-note">この画面はAAS内部の記事件数・状態だけを集計しています。閲覧数・売上・SNS反応など外部サービスの実績値は、データ連携するまで表示しません。</p>
    </main>
  );
}
