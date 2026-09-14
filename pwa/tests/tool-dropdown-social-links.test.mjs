import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("preset select exposes an Other choice and reveals a custom input", async () => {
  const source = await read("components/preset-select.tsx");
  assert.match(source, /その他（自由入力）/);
  assert.match(source, /selection === OTHER_VALUE/);
  assert.match(source, /<input/);
  assert.match(source, /onChange\(next === OTHER_VALUE \? "" : next\)/);
});

test("SNS tools expose expanded platforms and direct launch links", async () => {
  const links = await read("lib/social-links.ts");
  const postPage = await read("components/phase14-sns-page.tsx");
  const planPage = await read("components/phase15-sns-plan-page.tsx");

  for (const platform of ["x", "instagram", "threads", "tiktok", "facebook", "linkedin", "pinterest", "youtube"]) {
    assert.ok(links.includes(`"${platform}"`), `missing SNS platform: ${platform}`);
  }
  assert.match(links, /https:\/\/x\.com\/compose\/post/);
  assert.match(links, /https:\/\/www\.instagram\.com\//);
  assert.match(links, /スマホでは対応アプリ/);
  assert.match(postPage, /socialPlatformUrl\(platform\)/);
  assert.match(planPage, /socialPlatformUrl\(input\.platform\)/);
  assert.match(postPage, /PresetSelect label="トーン"/);
  assert.match(planPage, /PresetSelect label="対象読者"/);
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
