import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("admin security route is protected by shared admin layout and supports backup TOTP", async () => {
  const [layout, route, page, sections] = await Promise.all([
    read("app/admin/layout.tsx"),
    read("app/admin/security/page.tsx"),
    read("components/admin-security-page.tsx"),
    read("lib/admin-sections.ts"),
  ]);

  assert.match(layout, /AdminRouteGuard/);
  assert.match(route, /AdminSecurityPage/);
  assert.match(sections, /href: "\/admin\/security"/);
  assert.match(page, /auth\.mfa\.listFactors\(\)/);
  assert.match(page, /auth\.mfa\.enroll\(/);
  assert.match(page, /factorType: "totp"/);
  assert.match(page, /auth\.mfa\.challenge\(/);
  assert.match(page, /auth\.mfa\.verify\(/);
  assert.match(page, /auth\.mfa\.unenroll\(/);
  assert.match(page, /verifiedFactors\.length <= 1/);
  assert.match(page, /最後のMFA認証器は削除できません/);
  assert.match(page, /主端末とは別/);
});

test("PWA admin section copy no longer advertises Windows entitlement management", async () => {
  const sections = await read("lib/admin-sections.ts");
  assert.match(sections, /PWA利用権/);
  assert.doesNotMatch(sections, /PWA \/ Windows利用権/);
});
