import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all /admin routes are wrapped by the shared active-admin and MFA gate", () => {
  const layout = read("app/admin/layout.tsx");
  const guard = read("components/admin-route-guard.tsx");

  assert.match(layout, /AdminRouteGuard/);
  assert.match(layout, /<AdminRouteGuard>\{children\}<\/AdminRouteGuard>/);
  assert.match(guard, /profile\.role !== "admin" \|\| profile\.status !== "active"/);
  assert.match(guard, /auth\.mfa\.listFactors\(\)/);
  assert.match(guard, /factor\.status === "verified"/);
  assert.match(guard, /auth\.mfa\.getAuthenticatorAssuranceLevel\(\)/);
  assert.match(guard, /aal\.currentLevel !== "aal2"/);
  assert.match(guard, /auth\.mfa\.enroll\(\{/);
  assert.match(guard, /factorType: "totp"/);
  assert.match(guard, /auth\.mfa\.challenge\(\{ factorId \}\)/);
  assert.match(guard, /auth\.mfa\.verify\(\{/);
  assert.match(guard, /gate\.kind === "ready"/);
  assert.match(guard, /このページを表示する権限がありません/);
  assert.match(guard, /管理者画面を保護するため/);
});

test("admin home is navigation-only and sections are centralized", () => {
  const home = read("app/admin/page.tsx");
  const users = read("app/admin/users/page.tsx");
  const registry = read("lib/admin-sections.ts");

  assert.doesNotMatch(home, /Phase10AdminPage/);
  assert.match(home, /ADMIN_SECTIONS\.map/);
  for (const route of [
    "/admin/users",
    "/admin/free-trial",
    "/admin/sales",
    "/admin/promotion",
    "/admin/knowledge",
    "/admin/operations",
  ]) {
    assert.match(registry, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(users, /Phase10AdminPage/);
});

test("public home admin shortcut stays hidden until active-admin state is verified", () => {
  const topbar = read("components/admin-home-topbar.tsx");

  assert.match(topbar, /useState\(false\)/);
  assert.match(topbar, /data\.role === "admin" && data\.status === "active"/);
  assert.match(topbar, /!admin\) return null/);
  assert.match(topbar, /ADMIN_HOME_SHORTCUT_IDS/);
});
