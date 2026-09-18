import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("manual and Q&A routes provide full help surfaces", async () => {
  const [manual, faq, home, settings] = await Promise.all([
    read("app/manual/page.tsx"),
    read("app/faq/page.tsx"),
    read("components/phase18-beginner-home.tsx"),
    read("components/pwa-settings-page.tsx"),
  ]);

  for (const label of ["記事を作る", "記事を保存・管理する", "アイキャッチ・挿絵", "SNS投稿", "下部ナビ", "困ったとき"]) {
    assert.match(manual, new RegExp(label));
  }
  for (const label of ["はじめ方・基本操作", "記事・画像・SNS", "PWA・ナビ・表示", "アカウント・利用権・決済", "トラブル・安全性"]) {
    assert.match(faq, new RegExp(label));
  }
  for (const platform of ["X", "Instagram", "Threads", "TikTok", "Facebook", "LinkedIn", "Pinterest", "YouTube"]) {
    assert.ok(manual.includes(platform), `manual missing SNS platform: ${platform}`);
    assert.ok(faq.includes(platform), `FAQ missing SNS platform: ${platform}`);
  }
  assert.match(manual, /スマホでは対応アプリ/);
  assert.match(manual, /PCではWeb版/);
  assert.match(faq, /選択したSNSをすぐ開けますか/);
  assert.match(home, /className="secondary" href="\/manual">使い方を見る/);
  assert.match(home, /href="\/faq">Q&A・よくある質問/);
  assert.match(settings, /href="\/manual">使い方マニュアル/);
  assert.match(settings, /href="\/faq">Q&A・よくある質問/);
});

test("mobile navigation can be selected reordered and persisted without exposing secrets", async () => {
  const [prefs, customizer, nav, css] = await Promise.all([
    read("lib/mobile-nav-preference.ts"),
    read("components/mobile-nav-customizer.tsx"),
    read("components/persistent-mobile-nav.tsx"),
    read("app/phase31-help-nav.css"),
  ]);

  assert.match(prefs, /MOBILE_NAV_ITEMS_KEY/);
  assert.match(prefs, /DEFAULT_MOBILE_NAV_ITEMS/);
  assert.match(prefs, /MAX_CUSTOM_MOBILE_NAV_ITEMS = 3/);
  assert.match(prefs, /localStorage\.setItem\(MOBILE_NAV_ITEMS_KEY/);
  assert.match(customizer, /下部ナビをカスタマイズ/);
  assert.match(customizer, /move\(index, -1\)/);
  assert.match(customizer, /move\(index, 1\)/);
  assert.match(customizer, /初期状態に戻す/);
  assert.match(nav, /readMobileNavItems/);
  assert.match(nav, /customItems\.map/);
  assert.match(nav, /mobileNavItemFor\(key\)/);
  assert.match(nav, /REFERENCE_SHELL_ROUTES/);
  assert.match(nav, /!referenceShellRoute/);
  assert.match(css, /\.nav-customizer/);
  assert.doesNotMatch(`${prefs}\n${customizer}\n${nav}`, /sb_secret_|service[_-]?role|sk_(?:live|test)_|whsec_/i);
});

test("custom navigation layout supports variable item counts and is loaded last", async () => {
  const [layout, flexCss] = await Promise.all([
    read("app/layout.tsx"),
    read("app/phase31-nav-flex.css"),
  ]);
  assert.match(layout, /phase31-help-nav\.css/);
  assert.match(layout, /phase31-nav-flex\.css/);
  assert.ok(layout.indexOf("phase31-help-nav.css") < layout.indexOf("phase31-nav-flex.css"));
  assert.match(flexCss, /\.persistent-mobile-nav\.admin-enabled/);
  assert.match(flexCss, /display:\s*flex/);
  assert.match(flexCss, /flex:\s*1 1 0/);
});
