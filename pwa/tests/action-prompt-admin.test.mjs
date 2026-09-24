import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("action prompt DB migration uses RLS without privileged browser secrets", async () => {
  const migration = await read("../supabase/migrations/20260923134702_action_prompt_library.sql");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /p\.role = 'admin'/);
  assert.match(migration, /p\.status = 'active'/);
  assert.match(migration, /grant select, insert, update .* authenticated/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_/i);
});

test("admin prompt manager edits cloud templates without delete workflow", async () => {
  const [service, page, sections] = await Promise.all([
    read("lib/action-prompt-service.ts"),
    read("components/admin-action-prompts-page.tsx"),
    read("lib/admin-sections.ts"),
  ]);
  assert.match(service, /action_prompt_templates/);
  assert.match(service, /action_prompt_categories/);
  assert.match(page, /副業プロンプト管理/);
  assert.match(page, /新規プロンプト/);
  assert.match(page, /公開状態/);
  assert.match(page, /ユーザー入力項目/);
  assert.doesNotMatch(page, /\.delete\(/);
  assert.match(sections, /\/admin\/prompts/);
});
