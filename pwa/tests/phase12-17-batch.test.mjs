import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Phase 12 specializes article prompts without weakening editorial safety", async () => {
  const profiles = await read("lib/phase12-prompt-profiles.ts");
  const creator = await read("lib/phase11-create.ts");

  assert.match(profiles, /AI\\s\*副業/);
  assert.match(profiles, /美容/);
  assert.match(profiles, /ガジェット/);
  assert.match(profiles, /生活/);
  assert.match(profiles, /SNS/);
  assert.match(profiles, /note:/);
  assert.match(profiles, /tips:/);
  assert.match(profiles, /brain:/);
  assert.match(profiles, /収益額や成果を保証しない/);
  assert.match(profiles, /有料部分/);
  assert.match(creator, /getPromptSpecialization/);
  assert.match(creator, /prompt_profile_version: 12/);
});

test("Phase 13 builds cover and inline prompt plans and stores them in the article workspace", async () => {
  const imagePrompts = await read("lib/phase13-image-prompts.ts");
  const creator = await read("lib/phase11-create.ts");
  const page = await read("components/phase13-image-page.tsx");
  const route = await read("app/images/page.tsx");

  assert.match(imagePrompts, /日本の現代的な2Dアニメ調/);
  assert.match(imagePrompts, /既存作品・特定作家・実在人物/);
  assert.match(imagePrompts, /IMAGE:\$\{number\}/);
  assert.match(imagePrompts, /coverEnabled/);
  assert.match(imagePrompts, /inlineEnabled/);
  assert.match(creator, /buildImagePromptPlan/);
  assert.match(creator, /prompt_plan: imagePrompts/);
  assert.match(creator, /image_prompt_version: 13/);
  assert.match(page, /buildImagePromptPlan/);
  assert.match(page, /アイキャッチ/);
  assert.match(page, /挿絵/);
  assert.match(route, /Phase13ImagePromptPage/);
});

test("Phase 14 converts owned article content into X, Instagram and Threads prompt workflows", async () => {
  const api = await read("lib/phase14-sns.ts");
  const page = await read("components/phase14-sns-page.tsx");
  const route = await read("app/sns/page.tsx");

  assert.match(api, /"x" \| "instagram" \| "threads"/);
  assert.match(api, /記事にない実体験・実績・レビュー・成果を追加しない/);
  assert.match(api, /article\.workspace\.publishBody \|\| article\.body/);
  assert.match(page, /listCloudArticles/);
  assert.match(page, /getCloudArticleDetail/);
  assert.match(page, /buildSocialPrompt/);
  assert.match(route, /Phase14SnsPage/);
  assert.doesNotMatch(`${api}\n${page}`, /sb_secret_|service[_-]?role/i);
});

test("Phase 15 ranks side jobs as an internal fit aid and exports a non-guaranteed strategy prompt", async () => {
  const api = await read("lib/phase15-sidejob.ts");
  const page = await read("components/phase15-sidejob-page.tsx");
  const route = await read("app/sidejob/page.tsx");

  assert.match(api, /note \/ Tips \/ Brain コンテンツ販売/);
  assert.match(api, /SNS運用代行・投稿作成/);
  assert.match(api, /YouTube \/ TikTok \/ 配信クリエイター/);
  assert.match(api, /収益額・成功率・フォロワー数などを保証しない/);
  assert.match(api, /\.sort\(\(a, b\) => b\.score - a\.score/);
  assert.match(page, /適合スコアはAAS内の比較用/);
  assert.match(route, /Phase15SideJobPage/);
});

test("Phase 16 records publication state with optimistic revision and no external auto-post", async () => {
  const api = await read("lib/phase16-publish.ts");
  const page = await read("components/phase16-publish-page.tsx");
  const route = await read("app/publish/page.tsx");

  assert.match(api, /update_article_with_workspace/);
  assert.match(api, /p_expected_revision: detail\.revision/);
  assert.match(api, /published_url/);
  assert.match(api, /scheduled_at/);
  assert.match(api, /published_at/);
  assert.match(page, /外部サービスへの自動投稿/);
  assert.match(route, /Phase16PublishPage/);
  assert.doesNotMatch(`${api}\n${page}`, /fetch\(["']https?:\/\//i);
});

test("Phase 17 reports only internal article metrics until external analytics are connected", async () => {
  const api = await read("lib/phase17-analytics.ts");
  const page = await read("components/phase17-analytics-page.tsx");
  const route = await read("app/analytics/page.tsx");

  assert.match(api, /get_my_article_stock_summary/);
  assert.match(api, /listCloudArticles/);
  assert.match(api, /publishedRate/);
  assert.match(page, /閲覧数・売上・SNS反応など外部サービスの実績値/);
  assert.match(route, /Phase17AnalyticsPage/);
});

test("tools hub and beginner-first root expose all functional routes with SNS in mobile navigation", async () => {
  const tools = await read("components/phase-tools-page.tsx");
  const toolsRoute = await read("app/tools/page.tsx");
  const shell = await read("components/phase18-beginner-home.tsx");
  const rootPage = await read("app/page.tsx");
  const layout = await read("app/layout.tsx");
  const css = await read("app/phase12-17.css");
  const beginnerCss = await read("app/phase18-beginner.css");
  const dashboardCss = await read("app/phase19-dashboard.css");

  for (const href of ["/create", "/images", "/sns", "/sidejob", "/publish", "/analytics"]) {
    assert.match(tools, new RegExp(`href: \\"${href.replace("/", "\\/")}\\"`));
  }
  assert.match(tools, /try \{/);
  assert.match(tools, /getSupabaseClient\(\)/);
  assert.match(toolsRoute, /PhaseToolsPage/);
  assert.match(rootPage, /Phase18BeginnerHome/);
  assert.match(shell, /Phase7App/);
  assert.match(shell, /href="\/tools"/);
  assert.match(shell, /href="\/images"/);
  assert.match(shell, /href="\/sns"/);
  assert.match(shell, />作成<\/button>/);
  assert.match(shell, />ライブラリ<\/button>/);
  assert.match(shell, />SNS<\/button>/);
  assert.match(shell, />設定<\/button>/);
  assert.doesNotMatch(shell, />画像<\/button>/);
  assert.match(layout, /phase12-17\.css/);
  assert.match(layout, /phase18-beginner\.css/);
  assert.match(layout, /phase19-dashboard\.css/);
  assert.match(layout, /"aas-phase": "17"/);
  assert.match(layout, /"aas-release-stage": "production-preview"/);
  assert.doesNotMatch(layout, /phase8-local/);
  assert.match(css, /\.tool-grid/);
  assert.match(css, /\.analytics-grid/);
  assert.match(css, /\.image-prompt-list/);
  assert.match(beginnerCss, /\.beginner-bottom-nav/);
  assert.match(beginnerCss, /\.beginner-action-grid/);
  assert.match(dashboardCss, /\.beginner-mobile-nav/);
  assert.match(dashboardCss, /\.beginner-desktop-sidebar/);
});

test("package includes the Phase 12-17 contract test and keeps dependency pins unchanged", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.match(packageJson.scripts.test, /phase12-17-batch\.test\.mjs/);
  assert.equal(packageJson.dependencies.next, "16.3.4");
  assert.equal(packageJson.dependencies.react, "19.2.8");
  assert.equal(packageJson.dependencies["@supabase/supabase-js"], "2.112.3");
  assert.equal(packageJson.devDependencies.vinext, "1.0.0-beta.9");
  assert.equal(packageJson.overrides.sharp, "0.35.4");
});
