import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

const publicFeatureFiles = [
  "components/phase-tools-page.tsx",
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
