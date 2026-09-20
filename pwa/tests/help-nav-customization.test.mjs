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

  for (const label of ["ホーム", "記事を作る", "記事ライブラリ", "note運営アシスタント：AIスケジュール", "画像生成計画", "SNS投稿を作る", "公開管理", "コンテンツ分析", "アップデート管理", "ユーザー管理", "トラブル時の確認"]) {
    assert.match(manual, new RegExp(label));
  }
  assert.match(manual, /こういう時に使います/);
  assert.match(manual, /AIの回答全文をそのままコピー/);
  assert.match(manual, /管理者→指定テスター→全体公開/);
  for (const label of ["はじめ方・基本操作", "記事・画像・SNS", "PWA・ナビ・表示", "アカウント・利用権・決済", "トラブル・安全性"]) {
    assert.match(faq, new RegExp(label));
  }
  for (const platform of ["X", "Instagram", "Threads", "TikTok", "Facebook", "LinkedIn", "Pinterest", "YouTube"]) {
    assert.ok(manual.includes(platform), `manual missing SNS platform: ${platform}`);
    assert.ok(faq.includes(platform), `FAQ missing SNS platform: ${platform}`);
  }
  assert.match(manual, /スマホでは利用可能なSNSアプリ/);
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


test("desktop navigation can add hide reorder reset and persist items", async () => {
  const [prefs, shell, css, layout] = await Promise.all([
    read("lib/desktop-nav-preference.ts"),
    read("components/aas-reference-shell.tsx"),
    read("app/phase36-desktop-nav.css"),
    read("app/layout.tsx"),
  ]);

  assert.match(prefs, /DESKTOP_NAV_ITEMS_KEY/);
  assert.match(prefs, /MAX_DESKTOP_NAV_ITEMS = 8/);
  assert.match(prefs, /localStorage\.setItem\(DESKTOP_NAV_ITEMS_KEY/);
  for (const label of ["画像作成", "機能", "SNS", "公開管理", "分析", "使い方", "ミッション"]) {
    assert.match(prefs, new RegExp(label));
  }

  assert.match(shell, /ナビをカスタマイズ/);
  assert.match(shell, /表示・非表示と順番を変更できます/);
  assert.match(shell, /move\(key, -1\)/);
  assert.match(shell, /move\(key, 1\)/);
  assert.match(shell, /初期状態に戻す/);
  assert.match(shell, /ホームと設定は常に表示されます/);
  assert.match(shell, /writeDesktopNavItems/);

  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /\.aas-reference-desktop-nav/);
  assert.match(css, /\.aas-desktop-nav-customizer/);
  assert.match(css, /\.aas-reference-mobile-main-nav \{\s*display: none;/);
  assert.match(layout, /phase36-desktop-nav\.css/);

  assert.doesNotMatch(`${prefs}\n${shell}`, /sb_secret_|service[_-]?role|sk_(?:live|test)_|whsec_/i);
});


test("manual quick guide and readability layer are loaded for light user surfaces", async () => {
  const [manual, css, layout] = await Promise.all([
    read("app/manual/page.tsx"),
    read("app/phase39-readability.css"),
    read("app/layout.tsx"),
  ]);

  assert.match(manual, /help-quick-guide/);
  assert.match(manual, /help-when/);
  assert.match(manual, /help-card-links/);
  assert.match(css, /--aas-muted: #536b89/);
  assert.match(css, /\.help-quick-grid/);
  assert.match(css, /\.note-ai-easy-import/);
  assert.match(css, /font-size: 11px/);
  assert.match(layout, /phase39-readability\.css/);
  assert.ok(layout.indexOf("phase38-note-operations.css") < layout.indexOf("phase39-readability.css"));
});
