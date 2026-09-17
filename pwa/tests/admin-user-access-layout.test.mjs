import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("admin user access page keeps its scoped responsive dashboard", async () => {
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
    "admin-kpi-grid",
    "admin-filter-row",
    "status-chip",
    "admin-user-meta-grid",
    "admin-subsection-head",
    "admin-code-summary",
    "admin-code-actions",
    "admin-empty-state",
  ]) {
    assert.match(polishCss, new RegExp(`:global\\(\\.${className}`));
  }

  assert.match(component, /type UserFilter = "all" \| PwaAdminUser\["status"\]/);
  assert.match(component, /USER_FILTERS/);
  assert.match(component, /userStats/);
  assert.match(component, /codeStats/);
  assert.match(component, /条件に一致するユーザーはいません/);
  assert.match(component, /利用コードをコピーしました/);
  assert.match(component, /disabled=\{busy \|\| !entitlements\.length\}/);
  assert.match(component, /disabled=\{busy \|\| !membershipEntitlements\.length\}/);

  assert.match(baseCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(baseCss, /@media \(max-width: 760px\)/);
  assert.match(baseCss, /padding-bottom: 102px/);
  assert.match(polishCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(polishCss, /@media \(max-width: 760px\)/);
});
