import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("operations migration protects logs behind RLS and admin/service RPCs", async () => {
  const sql = await readRepo("supabase/migrations/20260914053000_security_operations_center.sql");
  for (const table of ["ops_events", "ops_audit_runs", "ops_audit_findings", "ops_health_checks"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated`));
  }
  assert.match(sql, /record_client_error/);
  assert.match(sql, /ops_record_system_event/);
  assert.match(sql, /admin_ops_get_snapshot/);
  assert.match(sql, /admin_ops_run_security_audit/);
  assert.match(sql, /private\.is_active_admin/);
  assert.match(sql, /grant execute on function public\.ops_record_system_event[^;]+to service_role/s);
  assert.doesNotMatch(sql, /grant execute on function public\.ops_record_system_event[^;]+to authenticated/s);
});

test("operations audit covers RLS, anonymous RPC, billing, Storage and scheduler", async () => {
  const sql = await readRepo("supabase/migrations/20260914053000_security_operations_center.sql");
  for (const code of ["DB_RLS_FORCE", "ANON_RPC_EXECUTE", "SECDEF_SEARCH_PATH", "BILLING_AUTH_EXECUTE", "ARTICLE_BUCKET_CONFIG", "ARTICLE_STORAGE_POLICIES", "AUDIT_SCHEDULER"]) {
    assert.match(sql, new RegExp(code));
  }
  const scheduler = await readRepo("supabase/migrations/20260914053100_security_operations_scheduler.sql");
  assert.match(scheduler, /create extension if not exists pg_cron/);
  assert.match(scheduler, /aas-ops-security-audit-hourly/);
  assert.match(scheduler, /0 \* \* \* \*/);
  assert.match(scheduler, /private\.ops_run_database_audit\('scheduled'\)/);
});

test("capacity monitoring measures database and Storage without exposing its settings table", async () => {
  const sql = await readRepo("supabase/migrations/20260914054500_ops_capacity_monitoring.sql");
  assert.match(sql, /create table public\.ops_capacity_settings/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table public\.ops_capacity_settings from public, anon, authenticated/);
  assert.match(sql, /pg_database_size/);
  assert.match(sql, /from storage\.objects/);
  assert.match(sql, /admin_ops_update_capacity_settings/);
  assert.match(sql, /admin_ops_refresh_capacity/);
  assert.match(sql, /aas-ops-capacity-hourly/);
  assert.match(sql, /5 \* \* \* \*/);
  assert.match(sql, /SUPABASE_DATABASE_CAPACITY/);
  assert.match(sql, /SUPABASE_STORAGE_CAPACITY/);
});

test("error logging redacts secrets and never stores stack or request bodies", async () => {
  const client = await read("lib/ops.ts");
  const workerOps = await read("worker/ops.ts");
  const worker = await read("worker/index.ts");
  assert.match(client, /sb_secret_/);
  assert.match(client, /sk_\(\?:live\|test\)_/);
  assert.match(client, /whsec_/);
  assert.match(client, /record_client_error/);
  assert.doesNotMatch(client, /\.stack/);
  assert.match(workerOps, /ops_record_system_event/);
  assert.doesNotMatch(workerOps, /request\.text|request\.json|cookie/i);
  assert.match(worker, /WORKER_UNHANDLED_EXCEPTION/);
  assert.match(worker, /WEBHOOK_REJECTED/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.doesNotMatch(worker, /request\.headers\.get\(["']authorization/);
});

test("operations health endpoint and admin UI are wired without exposing secrets", async () => {
  const worker = await read("worker/index.ts");
  const route = await read("app/admin/operations/page.tsx");
  const page = await read("components/operations-admin-page.tsx");
  const adminClient = await read("lib/operations-admin.ts");
  const layout = await read("app/layout.tsx");
  const topbar = await read("components/admin-home-topbar.tsx");
  const sections = await read("lib/admin-sections.ts");
  assert.match(worker, /\/api\/ops\/health/);
  assert.match(route, /OperationsAdminPage/);
  assert.match(page, /Security & Operations|SECURITY & OPERATIONS/);
  assert.match(page, /今すぐ監査/);
  assert.match(page, /エラー・セキュリティログ/);
  assert.match(page, /Supabase使用容量/);
  assert.match(page, /容量設定を保存/);
  assert.match(adminClient, /admin_ops_get_snapshot/);
  assert.match(adminClient, /admin_ops_set_event_status/);
  assert.match(adminClient, /admin_ops_update_capacity_settings/);
  assert.match(adminClient, /admin_ops_refresh_capacity/);
  assert.match(layout, /AppErrorReporter/);
  assert.match(layout, /phase30-security-operations\.css/);
  assert.match(topbar, /ADMIN_HOME_SHORTCUT_IDS/);
  assert.match(sections, /\/admin\/operations/);
  assert.doesNotMatch(`${page}\n${adminClient}`, /AAS_SUPABASE_SERVICE_ROLE_KEY|AAS_STRIPE_SECRET_KEY|AAS_STRIPE_WEBHOOK_SECRET/);
});

test("global error boundary reports safe messages instead of stack traces", async () => {
  const reporter = await read("components/app-error-reporter.tsx");
  const ops = await read("lib/ops.ts");
  const boundary = await read("app/error.tsx");
  assert.match(reporter, /unhandledrejection/);
  assert.match(reporter, /windowErrorDiagnostic/);
  assert.match(ops, /WINDOW_ERROR/);
  assert.match(ops, /WINDOW_SCRIPT_ERROR_OPAQUE/);
  assert.match(boundary, /ROUTE_RENDER_ERROR/);
  assert.doesNotMatch(`${reporter}\n${ops}\n${boundary}`, /\.stack/);
});
