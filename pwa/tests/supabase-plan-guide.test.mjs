import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("admin operations exposes Supabase usage, billing, and pricing guidance", async () => {
  const [route, guide] = await Promise.all([
    read("app/admin/operations/page.tsx"),
    read("components/supabase-plan-guide.tsx"),
  ]);

  assert.match(route, /SupabasePlanGuide/);
  assert.match(guide, /https:\/\/supabase\.com\/dashboard\/org\/_\/usage/);
  assert.match(guide, /https:\/\/supabase\.com\/dashboard\/org\/_\/billing/);
  assert.match(guide, /https:\/\/supabase\.com\/pricing/);
  assert.match(guide, /Free/);
  assert.match(guide, /\$0 \/ 月/);
  assert.match(guide, /Pro/);
  assert.match(guide, /\$25〜 \/ 月/);
  assert.match(guide, /Team/);
  assert.match(guide, /\$599〜 \/ 月/);
  assert.match(guide, /料金は20\d{2}-\d{2}-\d{2}時点/);
  assert.match(guide, /終値付近/);
  assert.match(guide, /最新料金/);
  assert.match(guide, /為替・税/);
  assert.match(guide, /請求額/);
});
