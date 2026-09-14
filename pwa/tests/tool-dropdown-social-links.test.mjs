import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("preset select exposes an Other choice and supports guarded numeric custom input", async () => {
  const source = await read("components/preset-select.tsx");
  assert.match(source, /その他（自由入力）/);
  assert.match(source, /selection === OTHER_VALUE/);
  assert.match(source, /<input/);
  assert.match(source, /onChange\(next === OTHER_VALUE \? "" : next\)/);
  assert.match(source, /customInputType\?: "text" \| "number"/);
  assert.match(source, /inputMode=\{customInputType === "number" \? "numeric" : undefined\}/);
  assert.match(source, /min=\{customMin\}/);
  assert.match(source, /max=\{customMax\}/);
});

test("SNS tools expose expanded platforms and current direct launch links", async () => {
  const links = await read("lib/social-links.ts");
  const postPage = await read("components/phase14-sns-page.tsx");
  const planPage = await read("components/phase15-sns-plan-page.tsx");

  for (const platform of ["x", "instagram", "threads", "tiktok", "facebook", "linkedin", "pinterest", "youtube"]) {
    assert.ok(links.includes(`"${platform}"`), `missing SNS platform: ${platform}`);
  }
  assert.match(links, /https:\/\/x\.com\/compose\/post/);
  assert.match(links, /https:\/\/www\.instagram\.com\//);
  assert.match(links, /https:\/\/www\.threads\.com\//);
  assert.doesNotMatch(links, /threads\.net/);
  assert.match(links, /スマホでは対応アプリ/);
  assert.match(postPage, /socialPlatformUrl\(platform\)/);
  assert.match(planPage, /socialPlatformUrl\(input\.platform\)/);
  assert.match(postPage, /PresetSelect label="トーン"/);
  assert.match(planPage, /PresetSelect label="対象読者"/);
});

test("numeric Other inputs stay synchronized and invalid SNS length cannot consume quota", async () => {
  const postPage = await read("components/phase14-sns-page.tsx");
  const planPage = await read("components/phase15-sns-plan-page.tsx");
  const sideJobPage = await read("components/phase15-sidejob-page.tsx");

  assert.match(postPage, /customInputType="number" customMin=\{1\} customMax=\{100000\}/);
  assert.match(planPage, /customInputType="number" customMin=\{1\} customMax=\{21\}/);
  assert.match(sideJobPage, /customInputType="number" customMin=\{1\} customMax=\{100\}/);
  assert.match(planPage, /Math\.max\(1, Math\.min\(21, Math\.trunc\(parsed\)\)\)/);
  assert.match(sideJobPage, /Math\.max\(1, Math\.min\(100, Math\.trunc\(parsed\)\)\)/);

  const validationIndex = postPage.indexOf("編集上の文字数目安は1〜100000の数字で入力してください");
  const consumeIndex = postPage.indexOf('consumeFreeTrialUsage(getSupabaseClient(), "sns_generate")');
  assert.ok(validationIndex >= 0, "SNS length validation is missing");
  assert.ok(consumeIndex > validationIndex, "SNS quota must be consumed only after validating custom length");
});

test("image and side-job tools use guided choices with custom fallback", async () => {
  const imagePage = await read("components/phase13-image-page.tsx");
  const sideJobPage = await read("components/phase15-sidejob-page.tsx");
  const options = await read("lib/phase18-content-options.ts");

  assert.match(imagePage, /PresetSelect label="対象年齢"/);
  assert.match(imagePage, /PresetSelect label="対象性別"/);
  assert.match(sideJobPage, /PresetSelect label="週の作業時間"/);
  assert.match(options, /"AI・テクノロジー"/);
  assert.match(options, /"マーケティング"/);
  assert.match(options, /"ゲーム・配信"/);
  assert.match(options, /value: 15000/);
});
