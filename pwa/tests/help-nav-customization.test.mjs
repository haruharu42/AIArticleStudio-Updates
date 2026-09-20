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
  assert.match(manual, /回答全文をそのままコピー/);
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

test("mobile navigation is unified with the home five-item reference nav", async () => {
  const [prefs, nav, settings, manual, faq] = await Promise.all([
    read("lib/mobile-nav-preference.ts"),
    read("components/persistent-mobile-nav.tsx"),
    read("components/pwa-settings-page.tsx"),
    read("app/manual/page.tsx"),
    read("app/faq/page.tsx"),
  ]);

  assert.match(prefs, /MOBILE_NAV_PREFERENCE_KEY/);
  assert.match(nav, /CANONICAL_NAV_ITEMS/);
  for (const label of ["ホーム", "作成", "ライブラリ", "ランキング", "プロフィール"]) {
    assert.match(nav, new RegExp(`label: "${label}"`));
  }
  assert.match(nav, /href: "\/\?section=library"/);
  assert.match(nav, /aas-reference-bottom-nav persistent-mobile-nav unified-reference-mobile-nav/);
  assert.match(nav, /REFERENCE_SHELL_ROUTES/);
  assert.match(nav, /!referenceShellRoute/);
  assert.doesNotMatch(nav, /customItems\.map|readMobileNavItems|mobileNavItemFor|admin-enabled/);
  assert.doesNotMatch(settings, /<MobileNavCustomizer/);
  assert.match(settings, /スマホ下部ナビは全画面で共通/);
  assert.match(settings, /profile\?\.role === "admin"/);
  assert.match(settings, /href="\/admin">管理者画面/);
  assert.match(manual, /ホーム \/ 作成 \/ ライブラリ \/ ランキング \/ プロフィール/);
  assert.match(faq, /5項目に統一/);
  assert.doesNotMatch(`${prefs}\n${nav}\n${settings}`, /sb_secret_|service[_-]?role|sk_(?:live|test)_|whsec_/i);
});

test("unified mobile navigation keeps five equal columns and stays mobile-only", async () => {
  const [layout, flexCss, legacyCss] = await Promise.all([
    read("app/layout.tsx"),
    read("app/phase31-nav-flex.css"),
    read("app/phase22-persistent-nav.css"),
  ]);
  assert.match(layout, /phase31-help-nav\.css/);
  assert.match(layout, /phase31-nav-flex\.css/);
  assert.ok(layout.indexOf("phase31-help-nav.css") < layout.indexOf("phase31-nav-flex.css"));
  assert.match(flexCss, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(flexCss, /@media \(min-width: 900px\)/);
  assert.match(flexCss, /\.unified-reference-mobile-nav/);
  assert.doesNotMatch(flexCss, /admin-enabled|display:\s*flex|flex:\s*1 1 0/);
  assert.doesNotMatch(legacyCss, /center item is now the feature hub/);
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
