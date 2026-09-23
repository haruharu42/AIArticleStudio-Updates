import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("side-hustle prompt library is searchable, copy-first, and uses existing external AI handoff", async () => {
  const [catalog, page, route, nav, layout] = await Promise.all([
    read("lib/action-prompt-catalog.ts"),
    read("components/action-prompt-library-page.tsx"),
    read("app/prompts/page.tsx"),
    read("lib/mobile-nav-preference.ts"),
    read("app/layout.tsx"),
  ]);

  for (const category of ["記事・コンテンツ", "SNS", "動画・YouTube", "画像・デザイン", "アフィリエイト", "物販・販売", "クラウドソーシング", "リサーチ", "業務効率化"]) {
    assert.match(catalog, new RegExp(category));
  }
  assert.match(catalog, /入力されていない実績/);
  assert.match(page, /副業プロンプトライブラリ/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /launchAiApp/);
  assert.match(page, /お気に入り/);
  assert.match(page, /最近使った/);
  assert.match(route, /Phase15MemberGate/);
  assert.match(nav, /key: "prompts"/);
  assert.match(layout, /phase49-prompt-library\.css/);
  assert.doesNotMatch(`${catalog}\n${page}`, /sb_secret_|service[_-]?role|sk_(?:live|test)_|whsec_/i);
});
