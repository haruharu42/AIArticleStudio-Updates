"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SecurityRepairPrompt, type SecurityRepairPromptDetail } from "@/components/security-repair-prompt";
import { loadOpsSnapshot, probeWorkerHealth, type OpsSnapshot } from "@/lib/operations-admin";
import { getSupabaseClient } from "@/lib/supabase";

export function OperationsSecurityRepairPrompt({
  snapshot,
  worker,
}: {
  snapshot: OpsSnapshot | null;
  worker: { ok: boolean; latencyMs: number; checkedAt: string } | null;
}) {
  const problem = useMemo(() => {
    const details: SecurityRepairPromptDetail[] = [];
    const openEvents = (snapshot?.events ?? []).filter(
      (event) => event.status !== "resolved" && (event.severity === "critical" || event.severity === "error" || event.severity === "warning"),
    );
    const findings = (snapshot?.findings ?? []).filter(
      (finding) => finding.severity === "critical" || finding.severity === "error" || finding.severity === "warning",
    );
    const latestRun = snapshot?.runs[0] ?? null;

    if (worker?.ok === false) {
      details.push({ label: "Cloudflare Worker", value: `異常 / latency ${worker.latencyMs} ms` });
    }

    for (const event of openEvents.slice(0, 10)) {
      details.push({
        label: `イベント ${event.severity.toUpperCase()} ${event.errorCode || event.eventKind}`,
        value: [
          event.source,
          event.feature,
          event.route,
          event.message,
          `occurrences=${event.occurrenceCount}`,
          `last_seen=${event.lastSeenAt}`,
        ].filter(Boolean).join(" / "),
      });
    }

    for (const finding of findings.slice(0, 10)) {
      details.push({
        label: `監査 ${finding.severity.toUpperCase()} ${finding.checkCode}`,
        value: [finding.category, finding.title, finding.objectName, finding.detail, finding.remediation].filter(Boolean).join(" / "),
      });
    }

    if (latestRun?.status === "failed" || latestRun?.status === "warning") {
      details.push({
        label: "最新監査",
        value: `${latestRun.status} / Critical ${latestRun.criticalCount} / Error ${latestRun.errorCount} / Warning ${latestRun.warningCount}`,
      });
    }

    const hasProblem = worker?.ok === false || openEvents.length > 0 || findings.length > 0 || latestRun?.status === "failed" || latestRun?.status === "warning";
    if (!hasProblem) return null;

    const summary = [
      openEvents.length ? `未解決イベント ${openEvents.length}件` : null,
      findings.length ? `監査指摘 ${findings.length}件` : null,
      worker?.ok === false ? "Cloudflare Worker異常" : null,
      latestRun?.status === "failed" ? "最新監査失敗" : latestRun?.status === "warning" ? "最新監査警告" : null,
    ].filter(Boolean).join(" / ");

    return { summary, details };
  }, [snapshot, worker]);

  if (!problem) return null;

  return (
    <SecurityRepairPrompt
      context="管理者 Security & Operations (/admin/operations)"
      summary={problem.summary}
      details={problem.details}
    />
  );
}

export function OperationsSecurityRepairPanel() {
  const [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null);
  const [worker, setWorker] = useState<{ ok: boolean; latencyMs: number; checkedAt: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextSnapshot, nextWorker] = await Promise.all([
        loadOpsSnapshot(getSupabaseClient()),
        probeWorkerHealth(),
      ]);
      setSnapshot(nextSnapshot);
      setWorker(nextWorker);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Security & Operations情報を取得できませんでした。");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (loadError) {
    return (
      <div className="admin-page" style={{ paddingBottom: 0 }}>
        <SecurityRepairPrompt
          context="管理者 Security & Operations (/admin/operations)"
          summary={loadError}
          details={[{ label: "画面", value: "/admin/operations" }]}
        />
      </div>
    );
  }

  const hasProblem = worker?.ok === false
    || (snapshot?.events ?? []).some((event) => event.status !== "resolved" && event.severity !== "info")
    || (snapshot?.findings ?? []).some((finding) => finding.severity !== "info")
    || snapshot?.runs[0]?.status === "failed"
    || snapshot?.runs[0]?.status === "warning";

  if (!hasProblem) return null;

  return (
    <div className="admin-page" style={{ paddingBottom: 0 }}>
      <OperationsSecurityRepairPrompt snapshot={snapshot} worker={worker} />
    </div>
  );
}
