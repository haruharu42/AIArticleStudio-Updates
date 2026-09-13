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
