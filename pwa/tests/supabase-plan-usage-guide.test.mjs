import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("operations page shows Supabase usage, pricing, and official billing links", async () => {
  const [route, guide] = await Promise.all([
    read("app/admin/operations/page.tsx"),
    read("components/supabase-plan-usage-guide.tsx"),
  ]);

  assert.match(route, /SupabasePlanUsageGuide/);
  assert.match(guide, /loadOpsSnapshot/);
  assert.match(guide, /https:\/\/supabase\.com\/dashboard\/org\/_\/usage/);
  assert.match(guide, /https:\/\/supabase\.com\/dashboard\/org\/_\/billing/);
  assert.match(guide, /https:\/\/supabase\.com\/pricing/);
  assert.match(guide, /Free/);
  assert.match(guide, /\$0 \/ month/);
  assert.match(guide, /Pro/);
  assert.match(guide, /From \$25 \/ month/);
  assert.match(guide, /Team/);
  assert.match(guide, /From \$599 \/ month/);
  assert.match(guide, /Enterprise/);
  assert.match(guide, /2026-09-17/);
  assert.match(guide, /AAS内では行わず、Supabase公式Billing/);
});
