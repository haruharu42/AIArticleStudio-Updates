import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("platform account design storage is owner-scoped and entitlement protected", async () => {
  const migration = await readRepo("supabase/migrations/20260920080324_platform_account_designs.sql");

  assert.match(migration, /create table if not exists public\.platform_account_designs/);
  assert.match(migration, /primary key \(user_id, platform\)/);
  assert.match(migration, /platform in \('note','tips','brain'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);

  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp("platform_account_designs_" + operation + "_own_active"));
    assert.match(migration, new RegExp("for " + operation + " to authenticated"));
  }

  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_profile\(\)/);
  assert.match(migration, /public\.can_access_product\('AAS-PWA-BETA'\)/);
  assert.match(migration, /revoke all on table public\.platform_account_designs from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.platform_account_designs to authenticated/);
  assert.match(migration, /insert into public\.platform_account_designs/);
  assert.match(migration, /from public\.note_operation_profiles/);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
});

test("note Tips Brain account design uses dropdown presets with other inputs", async () => {
  const [lib, page] = await Promise.all([
    read("lib/platform-account-design.ts"),
    read("components/platform-account-design-page.tsx"),
  ]);

  for (const platform of ["note", "tips", "brain"]) {
    assert.match(lib, new RegExp(`value: "${platform}"`));
  }

  for (const collection of [
    "ACCOUNT_DESIGN_GENRES",
    "ACCOUNT_DESIGN_STYLES",
    "ACCOUNT_DESIGN_AUDIENCES",
    "ACCOUNT_DESIGN_TONES",
    "ACCOUNT_DESIGN_MONETIZATION",
    "ACCOUNT_DESIGN_GOALS",
    "ACCOUNT_DESIGN_TRUST",
    "ACCOUNT_DESIGN_CONTENT_FOCUS",
  ]) {
    assert.match(lib, new RegExp(`export const ${collection}`));
  }

  assert.ok((lib.match(/value: "other", label: "その他（自由入力）"/g) ?? []).length >= 8);
  assert.match(page, /design\.genrePreset === "other"/);
  assert.match(page, /design\.accountStylePreset === "other"/);
  assert.match(page, /design\.audiencePreset === "other"/);
  assert.match(page, /design\.tonePreset === "other"/);
  assert.match(page, /design\.monetizationPreset === "other"/);
  assert.match(page, /design\.goalPreset === "other"/);
  assert.match(page, /design\.trustPreset === "other"/);
  assert.match(page, /design\.contentFocusPreset === "other"/);
  assert.match(page, /必要な人だけ：表示名・テーマ・経験・プロフィール文/);
  assert.match(page, /選択内容からプロフィール文を作る/);
});

test("account designs load and save per user and platform without external credentials", async () => {
  const [lib, page] = await Promise.all([
    read("lib/platform-account-design.ts"),
    read("components/platform-account-design-page.tsx"),
  ]);

  assert.match(lib, /\.from\("platform_account_designs"\)/);
  assert.match(lib, /\.eq\("user_id", userId\)/);
  assert.match(lib, /upsert\(payload, \{ onConflict: "user_id,platform" \}\)/);
  assert.match(lib, /defaultPlatformAccountDesign\(userId, "note"\)/);
  assert.match(lib, /defaultPlatformAccountDesign\(userId, "tips"\)/);
  assert.match(lib, /defaultPlatformAccountDesign\(userId, "brain"\)/);
  assert.match(page, /loadAccessState/);
  assert.match(page, /loadPlatformAccountDesigns/);
  assert.match(page, /savePlatformAccountDesign/);
  assert.match(page, /外部サービスのログイン情報は保存しません/);
  assert.doesNotMatch(`${lib}\n${page}`, /password\s*[:=]|cookie\s*[:=]|access[_-]?token\s*[:=]|service[_-]?role|sb_secret_/i);
});

test("account design is reachable from tools settings note operations and manual", async () => {
  const [route, tools, settings, noteOps, layout, css, manual, faq] = await Promise.all([
    read("app/account-design/page.tsx"),
    read("components/phase-tools-page.tsx"),
    read("components/pwa-settings-page.tsx"),
    read("components/note-operations-page.tsx"),
    read("app/layout.tsx"),
    read("app/phase40-account-design.css"),
    read("app/manual/page.tsx"),
    read("app/faq/page.tsx"),
  ]);

  assert.match(route, /PlatformAccountDesignPage/);
  assert.match(tools, /href: "\/account-design"/);
  assert.match(settings, /href="\/account-design"/);
  assert.match(noteOps, /href="\/account-design"/);
  assert.match(layout, /phase40-account-design\.css/);
  assert.match(css, /\.account-design-platforms/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(manual, /note \/ Tips \/ Brain アカウント設計/);
  assert.match(faq, /媒体ごとに別々の設計を保存できます/);
});
