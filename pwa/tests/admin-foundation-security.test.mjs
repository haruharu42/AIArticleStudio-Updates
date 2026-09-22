import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all /admin routes keep the active-admin boundary while MFA is temporarily optional", () => {
  const layout = read("app/admin/layout.tsx");
  const guard = read("components/admin-route-guard.tsx");

  assert.match(layout, /AdminRouteGuard/);
  assert.match(layout, /<AdminRouteGuard>\{children\}<\/AdminRouteGuard>/);
  assert.match(guard, /accessState\.profile\.role !== "admin" \|\|[\s\S]*?accessState\.profile\.status !== "active"/);
  assert.match(guard, /ADMIN_MFA_REQUIRED = false/);
  assert.match(guard, /if \(!ADMIN_MFA_REQUIRED\)/);
  assert.match(guard, /setGate\(\{ kind: "ready" \}\)/);
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
});

test("admin MFA enrollment recovers from interrupted unverified primary factors", () => {
  const guard = read("components/admin-route-guard.tsx");

  assert.match(guard, /ADMIN_MFA_FRIENDLY_NAME = "AAS PWA Admin"/);
  assert.match(guard, /factor\.status !== "verified"/);
  assert.match(guard, /factor\.friendly_name === ADMIN_MFA_FRIENDLY_NAME/);
  assert.match(guard, /auth\.mfa\.unenroll\(\{ factorId: factor\.id \}\)/);
  assert.match(guard, /スマホ1台だけで設定する場合/);
  assert.match(guard, /セットアップキー/);
  assert.match(guard, /設定をキャンセル/);
});

test("database admin boundary temporarily allows active admins without AAL2", () => {
  const migration = read("../supabase/migrations/20260917073000_pwa_admin_mfa_temporarily_optional.sql");

  assert.match(migration, /create or replace function private\.is_active_admin\(\)/i);
  assert.match(migration, /role = 'admin'/);
  assert.match(migration, /status = 'active'/);
  assert.doesNotMatch(migration, /auth\.jwt\(\)->>'aal'/);
  assert.doesNotMatch(migration, /= 'aal2'/);
  assert.match(migration, /Re-enable the AAL2 condition before public production launch/);
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

  assert.match(topbar, /useSharedAccessState\(\)/);
  assert.match(topbar, /state\.kind === "ready" && state\.profile\.role === "admin" && state\.profile\.status === "active"/);
  assert.match(topbar, /pathname !== "\/" \|\| !admin\) return null/);
  assert.match(topbar, /ADMIN_HOME_SHORTCUT_IDS/);
});
