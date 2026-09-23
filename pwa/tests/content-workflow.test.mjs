import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(root, "..", relative), "utf8");

test("content series plans are owner scoped with forced RLS and PWA entitlement", async () => {
  const migration = await readRepo("supabase/migrations/20260921022052_content_series_plans.sql");

  assert.match(migration, /create table if not exists public\.content_series_plans/);
  assert.match(migration, /jsonb_typeof\(items\) = 'array'/);
  assert.match(migration, /pg_column_size\(items\) <= 65536/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`content_series_plans_${operation}_own_active`));
  }
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_profile\(\)/);
  assert.match(migration, /public\.can_access_product\('AAS-PWA-BETA'\)/);
  assert.match(migration, /grant select, insert, update, delete on table public\.content_series_plans to authenticated/);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_|sk_(?:live|test)_|whsec_/i);
});

test("content lifecycle provides local preflight blockers and human-review checks", async () => {
  const lib = await read("lib/content-lifecycle.ts");

  assert.match(lib, /runPrePublishChecks/);
  assert.match(lib, /readyForManualPublish: blockers === 0/);
  assert.match(lib, /TODO\|TBD\|FIXME\|要確認/);
  assert.match(lib, /有料記事ですが価格を確認できません/);
  assert.match(lib, /公開済みですが公開URLがありません/);
  assert.match(lib, /アカウント設計の反映記録がありません/);
  assert.match(lib, /数値・価格・ランキング・実績に見える表現/);
  assert.match(lib, /buildPrePublishReviewPrompt/);
  assert.match(lib, /最終判断はユーザーが行う前提/);
  assert.match(lib, /Web検索が利用できる場合は最新の一次情報・公式情報を確認/);
});

test("article reuse creates platform-specific length and follow-up schedules", async () => {
  const [lib, page] = await Promise.all([
    read("lib/content-lifecycle.ts"),
    read("components/content-workflow-page.tsx"),
  ]);

  assert.match(lib, /buildArticleReusePrompt/);
  assert.match(lib, /記事公開から\$\{Math\.max\(0/);
  assert.match(lib, /同じ文章を貼り回さず/);
  assert.match(lib, /記事公開日をDay 0とした再告知スケジュール/);
  assert.match(page, /記事 → SNS再利用/);
  for (const platform of ["X", "Threads", "Instagram", "TikTok", "YouTube Shorts"]) {
    assert.match(page, new RegExp(platform));
  }
  assert.match(page, /目標文字数/);
  assert.match(page, /公開から何日後/);
});

test("workflow cockpit combines schedule drafts preflight reuse and series work", async () => {
  const [lib, page, route, tools, toolCatalog, nav, home, css] = await Promise.all([
    read("lib/content-lifecycle.ts"),
    read("components/content-workflow-page.tsx"),
    read("app/workflow/page.tsx"),
    read("components/phase-tools-page.tsx"),
    read("features/tools/tool-catalog.ts"),
    read("lib/mobile-nav-preference.ts"),
    read("components/phase18-beginner-home.tsx"),
    read("app/phase43-content-workflow.css"),
  ]);

  assert.match(lib, /buildWorkflowTasks/);
  assert.match(lib, /kind: "schedule"/);
  assert.match(lib, /kind: "draft"/);
  assert.match(lib, /kind: "preflight"/);
  assert.match(lib, /kind: "reuse"/);
  assert.match(lib, /kind: "series"/);
  assert.match(page, /今日やること/);
  assert.match(page, /setNoteScheduleStatus/);
  assert.match(page, /公開前チェックセンター/);
  assert.match(page, /記事 → SNS再利用/);
  assert.match(page, /記事シリーズ・マガジン設計/);
  assert.match(route, /ContentWorkflowPage/);
  assert.match(tools, /MEMBER_TOOL_GROUPS/);
  assert.match(toolCatalog, /href: "\/workflow"/);
  assert.match(nav, /key: "workflow".*href: "\/workflow"/);
  assert.match(home, /href="\/workflow"/);
  assert.match(css, /\.workflow-tabs/);
  assert.match(css, /@media \(max-width: 650px\)/);
});

test("series planner supports AI JSON import, cloud save, status updates, and create handoff", async () => {
  const [lib, page, draft] = await Promise.all([
    read("lib/content-lifecycle.ts"),
    read("components/content-workflow-page.tsx"),
    read("lib/article-create-draft.ts"),
  ]);

  assert.match(lib, /aas-content-series-v1/);
  assert.match(lib, /extractSeriesPlanFromAi/);
  assert.match(lib, /saveContentSeriesPlan/);
  assert.match(lib, /deleteContentSeriesPlan/);
  assert.match(lib, /seriesArticleCreateHref/);
  assert.match(lib, /from: "series-plan"/);
  assert.match(page, /AI回答を読み込んでシリーズ保存/);
  assert.match(page, /updateSeriesStatus/);
  assert.match(page, /この記事を作る/);
  assert.match(draft, /params\.get\("theme"\)/);
  assert.match(draft, /params\.get\("title"\)/);
  assert.match(draft, /source === "series-plan"/);
});

test("account-design compatibility stays available while visible article conditions use account presets", async () => {
  const [link, create] = await Promise.all([
    read("lib/account-article-link.ts"),
    read("components/phase11-create-page.tsx"),
  ]);

  assert.match(link, /applyAccountDesignToArticleDraft/);
  assert.match(link, /GENRE_MAP/);
  assert.match(link, /mainTopics/);
  assert.match(link, /publicationTarget: design\.platform/);
  assert.doesNotMatch(create, /applyActiveAccountDesign|記事条件にも反映/);
  assert.match(create, /activeAccountPreset/);
  assert.match(create, /投稿アカウントプリセット/);
  assert.match(create, /サブジャンル・年齢・性別・文字数・価格/);
});

test("article library exposes preflight and reuse shortcuts", async () => {
  const detail = await read("components/article-library/article-library-detail.tsx");
  assert.match(detail, /workflow\?tab=preflight&article=/);
  assert.match(detail, /公開前チェック/);
  assert.match(detail, /workflow\?tab=reuse&article=/);
  assert.match(detail, /SNS再利用/);
});
