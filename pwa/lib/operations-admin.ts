import type { SupabaseClient } from "@supabase/supabase-js";

export type OpsSeverity = "info" | "warning" | "error" | "critical";
export type OpsEventStatus = "open" | "acknowledged" | "resolved";
export type OpsHealthStatus = "healthy" | "warning" | "error" | "unknown";

export type OpsEvent = {
  id: string;
  eventKind: string;
  severity: OpsSeverity;
  source: string;
  errorCode: string;
  message: string;
  feature: string | null;
  route: string | null;
  requestId: string | null;
  lastAasUserId: string | null;
  status: OpsEventStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type OpsHealth = {
  component: string;
  status: OpsHealthStatus;
  message: string;
  checkedAt: string;
  latencyMs: number | null;
};

export type OpsAuditRun = {
  id: string;
  source: string;
  status: "running" | "passed" | "warning" | "failed";
  criticalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  startedAt: string;
  completedAt: string | null;
};

export type OpsFinding = {
  id: string;
  runId: string;
  checkCode: string;
  severity: OpsSeverity;
  category: string;
  title: string;
  detail: string;
  objectName: string | null;
  remediation: string | null;
  createdAt: string;
};

export type OpsCapacityMetric = {
  usedBytes: number;
  limitBytes: number | null;
  remainingBytes: number | null;
  percent: number | null;
};

export type OpsCapacity = {
  planLabel: string;
  warningPercent: number;
  dangerPercent: number;
  criticalPercent: number;
  database: OpsCapacityMetric;
  storage: OpsCapacityMetric & { objectCount: number };
  checkedAt: string;
};

export type OpsSnapshot = {
  counts: { open: number; critical: number; error: number; warning: number };
  events: OpsEvent[];
  health: OpsHealth[];
  runs: OpsAuditRun[];
  findings: OpsFinding[];
  capacity: OpsCapacity;
};

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (row: Row, key: string) => typeof row[key] === "string" ? row[key] as string : "";
const maybeText = (row: Row, key: string) => typeof row[key] === "string" ? row[key] as string : null;
const num = (row: Row, key: string) => typeof row[key] === "number" && Number.isFinite(row[key]) ? row[key] as number : 0;
const maybeNum = (row: Row, key: string) => typeof row[key] === "number" && Number.isFinite(row[key]) ? row[key] as number : null;
const list = (row: Row, key: string): unknown[] => Array.isArray(row[key]) ? row[key] as unknown[] : [];

function severity(value: string): OpsSeverity {
  return value === "critical" || value === "error" || value === "warning" ? value : "info";
}
function eventStatus(value: string): OpsEventStatus {
  return value === "resolved" || value === "acknowledged" ? value : "open";
}
function healthStatus(value: string): OpsHealthStatus {
  return value === "healthy" || value === "warning" || value === "error" ? value : "unknown";
}

function capacityMetric(row: Row): OpsCapacityMetric {
  return {
    usedBytes: num(row, "used_bytes"),
    limitBytes: maybeNum(row, "limit_bytes"),
    remainingBytes: maybeNum(row, "remaining_bytes"),
    percent: maybeNum(row, "percent"),
  };
}

function parseCapacity(value: unknown): OpsCapacity {
  const row = object(value);
  const database = object(row.database);
  const storage = object(row.storage);
  return {
    planLabel: text(row, "plan_label") || "未設定",
    warningPercent: num(row, "warning_percent") || 70,
    dangerPercent: num(row, "danger_percent") || 85,
    criticalPercent: num(row, "critical_percent") || 95,
    database: capacityMetric(database),
    storage: { ...capacityMetric(storage), objectCount: num(storage, "object_count") },
    checkedAt: text(row, "checked_at"),
  };
}

export async function loadOpsSnapshot(client: SupabaseClient): Promise<OpsSnapshot> {
  const { data, error } = await client.rpc("admin_ops_get_snapshot", { p_limit: 120 });
  if (error) throw new Error("Security & Operations情報を取得できませんでした。");
  const root = object(data);
  const counts = object(root.counts);
  return {
    counts: {
      open: num(counts, "open"),
      critical: num(counts, "critical"),
      error: num(counts, "error"),
      warning: num(counts, "warning"),
    },
    events: list(root, "events").map((value) => {
      const row = object(value);
      return {
        id: text(row, "id"), eventKind: text(row, "event_kind"), severity: severity(text(row, "severity")),
        source: text(row, "source"), errorCode: text(row, "error_code"), message: text(row, "message"),
        feature: maybeText(row, "feature"), route: maybeText(row, "route"), requestId: maybeText(row, "request_id"),
        lastAasUserId: maybeText(row, "last_aas_user_id"), status: eventStatus(text(row, "status")),
        firstSeenAt: text(row, "first_seen_at"), lastSeenAt: text(row, "last_seen_at"), occurrenceCount: num(row, "occurrence_count"),
        resolvedAt: maybeText(row, "resolved_at"), resolutionNote: maybeText(row, "resolution_note"),
      };
    }).filter((item) => item.id),
    health: list(root, "health").map((value) => {
      const row = object(value);
      return { component: text(row, "component"), status: healthStatus(text(row, "status")), message: text(row, "message"), checkedAt: text(row, "checked_at"), latencyMs: row.latency_ms === null ? null : num(row, "latency_ms") };
    }).filter((item) => item.component),
    runs: list(root, "runs").map((value): OpsAuditRun => {
      const row = object(value);
      const valueStatus = text(row, "status");
      const status: OpsAuditRun["status"] = valueStatus === "passed" || valueStatus === "warning" || valueStatus === "failed" ? valueStatus : "running";
      return { id: text(row, "id"), source: text(row, "source"), status, criticalCount: num(row, "critical_count"), errorCount: num(row, "error_count"), warningCount: num(row, "warning_count"), infoCount: num(row, "info_count"), startedAt: text(row, "started_at"), completedAt: maybeText(row, "completed_at") };
    }).filter((item) => item.id),
    findings: list(root, "findings").map((value) => {
      const row = object(value);
      return { id: text(row, "id"), runId: text(row, "run_id"), checkCode: text(row, "check_code"), severity: severity(text(row, "severity")), category: text(row, "category"), title: text(row, "title"), detail: text(row, "detail"), objectName: maybeText(row, "object_name"), remediation: maybeText(row, "remediation"), createdAt: text(row, "created_at") };
    }).filter((item) => item.id),
    capacity: parseCapacity(root.capacity),
  };
}

export async function runOpsSecurityAudit(client: SupabaseClient): Promise<string> {
  const [auditResult, capacityResult] = await Promise.all([
    client.rpc("admin_ops_run_security_audit"),
    client.rpc("admin_ops_refresh_capacity"),
  ]);
  if (auditResult.error || typeof auditResult.data !== "string") throw new Error("セキュリティ監査を実行できませんでした。");
  if (capacityResult.error) throw new Error("容量監視を更新できませんでした。");
  return auditResult.data;
}

export async function refreshOpsCapacity(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc("admin_ops_refresh_capacity");
  if (error) throw new Error("Supabase容量を更新できませんでした。");
}

export async function updateOpsCapacitySettings(client: SupabaseClient, input: {
  planLabel: string;
  databaseLimitBytes: number | null;
  storageLimitBytes: number | null;
  warningPercent: number;
  dangerPercent: number;
  criticalPercent: number;
}): Promise<void> {
  const { error } = await client.rpc("admin_ops_update_capacity_settings", {
    p_plan_label: input.planLabel.trim() || "未設定",
    p_database_limit_bytes: input.databaseLimitBytes,
    p_storage_limit_bytes: input.storageLimitBytes,
    p_warning_percent: input.warningPercent,
    p_danger_percent: input.dangerPercent,
    p_critical_percent: input.criticalPercent,
  });
  if (error) throw new Error("Supabase容量設定を保存できませんでした。");
}

export async function setOpsEventStatus(client: SupabaseClient, eventId: string, status: OpsEventStatus, resolutionNote?: string): Promise<void> {
  const { data, error } = await client.rpc("admin_ops_set_event_status", {
    p_event_id: eventId,
    p_status: status,
    p_resolution_note: resolutionNote?.trim() || null,
  });
  if (error || data !== true) throw new Error("イベント状態を更新できませんでした。");
}

export async function probeWorkerHealth(): Promise<{ ok: boolean; latencyMs: number; checkedAt: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  const started = performance.now();
  try {
    const response = await fetch("/api/ops/health", { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    if (!response.ok) return { ok: false, latencyMs, checkedAt: new Date().toISOString() };
    const payload = object(await response.json());
    return { ok: payload.ok === true && payload.service === "aas-pwa", latencyMs, checkedAt: new Date().toISOString() };
  } catch {
    return { ok: false, latencyMs: Math.max(0, Math.round(performance.now() - started)), checkedAt: new Date().toISOString() };
  } finally {
    window.clearTimeout(timeout);
  }
}
