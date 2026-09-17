import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("admin user access page keeps its scoped simplified workflow", async () => {
  const page = await read("app/admin/users/page.tsx");
  const baseCss = await read("app/admin/users/admin-users-page.module.css");
  const polishCss = await read("app/admin/users/admin-users-polish.module.css");
  const component = await read("components/pwa-admin-users-page.tsx");
  const adminUsers = await read("lib/pwa-admin-users.ts");

  assert.match(page, /admin-users-page\.module\.css/);
  assert.match(page, /admin-users-polish\.module\.css/);
  assert.match(page, /styles\.scope/);
  assert.match(page, /polish\.polish/);
  assert.match(page, /<Phase10AdminPage \/>/);

  for (const className of [
    "admin-dashboard",
    "admin-card",
    "admin-user-list",
    "admin-form-grid",
    "admin-actions",
    "admin-entitlement-list",
    "admin-invite-list",
  ]) {
    assert.match(baseCss, new RegExp(`:global\\(\\.${className}`));
  }

  for (const className of [
    "admin-simple-stats",
    "admin-step-number",
    "admin-filter-row",
    "status-chip",
    "admin-simple-actions",
    "admin-action-card",
    "admin-advanced-details",
    "admin-user-details-drawer",
    "admin-tools-drawer",
    "admin-empty-state",
  ]) {
    assert.match(polishCss, new RegExp(`:global\\(\\.${className}`));
  }

  assert.match(component, /PWAユーザー利用管理/);
  assert.match(component, /PWA利用権はPC・スマホ・タブレット共通です/);
  assert.match(component, /端末ごとの承認や追加の利用権付与は必要ありません/);
  assert.doesNotMatch(component, /Windowsアプリ版|既存Windows機能|AAS-WIN-BETA/);
  assert.match(component, /まず操作したいユーザーを選択します/);
  assert.match(component, /通常の管理は「アカウント」「PWA利用権」「Creator Club特典」の3項目だけです/);
  assert.match(component, /PWA利用権を付与する/);
  assert.match(component, /全端末で利用可能/);
  assert.match(component, /期限や付与元を指定する/);
  assert.match(component, /期限・確認メモを設定する/);
  assert.match(component, /通常のユーザー管理では、この機能を操作する必要はありません/);
  assert.match(component, /note購入状態の自動取得は行わず/);
  assert.match(component, /利用コードをコピーしました/);

  assert.match(adminUsers, /export const PWA_PRODUCT = "AAS-PWA-BETA" as const/);
  assert.doesNotMatch(adminUsers, /PWA_(?:PC|MOBILE)_PRODUCT/);

  assert.match(baseCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(baseCss, /@media \(max-width: 760px\)/);
  assert.match(baseCss, /padding-bottom: 102px/);
  assert.match(polishCss, /@media \(max-width: 760px\)/);
});
