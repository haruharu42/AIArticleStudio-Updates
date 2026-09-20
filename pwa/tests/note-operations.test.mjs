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
    "AIの回答をそのままAASへ反映",
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

  assert.match(today, /今日のnote作成/);
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
    "previousJstMonth",
    "summarizeNoteSchedulePerformance",
    "NoteSchedulePerformanceSnapshot",
    "loadNoteArticleOutputSnapshot",
    "NoteArticleOutputSnapshot",
    "exportNoteAiSchedulePlanJson",
    "extractNoteAiScheduleJson",
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

  assert.match(lib, /parseSimpleAiArticleSchedule/);
  assert.match(lib, /fallbackDailyPostingTimes/);
  assert.match(lib, /ensureDistinctDailyPostingTimes/);
  assert.match(lib, /2: \["12:00", "20:00"\]/);
  assert.match(lib, /3: \["09:00", "14:00", "20:00"\]/);
  assert.match(lib, /1日2回以上なら投稿回数と同じ行数/);
  assert.match(lib, /前文、挨拶、説明、要約、理由、注意書き、出典一覧、コードフェンス、表の後の文章は一切出力しない/);
  assert.match(lib, /Markdown表/);
  assert.match(lib, /\| 日付 \| 時刻 \| 種別 \| 記事タイトル \| テーマ \|/);
  assert.match(lib, /JSONは不要です/);
  assert.match(lib, /AI回答内の無料note・有料note作成予定をAASが直接読み取りました/);
  assert.match(lib, /normalizeAiArticleScheduleType/);
  assert.match(lib, /無料note作成/);
  assert.match(lib, /有料note作成/);
  assert.match(lib, /scheduleに入れてよいtypeは free_note と paid_note の2種類だけ/);
  assert.match(lib, /\.in\("item_type", \["free_note", "paid_note"\]\)/);
  assert.match(page, /articleSchedule/);
  assert.match(page, /無料note \/ 有料noteの作成日・時間/);
  assert.match(page, /Markdown表・箇条書き・対応JSON/);
  assert.match(lib, /balancedJsonObjects/);
  assert.match(lib, /scheduleRootFromValue/);
  assert.match(lib, /ChatGPTの回答全文を削らず/);
  assert.match(lib, /AAS用の運用スケジュールが回答内に見つかりませんでした/);
  assert.match(lib, /対象月の外にある予定/);
  assert.match(lib, /同じ日時に記事投稿が重複/);
  assert.match(lib, /1日に最大/);
  assert.match(lib, /調査元URLがありません/);
  assert.match(lib, /note公式（note\.com\/info）/);
  assert.match(lib, /直近180日以内の出典/);
  assert.match(lib, /replacementStart/);
  assert.match(lib, /status === "done"/);
  assert.match(lib, /AAS運用スケジュール実績/);
  assert.match(lib, /AASで実際に作成したnote記事数/);
  assert.match(lib, /投稿予定に対する完了率/);
  assert.match(lib, /無料30本・有料20本/);
  assert.match(lib, /未完了分やスキップ分を「借金」/);
  assert.match(lib, /今日から月末までに新しく行う分/);
  assert.match(lib, /曜日別/);
  assert.match(lib, /時刻別/);
  assert.match(lib, /AASから渡していない本文、PV、売上、購入率/);
  assert.match(lib, /item\.itemType === "free_note" \|\| item\.itemType === "paid_note"/);
  assert.match(lib, /eq\("status", "planned"\)/);
  assert.match(lib, /gte\("scheduled_date", replacementStart\)/);
  assert.match(lib, /lte\("scheduled_date", end\)/);

  assert.match(page, /type="month"/);
  assert.match(page, /min=\{currentJstMonth\(\)\}/);
  assert.match(page, /週に何回投稿するか/);
  assert.match(page, /1日に何回まで投稿するか/);
  assert.match(page, /有料noteを週何回にするか/);
  assert.match(page, /ChatGPT \/ Gemini \/ Claude/);
  assert.match(page, /コピーしたAI回答を読み込んで反映/);
  assert.match(page, /貼り付けた回答をそのまま反映/);
  assert.match(page, /反映前に内容だけ確認/);
  assert.match(page, /importAndApplyAiSchedule/);
  assert.match(page, /navigator\.clipboard\?\.readText/);
  assert.match(page, /NOTE_SCHEDULE_RESPONSE_STORAGE_PREFIX/);
  assert.match(page, /window\.localStorage\.getItem/);
  assert.match(page, /window\.localStorage\.setItem/);
  assert.match(page, /window\.localStorage\.removeItem/);
  assert.match(page, /貼り付け内容をクリア/);
  assert.match(page, /previewPostingTimes\.join\("\/"/);
  assert.match(page, /投稿時間/);
  assert.doesNotMatch(page, /setSchedulePrompt\(prompt\);\s*setScheduleResponse\(""/);
  assert.match(page, /この月のAASスケジュールに反映/);
  assert.match(page, /他の月の予定は残ります/);
  assert.match(page, /なぜこの頻度にしたか/);
  assert.match(page, /今月の実績から残り期間を組み直せます/);
  assert.match(page, /referencePerformance\.adherenceRate/);
  assert.match(page, /articleOutput\.freeCreated/);
  assert.match(page, /本文・PV・売上・購入率はAIへ渡しません/);
  assert.match(page, /AAS用JSONをコピー/);
  assert.match(page, /JSONファイルで保存/);
  assert.match(page, /今日以降の予定を組み直して反映/);
  assert.match(page, /NOTE_PERFORMANCE_LOOP_MIN_RELEASE = "0\.1\.1"/);
  assert.match(page, /releaseVersionAtLeast/);
  assert.match(page, /readEffectiveRelease/);
  assert.match(page, /ai-article-studio-pwa-preview/);
  assert.match(page, /performanceLoopEnabled \? referencePerformance : undefined/);
  assert.match(page, /loadNoteArticleOutputSnapshot/);
  assert.match(page, /schedulePreview\.sources/);

  assert.match(css, /\.note-ai-month-controls/);
  assert.match(css, /\.note-ai-import-box/);
  assert.match(css, /\.note-ai-plan-preview/);
  assert.doesNotMatch(`${migration}\n${lib}\n${page}`, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
  assert.match(lib, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(lib, /eq\("publication_target", "note"\)/);
  assert.match(lib, /gte\("created_at", startIso\)/);
  assert.match(lib, /lt\("created_at", endIso\)/);
  assert.doesNotMatch(lib, /articleOutput\.(?:title|theme|body|revenue|pv)/);
});


test("note schedule import accepts full AI response prose and keeps file import as fallback", async () => {
  const [lib, page, css, layout] = await Promise.all([
    readPwa("lib/note-operations.ts"),
    readPwa("components/note-operations-page.tsx"),
    readPwa("app/phase39-readability.css"),
    readPwa("app/layout.tsx"),
  ]);

  assert.match(lib, /export function extractNoteAiScheduleJson/);
  assert.match(lib, /matchAll\(fencePattern\)/);
  assert.match(lib, /balancedJsonObjects\(rawText\)/);
  assert.match(lib, /object\.schema === "aas-note-schedule-v2"/);
  assert.match(page, /AIの回答をそのままAASへ反映/);
  assert.match(page, /JSONは不要です/);
  assert.match(page, /コピーしたAI回答を読み込んで反映/);
  assert.match(page, /ファイルから反映/);
  assert.match(css, /\.note-ai-easy-import/);
  assert.match(layout, /phase39-readability\.css/);
});


test("AI note calendar is article-only and tolerates common free paid aliases", async () => {
  const [lib, page, today] = await Promise.all([
    readPwa("lib/note-operations.ts"),
    readPwa("components/note-operations-page.tsx"),
    readPwa("components/note-today-panel.tsx"),
  ]);

  assert.match(lib, /\["free_note", "free", "free_article", "無料note", "無料ノート", "無料記事", "無料note作成"\]/);
  assert.match(lib, /\["paid_note", "paid", "paid_article", "有料note", "有料ノート", "有料記事", "有料note作成"\]/);
  assert.match(lib, /raw\.type \?\? raw\.item_type \?\? raw\.article_type/);
  assert.match(lib, /raw\.scheduled_date/);
  assert.match(lib, /raw\.scheduled_time/);
  assert.match(lib, /object\.targetMonth/);
  assert.match(lib, /Array\.isArray\(object\.calendar\)/);
  assert.match(lib, /Array\.isArray\(object\.items\)/);
  assert.match(lib, /root\.targetMonth/);
  assert.match(lib, /raw\.day/);
  assert.match(lib, /raw\.name/);
  assert.match(lib, /rawTitle \|\| fallbackTitle/);
  assert.match(lib, /isNoteArticleScheduleItem\(item\)/);
  assert.match(page, /schedule\.filter\(\(item\) => isNoteArticleScheduleItem\(item\)\)/);
  assert.match(page, /articleSchedule\.slice\(0, 120\)/);
  assert.match(today, /value\.filter\(\(item\) => isNoteArticleScheduleItem\(item\)\)/);
});


test("note schedule can be recovered from a plain markdown table without JSON", async () => {
  const [lib, page, manual] = await Promise.all([
    readPwa("lib/note-operations.ts"),
    readPwa("components/note-operations-page.tsx"),
    readPwa("app/manual/page.tsx"),
  ]);

  assert.match(lib, /function parseSimpleAiArticleSchedule/);
  assert.match(lib, /有料\(\?:note\|ノート\|記事\)/);
  assert.match(lib, /無料\(\?:note\|ノート\|記事\)/);
  assert.match(lib, /text\.split\(\/\\r\?\\n\//);
  assert.match(lib, /line\.split\("\|"\)/);
  assert.match(lib, /JSONではなくAI回答内の予定表・文章から読み取りました/);
  assert.match(page, /Markdown表・箇条書き・対応JSON/);
  assert.match(page, /通常操作ではJSONを作る必要はありません/);
  assert.match(manual, /JSONを作ったり編集したりする必要はありません/);
});


test("AI schedule output is copy-only, multi-post times are explicit, and pasted text persists until clear", async () => {
  const [lib, page, css, manual] = await Promise.all([
    readPwa("lib/note-operations.ts"),
    readPwa("components/note-operations-page.tsx"),
    readPwa("app/phase39-readability.css"),
    readPwa("app/manual/page.tsx"),
  ]);

  assert.match(lib, /最終回答は、AASへそのままコピー＆ペーストする次のMarkdown表だけを返す/);
  assert.match(lib, /表以外の文字は出力しない/);
  assert.match(lib, /1日2回なら2行・2時刻、1日3回なら3行・3時刻/);
  assert.match(lib, /同日の時刻同士は原則3時間以上空ける/);
  assert.match(lib, /ensureDistinctDailyPostingTimes\(items\)/);
  assert.match(lib, /ensureDistinctDailyPostingTimes\(/);

  assert.match(page, /aas\.note\.schedule\.response\.v1/);
  assert.match(page, /scheduleResponseLoaded/);
  assert.match(page, /localStorage\.setItem\(key, scheduleResponse\)/);
  assert.match(page, /clearScheduleResponse/);
  assert.match(page, /貼り付けたAI回答をクリアしました/);
  assert.match(page, /note-plan-times/);
  assert.match(page, /previewPostingTimes/);
  assert.match(css, /\.note-plan-stats \.note-plan-times/);
  assert.match(manual, /前置きや説明文を除いてコピーしやすくします/);
  assert.match(manual, /「貼り付け内容をクリア」を押した時だけ削除/);
});
