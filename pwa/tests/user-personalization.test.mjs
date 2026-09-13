import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("article creation asks for AI and plan before the generation wizard", async () => {
  const route = await read("app/create/page.tsx");
  const setup = await read("components/create-ai-setup.tsx");
  const personalization = await read("lib/user-personalization.ts");
  assert.match(route, /CreateAiSetup/);
  for (const label of ["最初に使用するAIを選びます", "無料版", "有料版", "この設定で記事作成へ"]) {
    assert.match(setup, new RegExp(label));
  }
  for (const label of ["ChatGPT", "Claude", "Gemini"]) {
    assert.match(personalization, new RegExp(label));
  }
  assert.match(setup, /saveWritingProfile/);
  assert.match(setup, /setRuntimeWritingProfile/);
});

test("personalization settings can be viewed edited saved and reset", async () => {
  const settings = await read("components/pwa-settings-page.tsx");
  for (const label of ["あなた向け最適化", "普段使うAI", "文章の雰囲気", "普段の掲載先", "AASが保持している小さな利用傾向", "最適化設定を保存", "学習内容をリセット"]) {
    assert.match(settings, new RegExp(label));
  }
  assert.match(settings, /loadWritingProfile/);
  assert.match(settings, /saveWritingProfile/);
  assert.match(settings, /resetWritingProfile/);
  assert.match(settings, /記事本文・AI回答全文・プロンプト全文/);
});

test("prompt builder applies provider plan and optional user preferences", async () => {
  const personalization = await read("lib/user-personalization.ts");
  const creator = await read("lib/phase11-create.ts");
  for (const label of ["使用AI向けAAS最適化", "このユーザー向け文章設定", "無料版で扱いやすいよう", "詳細条件を最後まで保持"]) {
    assert.match(personalization, new RegExp(label));
  }
  assert.match(creator, /buildUserPromptContext/);
  assert.match(creator, /getRuntimeWritingProfile/);
  assert.match(creator, /recordPersonalizationSignal/);
  assert.match(creator, /ai_provider/);
  assert.match(creator, /ai_plan/);
});

test("server profile stores small aggregate signals with strict self-only RLS", async () => {
  const migration = await readRepo("supabase/migrations/20260913111500_user_writing_profiles.sql");
  const invoker = await readRepo("supabase/migrations/20260913123500_user_writing_profiles_rpc_invoker.sql");
  assert.match(migration, /create table if not exists public\.user_writing_profiles/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_profile\(\)/);
  assert.match(migration, /record_my_personalization_signal/);
  assert.match(migration, /platform_counts/);
  assert.match(migration, /genre_counts/);
  assert.match(migration, /Raw article bodies, AI answers, and full prompt history are not stored here/);
  assert.match(invoker, /security invoker/);
  assert.doesNotMatch(`${migration}\n${invoker}`, /service[_-]?role|sb_secret_/i);
});

test("personalization UI has dedicated responsive styling", async () => {
  const css = await read("app/phase25-user-personalization.css");
  const layout = await read("app/layout.tsx");
  assert.match(layout, /phase25-user-personalization\.css/);
  assert.match(css, /\.ai-provider-grid/);
  assert.match(css, /\.personalization-settings/);
  assert.match(css, /@media \(max-width: 430px\)/);
});
