import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("AI Action Studio branding is used on the active PWA shell", async () => {
  const [layout, shell, legacyShell, manifest, home] = await Promise.all([
    read("app/layout.tsx"),
    read("components/aas-reference-shell.tsx"),
    read("components/phase6-app.tsx"),
    read("public/manifest.webmanifest"),
    read("components/phase18-beginner-home.tsx"),
  ]);

  assert.match(layout, /AI Action Studio/);
  assert.match(layout, /AIで副業を、もっと簡単に。/);
  assert.match(shell, /AI Action Studio/);
  assert.match(shell, /AIで副業を、もっと簡単に。/);
  assert.match(legacyShell, /AI ACTION/);
  assert.match(legacyShell, /AIで副業を、/);
  assert.doesNotMatch(legacyShell, /AI ARTICLE/);
  assert.match(manifest, /AI Action Studio/);
  assert.match(home, /ActionStudioHomeHub/);
});

test("home keeps quick actions while side-hustle discovery lives in the genre-grouped feature list", async () => {
  const [hub, tools, catalog, home, css, layout] = await Promise.all([
    read("components/action-studio-home-hub.tsx"),
    read("components/phase-tools-page.tsx"),
    read("features/tools/tool-catalog.ts"),
    read("components/phase18-beginner-home.tsx"),
    read("app/phase48-action-studio.css"),
    read("app/layout.tsx"),
  ]);

  for (const label of [
    "よく使う機能",
    "記事を作る",
    "SNS投稿を作る",
    "画像を作る",
    "副業プロンプトを探す",
    "ジャンル別に機能を見る",
  ]) {
    assert.match(hub, new RegExp(label));
  }

  assert.doesNotMatch(hub, /<h3>副業から探す<\/h3>/);
  assert.doesNotMatch(hub, /const sideHustles/);
  assert.match(hub, /href: "\/tools"/);

  for (const genre of [
    "記事・コンテンツ",
    "SNS・動画・集客",
    "販売・収益化",
    "受託・案件獲得",
    "リサーチ・業務効率化",
    "運営・アカウント",
    "公開・分析",
    "サポート",
  ]) {
    assert.match(catalog, new RegExp(genre));
  }

  for (const sideHustle of [
    "note運営アシスタント",
    "記事・ブログ・コンテンツ販売",
    "SNS運用・集客",
    "YouTube・ショート動画",
    "アフィリエイト",
    "物販・フリマ販売",
    "クラウドソーシング",
    "スキル販売",
    "デジタル商品・教材販売",
    "営業DM・問い合わせ",
    "リサーチ・事実確認",
    "業務効率化・SOP化",
    "AI副業プランナー",
  ]) {
    assert.match(catalog, new RegExp(sideHustle));
  }

  assert.match(tools, /MEMBER_TOOL_GROUPS/);
  assert.match(tools, /FEATURE GENRE/);
  assert.match(tools, /副業ジャンルと用途ごとに機能をまとめています/);
  assert.match(home, /<ActionStudioHomeHub \/>/);
  assert.match(layout, /phase48-action-studio\.css/);
  assert.match(css, /\.action-studio-card-grid/);
});
