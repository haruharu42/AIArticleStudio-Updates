import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all /admin routes are wrapped by the shared active-admin gate", () => {
  const layout = read("app/admin/layout.tsx");
  const guard = read("components/admin-route-guard.tsx");

  assert.match(layout, /AdminRouteGuard/);
  assert.match(layout, /<AdminRouteGuard>\{children\}<\/AdminRouteGuard>/);
  assert.match(guard, /profile\.role !== "admin" \|\| profile\.status !== "active"/);
  assert.match(guard, /gate\.kind === "ready"/);
  assert.match(guard, /このページを表示する権限がありません/);
});

test("admin home is navigation-only and user management has its own route", () => {
  const home = read("app/admin/page.tsx");
  const users = read("app/admin/users/page.tsx");

  assert.doesNotMatch(home, /Phase10AdminPage/);
  assert.match(home, /href: "\/admin\/users"/);
  assert.match(home, /href: "\/admin\/free-trial"/);
  assert.match(home, /href: "\/admin\/sales"/);
  assert.match(home, /href: "\/admin\/promotion"/);
  assert.match(home, /href: "\/admin\/knowledge"/);
  assert.match(home, /href: "\/admin\/operations"/);
  assert.match(users, /Phase10AdminPage/);
});

test("public home admin shortcut stays hidden until active-admin state is verified", () => {
  const topbar = read("components/admin-home-topbar.tsx");

  assert.match(topbar, /useState\(false\)/);
  assert.match(topbar, /data\.role === "admin" && data\.status === "active"/);
  assert.match(topbar, /!admin\) return null/);
});
