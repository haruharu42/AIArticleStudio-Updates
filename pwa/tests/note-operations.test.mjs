import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pwaRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(pwaRoot, "..");
const readPwa = (relative) => readFile(path.join(pwaRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("note operations data is owner-scoped and never stores note credentials", async () => {
  const migration = await readRepo("supabase/migrations/20260919123613_note_operations_planner_v1.sql");

  for (const table of ["note_operation_profiles", "note_operation_schedule_items"]) {
    assert.match(migration, new RegExp("create table if not exists public\\." + table));
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
    assert.match(migration, new RegExp("alter table public\\." + table + " force row level security"));
  }

  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_profile\(\)/);
  assert.match(migration, /public\.can_access_product\('AAS-PWA-BETA'\)/);
  assert.match(migration, /note_operation_schedule_limit_500/);
  assert.match(migration, /Never stores note credentials, cookies, or authentication tokens/);
  assert.doesNotMatch(migration, /grant .* to anon/i);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_|access[_-]?token|refresh[_-]?token/i);
});

test("note operations engine generates mixed schedules and supports download upload formats", async () => {
  const lib = await readPwa("lib/note-operations.ts");

  assert.match(lib, /generateNoteSchedule/);
  assert.match(lib, /paidPostsPerMonth/);
  assert.match(lib, /free_note/);
  assert.match(lib, /paid_note/);
  assert.match(lib, /review/);
  assert.match(lib, /profile_setup/);
  assert.match(lib, /exportNoteScheduleCsv/);
  assert.match(lib, /exportNoteOperationsJson/);
  assert.match(lib, /aas-note-operations-v1/);
  assert.match(lib, /parseNoteOperationsImport/);
  assert.match(lib, /replaceNoteSchedule/);
  assert.match(lib, /todayJstDateKey/);
  assert.match(lib, /Asia\/Tokyo/);
});

test("note operations UI covers setup profile planning calendar and home todo", async () => {
  const [page, today, home, tools, desktop, mobile, layout, css] = await Promise.all([
    readPwa("components/note-operations-page.tsx"),
    readPwa("components/note-today-panel.tsx"),
    readPwa("components/phase18-beginner-home.tsx"),
    readPwa("components/phase-tools-page.tsx"),
    readPwa("lib/desktop-nav-preference.ts"),
    readPwa("lib/mobile-nav-preference.ts"),
    readPwa("app/layout.tsx"),
    readPwa("app/phase38-note-operations.css"),
  ]);

  for (const label of [
    "noteを始める順番",
    "プロフィールを作る",
    "AASに運用スケジュールを決めてもらう",
    "AASおまかせで作る",
    "CSVをダウンロード",
    "JSONをダウンロード",
    "AASへアップロード",
    "カレンダー",
    "この記事を作る",
  ]) {
    assert.match(page, new RegExp(label));
  }

  assert.match(page, /noteプレミアム \/ note pro/);
  assert.match(page, /パスワード、Cookie、認証コード、アクセストークン/);
  assert.match(page, /入力した事実だけ/);
  assert.match(page, /note\.com\/info\/n\/n27cb842c7737/);
  assert.match(page, /note\.com\/info\/n\/na5f43ec69740/);
  assert.match(page, /note\.com\/info\/n\/nc84e9a40b092/);

  assert.match(today, /今日のnote運営/);
  assert.match(today, /完了にする/);
  assert.match(home, /NoteTodayPanel/);
  assert.match(home, /ownerId=\{profile\.id\}/);
  assert.match(tools, /href: "\/note-operations"/);
  assert.match(desktop, /key: "noteOps"/);
  assert.match(desktop, /label: "note運営"/);
  assert.match(mobile, /key: "noteOps"/);
  assert.match(layout, /phase38-note-operations\.css/);
  assert.match(css, /\.note-calendar-grid/);
  assert.match(css, /\.note-today-list/);

  assert.doesNotMatch(`${page}\n${today}\n${home}`, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
});
