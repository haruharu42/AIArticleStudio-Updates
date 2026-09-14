"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadOpsSnapshot,
  probeWorkerHealth,
  runOpsSecurityAudit,
  setOpsEventStatus,
  type OpsEventStatus,
  type OpsSnapshot,
} from "@/lib/operations-admin";
import { getSupabaseClient } from "@/lib/supabase";

type Gate = { kind: "loading" } | { kind: "signed_out" } | { kind: "denied" } | { kind: "ready"; aasId: string } | { kind: "error"; message: string };
type SeverityFilter = "all" | "critical" | "error" | "warning" | "info";
type StatusFilter = "all" | OpsEventStatus;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function healthLabel(value: string): string {
  if (value === "healthy" || value === "passed") return "正常";
  if (value === "warning") return "警告";
  if (value === "error" || value === "failed") return "異常";
  if (value === "running") return "監査中";
  return "未確認";
}

function severityLabel(value: string): string {
  if (value === "critical") return "Critical";
  if (value === "error") return "Error";
  if (value === "warning") return "Warning";
  return "Info";
}

export function OperationsAdminPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null);
  const [worker, setWorker] = useState<{ ok: boolean; latencyMs: number; checkedAt: string } | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const client = getSupabaseClient();
    const [nextSnapshot, nextWorker] = await Promise.all([loadOpsSnapshot(client), probeWorkerHealth()]);
    setSnapshot(nextSnapshot);
    setWorker(nextWorker);
  }, []);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) { setGate({ kind: "signed_out" }); return; }
        const { data: profile, error: profileError } = await client.from("profiles").select("id,aas_user_id,role,status").eq("id", user.id).single();
        if (profileError || !profile || profile.id !== user.id) throw new Error("管理者プロフィールを確認できません。");
        if (profile.role !== "admin" || profile.status !== "active") { setGate({ kind: "denied" }); return; }
        await refresh();
        if (active) setGate({ kind: "ready", aasId: profile.aas_user_id });
      } catch (error) {
        if (active) setGate({ kind: "error", message: error instanceof Error ? error.message : "Security & Operationsを初期化できませんでした。" });
      }
    };
    void boot();
    const timer = window.setInterval(() => { if (active) void refresh().catch(() => undefined); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  const sources = useMemo(() => [...new Set((snapshot?.events ?? []).map((event) => event.source))].sort(), [snapshot]);
  const events = useMemo(() => (snapshot?.events ?? []).filter((event) => {
    if (severityFilter !== "all" && event.severity !== severityFilter) return false;
    if (statusFilter !== "all" && event.status !== statusFilter) return false;
    if (sourceFilter !== "all" && event.source !== sourceFilter) return false;
    return true;
  }), [snapshot, severityFilter, statusFilter, sourceFilter]);

  const runAudit = async () => {
    setBusy(true); setMessage("");
    try {
      await runOpsSecurityAudit(getSupabaseClient());
      await refresh();
      setMessage("セキュリティ監査を実行し、最新状態へ更新しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "監査を実行できませんでした。");
    } finally { setBusy(false); }
  };

  const updateEvent = async (eventId: string, status: OpsEventStatus) => {
    setBusy(true); setMessage("");
    try {
      await setOpsEventStatus(getSupabaseClient(), eventId, status, resolutionNotes[eventId]);
      await refresh();
      setMessage(status === "resolved" ? "イベントを解決済みにしました。" : status === "acknowledged" ? "イベントを確認済みにしました。" : "イベントを再オープンしました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "イベントを更新できませんでした。");
    } finally { setBusy(false); }
  };

  if (gate.kind !== "ready") {
    return <main className="standalone-page"><section className="standalone-card">
      <p className="eyebrow">SECURITY & OPERATIONS</p><h1>セキュリティ・運用</h1>
      {gate.kind === "loading" && <p className="route-notice">管理者権限と監視状態を確認しています…</p>}
      {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
      {gate.kind === "denied" && <p className="route-notice error">active管理者のみ利用できます。</p>}
      {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
      <a className="route-back" href="/admin">← 管理ダッシュボード</a>
    </section></main>;
  }

  const counts = snapshot?.counts ?? { open: 0, critical: 0, error: 0, warning: 0 };
  const latestRun = snapshot?.runs[0] ?? null;
  const overall = counts.critical > 0 || counts.error > 0 || latestRun?.status === "failed" || worker?.ok === false ? "error" : counts.warning > 0 || latestRun?.status === "warning" ? "warning" : "healthy";

  return (
    <main className="admin-page ops-admin-page">
      <header className="admin-head admin-dashboard-head">
        <div><p className="eyebrow">SECURITY & OPERATIONS CENTER</p><h1>セキュリティ・運用</h1><p>{gate.aasId} / エラー・セキュリティイベント・定期監査・システム状態をまとめて確認します。</p></div>
        <div className="admin-head-actions"><button className="primary-action" disabled={busy} type="button" onClick={() => void runAudit()}>{busy ? "監査中…" : "今すぐ監査"}</button><a className="route-back" href="/admin">← 管理ダッシュボード</a></div>
      </header>
      {message && <div className="route-notice" role="status">{message}</div>}

      <section className={`ops-overall ops-${overall}`}><div><span>現在の状態</span><strong>{healthLabel(overall)}</strong></div><p>監視イベントは発生時に集約記録し、DB/Storage/RPC権限は1時間ごとに自動監査します。管理画面は60秒ごとに更新します。</p></section>

      <section className="ops-count-grid" aria-label="未解決イベント件数">
        <article><span>未解決</span><strong>{counts.open}</strong></article><article className="critical"><span>Critical</span><strong>{counts.critical}</strong></article><article className="error"><span>Error</span><strong>{counts.error}</strong></article><article className="warning"><span>Warning</span><strong>{counts.warning}</strong></article>
      </section>

      <section className="admin-panel admin-dashboard-section">
        <div className="admin-panel-heading"><div><p className="eyebrow">HEALTH</p><h2>システムヘルス</h2></div><button className="secondary-action" disabled={busy} type="button" onClick={() => void refresh().catch(() => setMessage("状態を更新できませんでした。"))}>更新</button></div>
        <div className="ops-health-grid">
          <article className={`ops-health-card ops-${worker?.ok ? "healthy" : worker ? "error" : "unknown"}`}><span>Cloudflare Worker</span><strong>{worker ? (worker.ok ? "正常" : "異常") : "確認中"}</strong><small>{worker ? `${worker.latencyMs} ms / ${formatDate(worker.checkedAt)}` : "—"}</small></article>
          {(snapshot?.health ?? []).map((item) => <article key={item.component} className={`ops-health-card ops-${item.status}`}><span>{item.component}</span><strong>{healthLabel(item.status)}</strong><small>{item.message}</small><small>{formatDate(item.checkedAt)}</small></article>)}
        </div>
      </section>

      <section className="admin-panel admin-dashboard-section">
        <div className="admin-panel-heading"><div><p className="eyebrow">EVENTS</p><h2>エラー・セキュリティログ</h2></div><span className="admin-count-badge">{events.length} 件</span></div>
        <div className="ops-filter-grid">
          <label className="route-field"><span>重大度</span><select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}><option value="all">すべて</option><option value="critical">Critical</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Info</option></select></label>
          <label className="route-field"><span>状態</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}><option value="all">すべて</option><option value="open">未解決</option><option value="acknowledged">確認済み</option><option value="resolved">解決済み</option></select></label>
          <label className="route-field"><span>発生元</span><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="all">すべて</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
        </div>
        <div className="ops-event-list">
          {events.map((event) => <article key={event.id} className={`ops-event ops-${event.severity}`}>
            <header><div><span className="ops-severity">{severityLabel(event.severity)}</span><strong>{event.errorCode}</strong><small>{event.source}{event.feature ? ` / ${event.feature}` : ""}</small></div><span className={`ops-event-status status-${event.status}`}>{event.status === "open" ? "未解決" : event.status === "acknowledged" ? "確認済み" : "解決済み"}</span></header>
            <p>{event.message}</p>
            <dl><div><dt>回数</dt><dd>{event.occurrenceCount}</dd></div><div><dt>最終</dt><dd>{formatDate(event.lastSeenAt)}</dd></div><div><dt>初回</dt><dd>{formatDate(event.firstSeenAt)}</dd></div>{event.route && <div><dt>Route</dt><dd>{event.route}</dd></div>}{event.lastAasUserId && <div><dt>AAS ID</dt><dd>{event.lastAasUserId}</dd></div>}{event.requestId && <div><dt>Request</dt><dd>{event.requestId}</dd></div>}</dl>
            {event.status !== "resolved" && <label className="route-field"><span>解決メモ（任意）</span><input value={resolutionNotes[event.id] ?? ""} onChange={(e) => setResolutionNotes((current) => ({ ...current, [event.id]: e.target.value.slice(0, 500) }))} placeholder="原因・対応内容" /></label>}
            <div className="admin-actions">{event.status === "open" && <button disabled={busy} className="secondary-action" type="button" onClick={() => void updateEvent(event.id, "acknowledged")}>確認済みにする</button>}{event.status !== "resolved" && <button disabled={busy} className="primary-action" type="button" onClick={() => void updateEvent(event.id, "resolved")}>解決済みにする</button>}{event.status === "resolved" && <button disabled={busy} className="secondary-action" type="button" onClick={() => void updateEvent(event.id, "open")}>再オープン</button>}</div>
          </article>)}
          {!events.length && <div className="admin-empty-state compact"><strong>条件に一致するイベントはありません。</strong><span>重大な問題がない場合、この一覧は空のままです。</span></div>}
        </div>
      </section>

      <section className="admin-panel admin-dashboard-section">
        <div className="admin-panel-heading"><div><p className="eyebrow">AUDIT</p><h2>最新セキュリティ監査</h2></div><span className={`admin-count-badge ${latestRun?.status === "failed" ? "alert" : ""}`}>{latestRun ? healthLabel(latestRun.status) : "未実行"}</span></div>
        {latestRun && <p className="ops-audit-summary">{formatDate(latestRun.startedAt)} / Critical {latestRun.criticalCount} · Error {latestRun.errorCount} · Warning {latestRun.warningCount} · Info {latestRun.infoCount}</p>}
        <div className="ops-finding-list">{(snapshot?.findings ?? []).map((finding) => <article key={finding.id} className={`ops-finding ops-${finding.severity}`}><header><span>{severityLabel(finding.severity)}</span><strong>{finding.title}</strong><code>{finding.checkCode}</code></header><p>{finding.detail}</p>{finding.objectName && <small>対象: {finding.objectName}</small>}{finding.remediation && <small>対応: {finding.remediation}</small>}</article>)}</div>
        {latestRun && !(snapshot?.findings.length) && <div className="admin-empty-state compact"><strong>最新監査で指摘事項はありません。</strong><span>RLS・RPC権限・Storage・スケジューラの基本検査を通過しています。</span></div>}
      </section>

      <section className="admin-panel admin-dashboard-section">
        <div className="admin-panel-heading"><div><p className="eyebrow">HISTORY</p><h2>監査履歴</h2></div></div>
        <div className="ops-run-list">{(snapshot?.runs ?? []).map((run) => <div key={run.id}><span>{formatDate(run.startedAt)}</span><strong>{healthLabel(run.status)}</strong><small>{run.source} / C{run.criticalCount} E{run.errorCount} W{run.warningCount}</small></div>)}</div>
      </section>

      <section className="ops-privacy-note"><strong>ログのプライバシー保護</strong><p>パスワード、Cookie、Authorization、Access/Refresh Token、Stripe/Supabase秘密鍵、カード情報、記事本文、AIプロンプト全文は保存対象外です。ログは90日を基準に整理し、解決済みの古いイベントは定期監査時に削除します。</p></section>
    </main>
  );
}
