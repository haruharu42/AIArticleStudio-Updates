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
    "初心者向け・選ぶだけプロフィール設計",
    "AIに1か月の運用スケジュールを決めてもらう",
    "AIのJSON回答をAASへ読み込む",
    "この月のAASスケジュールに反映",
    "現在の予定をCSV保存",
    "AAS運営データをJSON保存",
    "従来JSON/CSVを読み込む",
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


test("note beginner profile builder uses dropdown presets and current-web research prompts", async () => {
  const [migration, lib, page, css] = await Promise.all([
    readRepo("supabase/migrations/20260919125425_note_operations_profile_builder_presets.sql"),
    readPwa("lib/note-operations.ts"),
    readPwa("components/note-operations-page.tsx"),
    readPwa("app/phase38-note-operations.css"),
  ]);

  for (const column of [
    "account_genre",
    "account_style",
    "audience_preset",
    "tone_preset",
    "monetization_style",
  ]) {
    assert.match(migration, new RegExp(column));
  }

  for (const optionSet of [
    "NOTE_ACCOUNT_GENRES",
    "NOTE_ACCOUNT_STYLES",
    "NOTE_AUDIENCE_PRESETS",
    "NOTE_TONE_PRESETS",
    "NOTE_MONETIZATION_STYLES",
  ]) {
    assert.match(lib, new RegExp(optionSet));
  }

  assert.match(lib, /buildNoteAccountResearchPrompt/);
  assert.match(lib, /回答を作る前に必ずWeb検索/);
  assert.match(lib, /note公式/);
  assert.match(lib, /直近90日/);
  assert.match(lib, /直近12か月/);
  assert.match(lib, /出典名・URL・公開\/更新日/);
  assert.match(lib, /最新情報を確認できないため/);
  assert.match(lib, /経歴、年齢、職業、収入、実績、資格/);
  assert.match(lib, /アカウント構成を3案/);

  assert.match(page, /どのジャンルで運営したい/);
  assert.match(page, /どんなアカウントにしたい/);
  assert.match(page, /主に誰に届けたい/);
  assert.match(page, /文章の雰囲気は/);
  assert.match(page, /収益化はどうしたい/);
  assert.match(lib, /その他（自由入力）/);
  assert.match(page, /chatgpt","gemini","claude/);
  assert.match(page, /現在のよく使うAI/);
  assert.match(page, /最新情報から構成候補を作る/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /launchAiApp\(selectedAi\)/);
  assert.match(page, /saveWritingProfile/);
  assert.match(css, /\.note-profile-choice-grid/);
  assert.match(css, /\.note-ai-provider-grid/);
  assert.doesNotMatch(`${lib}\n${page}\n${migration}`, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
});


test("AI monthly note schedule uses month-based research, validation, and owner-scoped plan storage", async () => {
  const [migration, lib, page, css] = await Promise.all([
    readRepo("supabase/migrations/20260919131121_note_ai_monthly_schedule_plans.sql"),
    readPwa("lib/note-operations.ts"),
    readPwa("components/note-operations-page.tsx"),
    readPwa("app/phase38-note-operations.css"),
  ]);

  assert.match(migration, /create table if not exists public\.note_operation_schedule_plans/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_profile\(\)/);
  assert.match(migration, /can_access_product\('AAS-PWA-BETA'\)/);
  assert.match(migration, /grant select, insert, update, delete on table public\.note_operation_schedule_plans to authenticated/);
  assert.doesNotMatch(migration, /grant .* to anon/i);

  for (const symbol of [
    "buildNoteScheduleResearchPrompt",
    "parseNoteAiSchedulePlan",
    "replaceNoteScheduleMonth",
    "saveNoteAiSchedulePlan",
    "loadNoteAiSchedulePlan",
    "aas-note-schedule-v2",
    "直近30日",
    "直近90日",
    "直近12か月",
    "投稿頻度",
    "paid_posts_per_week",
    "recommendation_reason",
  ]) {
    assert.match(lib, new RegExp(symbol));
  }

  assert.match(lib, /対象月の外にある予定/);
  assert.match(lib, /同じ日時に記事投稿が重複/);
  assert.match(lib, /1日に最大/);
  assert.match(lib, /調査元URLがありません/);
  assert.match(lib, /note公式（note\.com\/info）/);
  assert.match(lib, /直近180日以内の出典/);
  assert.match(lib, /replacementStart/);
  assert.match(lib, /status === "done"/);
  assert.match(lib, /neq\("status", "done"\)/);
  assert.match(lib, /gte\("scheduled_date", replacementStart\)/);
  assert.match(lib, /lte\("scheduled_date", end\)/);

  assert.match(page, /type="month"/);
  assert.match(page, /min=\{currentJstMonth\(\)\}/);
  assert.match(page, /週に何回投稿するか/);
  assert.match(page, /1日に何回まで投稿するか/);
  assert.match(page, /有料noteを週何回にするか/);
  assert.match(page, /ChatGPT \/ Gemini \/ Claude/);
  assert.match(page, /読み込み・確認/);
  assert.match(page, /この月のAASスケジュールに反映/);
  assert.match(page, /他の月の予定は残ります/);
  assert.match(page, /なぜこの頻度にしたか/);
  assert.match(page, /schedulePreview\.sources/);

  assert.match(css, /\.note-ai-month-controls/);
  assert.match(css, /\.note-ai-import-box/);
  assert.match(css, /\.note-ai-plan-preview/);
  assert.doesNotMatch(`${migration}\n${lib}\n${page}`, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
});
