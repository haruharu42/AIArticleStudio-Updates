import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("security errors expose a copyable repair prompt with secret redaction", async () => {
  const prompt = await read("components/security-repair-prompt.tsx");

  assert.match(prompt, /修正用プロンプト/);
  assert.match(prompt, /修正用プロンプトをコピー/);
  assert.match(prompt, /navigator\.clipboard\?\.writeText/);
  assert.match(prompt, /document\.execCommand\("copy"\)/);
  assert.match(prompt, /REDACTED_JWT/);
  assert.match(prompt, /REDACTED_SECRET/);
  assert.match(prompt, /service_role/);
  assert.match(prompt, /Windows Updater\/Release\/latest\.json/);
  assert.match(prompt, /Stripe LIVE/);
  assert.match(prompt, /Cloudflare production routing\/custom domain\/DNS/);
  assert.match(prompt, /RLS/);
  assert.match(prompt, /typecheck・lint・回帰テスト/);
});

test("admin MFA security errors render the repair prompt only when an error exists", async () => {
  const page = await read("components/admin-security-page.tsx");

  assert.match(page, /import \{ SecurityRepairPrompt \}/);
  assert.match(page, /errorMessage && \(/);
  assert.match(page, /<SecurityRepairPrompt/);
  assert.match(page, /summary=\{errorMessage\}/);
  assert.match(page, /\/admin\/security/);
});

test("security operations aggregates unresolved events and findings into the repair prompt", async () => {
  const [panel, route] = await Promise.all([
    read("components/operations-security-repair-prompt.tsx"),
    read("app/admin/operations/page.tsx"),
  ]);

  assert.match(route, /OperationsSecurityRepairPanel/);
  assert.match(panel, /event\.status !== "resolved"/);
  assert.match(panel, /event\.severity === "critical"/);
  assert.match(panel, /event\.severity === "error"/);
  assert.match(panel, /event\.severity === "warning"/);
  assert.match(panel, /snapshot\?\.findings/);
  assert.match(panel, /worker\?\.ok === false/);
  assert.match(panel, /SecurityRepairPrompt/);
  assert.doesNotMatch(panel, /lastAasUserId/);
  assert.doesNotMatch(panel, /requestId/);
});
