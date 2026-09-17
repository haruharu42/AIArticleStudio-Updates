import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("admin user access page keeps its scoped responsive layout", async () => {
  const page = await read("app/admin/users/page.tsx");
  const css = await read("app/admin/users/admin-users-page.module.css");

  assert.match(page, /admin-users-page\.module\.css/);
  assert.match(page, /className=\{styles\.scope\}/);
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
    assert.match(css, new RegExp(`:global\\(\\.${className}`));
  }

  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /padding-bottom: 102px/);
});
