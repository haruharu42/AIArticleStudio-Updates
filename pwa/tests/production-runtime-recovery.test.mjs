import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pwaRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(pwaRoot, "..");
const readPwa = (relative) => readFile(path.join(pwaRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("public sales settings use a safe RPC and publishable Supabase key", async () => {
  const [worker, migration] = await Promise.all([
    readPwa("worker/sales-controls.ts"),
    readRepo("supabase/migrations/20260924170000_public_sales_and_knowledge_pending_recovery.sql"),
  ]);

  assert.match(worker, /AAS_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(worker, /get_public_commerce_sales_settings/);
  assert.match(worker, /sb_publishable_/);
  assert.match(migration, /create or replace function public\.get_public_commerce_sales_settings/);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute .* to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant select on table public\.commerce_sales_settings to anon/i);
});

test("Cloudflare deployments inject only public Supabase runtime variables", async () => {
  const workflows = await Promise.all([
    readRepo(".github/workflows/pwa-preview-deploy.yml"),
    readRepo(".github/workflows/pwa-member-beta-deploy.yml"),
    readRepo(".github/workflows/pwa-production-preflight.yml"),
  ]);

  for (const workflow of workflows) {
    assert.match(workflow, /Inject safe public Supabase Worker vars/);
    assert.match(workflow, /AAS_SUPABASE_URL: url/);
    assert.match(workflow, /AAS_SUPABASE_PUBLISHABLE_KEY: key/);
    assert.match(workflow, /sb_secret_\|service\[_-\]\?role/);
    assert.doesNotMatch(workflow, /AAS_SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{/);
  }
});

test("knowledge scheduler automatically releases stale pending requests", async () => {
  const migration = await readRepo("supabase/migrations/20260924170000_public_sales_and_knowledge_pending_recovery.sql");

  assert.match(migration, /status = 'failed'/);
  assert.match(migration, /where status = 'pending'/);
  assert.match(migration, /requested_at <= now\(\) - interval '24 hours'/);
  assert.match(migration, /pending exceeded 24 hours/);
  assert.match(migration, /where status = 'processing'/);
  assert.match(migration, /insert into public\.knowledge_refresh_requests/);
  assert.match(migration, /private\.enqueue_due_knowledge_refreshes/);
  assert.match(migration, /revoke all on function private\.enqueue_due_knowledge_refreshes/);
});
