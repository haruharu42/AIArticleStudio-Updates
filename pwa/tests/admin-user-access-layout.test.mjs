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

  assert.match(component, /基本操作は「ユーザーを選ぶ → 状態を確認 → 必要なボタンを押す」の3ステップだけです/);
  assert.match(component, /まず操作したいユーザーを選択します/);
  assert.match(component, /下の3項目だけ確認すれば、通常のユーザー管理は完了です/);
  assert.match(component, /PWAを使えるようにする/);
  assert.match(component, /期限や付与元を指定する/);
  assert.match(component, /期限・確認メモを設定する/);
  assert.match(component, /通常のユーザー管理では、この機能を操作する必要はありません/);
  assert.match(component, /note購入状態の自動取得は行いません/);
  assert.match(component, /利用コードをコピーしました/);

  assert.match(baseCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(baseCss, /@media \(max-width: 760px\)/);
  assert.match(baseCss, /padding-bottom: 102px/);
  assert.match(polishCss, /@media \(max-width: 760px\)/);
});
