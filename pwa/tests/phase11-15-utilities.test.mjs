import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("article output uses only the owned publish body and creates a safe Markdown filename", async () => {
  const api = await read("lib/article-export.ts");
  const page = await read("components/article-export-page.tsx");
  const route = await read("app/export/page.tsx");

  assert.match(api, /workspace\.publishBody \|\| detail\.body/);
  assert.match(api, /normalize\("NFKC"\)/);
  assert.match(page, /getCloudArticleDetail/);
  assert.match(page, /articleExportMarkdown/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /new Blob/);
  assert.match(page, /text\/markdown/);
  assert.match(page, /anchor\.download/);
  assert.match(route, /ArticleExportPage/);
  assert.doesNotMatch(`${api}\n${page}`, /service[_-]?role|sb_secret_/i);
});

test("SNS launch planning covers account setup, content pillars, monetization and improvement without invented results", async () => {
  const api = await read("lib/phase15-sns-plan.ts");
  const page = await read("components/phase15-sns-plan-page.tsx");
  const route = await read("app/sns-plan/page.tsx");

  assert.match(api, /"x" \| "instagram" \| "threads"/);
  assert.match(api, /表示名候補5案/);
  assert.match(api, /自己紹介文候補5案/);
  assert.match(api, /投稿の柱を3〜5本/);
  assert.match(api, /無料コンテンツ→信頼形成→商品\/記事\/相談への導線/);
  assert.match(api, /30日後に確認する改善指標/);
  assert.match(api, /売上・フォロワー数・レビューを創作しない/);
  assert.match(api, /成果を保証せず/);
  assert.match(page, /SNSアカウント立ち上げ設計/);
  assert.match(page, /設計プロンプトをコピー/);
  assert.match(route, /Phase15SnsPlanPage/);
});

test("tools hub exposes output and SNS planning alongside the existing Phase 9-17 surfaces", async () => {
  const tools = await read("components/phase-tools-page.tsx");
  const packageJson = JSON.parse(await read("package.json"));

  assert.match(tools, /href: "\/export"/);
  assert.match(tools, /href: "\/sns-plan"/);
  assert.match(tools, /Phase 11 出力/);
  assert.match(tools, /SNSアカウント設計/);
  assert.match(packageJson.scripts.test, /phase11-15-utilities\.test\.mjs/);
});
