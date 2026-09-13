import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

const publicFeatureFiles = [
  "components/phase-tools-page.tsx",
  "components/phase9-invite-page.tsx",
  "components/phase10-admin-page.tsx",
  "components/admin-promotion-page.tsx",
  "components/phase13-image-page.tsx",
  "components/phase14-sns-page.tsx",
  "components/phase15-sidejob-page.tsx",
  "components/phase15-sns-plan-page.tsx",
  "components/phase16-publish-page.tsx",
  "components/phase17-analytics-page.tsx",
];

test("public feature surfaces do not expose development phase numbers", async () => {
  const sources = await Promise.all(publicFeatureFiles.map(read));
  for (const source of sources) {
    assert.doesNotMatch(source, /PHASE\s+\d/i);
  }
});

test("feature hub uses user-facing categories instead of phase badges", async () => {
  const tools = await read("components/phase-tools-page.tsx");
  for (const label of ["記事制作", "画像", "SNS", "副業支援", "SNS設計", "出力", "公開", "分析"]) {
    assert.match(tools, new RegExp(label));
  }
  assert.doesNotMatch(tools, /phase:\s*["']/i);
});

test("admin dashboard exposes readable operations summary and management sections", async () => {
  const admin = await read("components/phase10-admin-page.tsx");
  for (const label of ["運用サマリー", "要対応", "利用権・販売状況", "ユーザー管理", "アカウント詳細", "PWA招待コード"]) {
    assert.match(admin, new RegExp(label));
  }
  assert.match(admin, /PWA利用者/);
  assert.match(admin, /Windows利用者/);
  assert.match(admin, /AAS ID・表示名/);
  assert.match(admin, /コードをコピー/);
});

test("admin dashboard keeps two-column summary cards on narrow mobile screens", async () => {
  const css = await read("app/phase23-admin-dashboard.css");
  const layout = await read("app/layout.tsx");
  assert.match(layout, /phase23-admin-dashboard\.css/);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*?\.admin-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /\.admin-workspace/);
  assert.match(css, /\.admin-invite-layout/);
});

test("admin-only promotion tools are hidden behind active admin state", async () => {
  const tools = await read("components/phase-tools-page.tsx");
  const promotion = await read("components/admin-promotion-page.tsx");
  const route = await read("app/admin/promotion/page.tsx");
  for (const label of ["管理者専用", "販売・宣伝記事作成", "SNSプロモーション", "キャンペーン設計", "製品情報管理"]) {
    assert.match(tools, new RegExp(label));
  }
  assert.match(tools, /state\.profile\.role === "admin"/);
  assert.match(tools, /state\.profile\.status === "active"/);
  assert.match(promotion, /active管理者のみ利用できます/);
  assert.match(promotion, /販売・プロモーションセンター/);
  assert.match(route, /AdminPromotionPage/);
  assert.doesNotMatch(`${tools}\n${promotion}`, /sb_secret_|service[_-]?role/i);
});

test("admin promotion prompts protect confirmed product facts and cover article plus social sales", async () => {
  const api = await read("lib/admin-promotion.ts");
  for (const label of ["確認済み製品情報", "販売・宣伝", "Instagram", "Threads", "TikTok", "YouTube Shorts", "14日分の投稿カレンダー"]) {
    assert.match(api, new RegExp(label));
  }
  assert.match(api, /価格、実績、利用者数、売上、レビュー、キャンペーン/);
  assert.match(api, /成果保証や過度な煽り/);
  assert.match(api, /架空の購入者レビュー/);
  assert.doesNotMatch(api, /service[_-]?role|sb_secret_/i);
});

test("active admins receive a top-of-home dashboard shortcut and an admin nav item", async () => {
  const topbar = await read("components/admin-home-topbar.tsx");
  const nav = await read("components/persistent-mobile-nav.tsx");
  const css = await read("app/phase24-admin-promotion.css");
  const layout = await read("app/layout.tsx");
  assert.match(topbar, /pathname !== "\/"/);
  assert.match(topbar, /data\.role === "admin"/);
  assert.match(topbar, /管理ダッシュボード/);
  assert.match(topbar, /販売・SNSプロモーション/);
  assert.match(nav, /data\.role === "admin"/);
  assert.match(nav, />管理<\/button>/);
  assert.match(nav, /go\("\/admin"\)/);
  assert.match(css, /\.persistent-mobile-nav\.admin-enabled/);
  assert.match(css, /repeat\(6,/);
  assert.match(layout, /AdminHomeTopbar/);
  assert.match(layout, /phase24-admin-promotion\.css/);
});
