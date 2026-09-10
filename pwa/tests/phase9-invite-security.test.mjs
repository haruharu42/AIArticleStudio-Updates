import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(root, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

const guardMigration =
  "supabase/migrations/20260910122000_phase9_pwa_invite_existing_entitlement_guard.sql";
const profileVariableFix =
  "supabase/migrations/20260910122500_phase9_pwa_invite_profile_variable_fix.sql";

test("invite redemption cannot overwrite a still-valid or unlimited PWA entitlement", async () => {
  const sql = await readRepo(guardMigration);

  assert.match(sql, /create or replace function public\.redeem_pwa_invite/);
  assert.match(sql, /on conflict \(user_id, product_id\) where status = 'active'/);
  assert.match(sql, /where entitlement\.expires_at is not null\s+and entitlement\.expires_at <= now\(\)/);
  assert.match(sql, /if entitlement_id is null then\s+raise exception 'PWA entitlement already active'/);
  assert.match(sql, /insert into public\.pwa_invite_redemptions/);
  assert.match(sql, /use_count = use_count \+ 1/);
  assert.doesNotMatch(sql, /service[_-]?role|sb_secret_/i);
});

test("final invite RPC avoids PostgreSQL CURRENT_ROLE keyword collision", async () => {
  const sql = await readRepo(profileVariableFix);

  assert.match(sql, /profile_role text;/);
  assert.match(sql, /profile_state text;/);
  assert.match(sql, /into current_aas_id, profile_role, profile_state/);
  assert.match(sql, /profile_role <> 'user'/);
  assert.match(sql, /profile_state not in \('pending', 'active'\)/);
  assert.match(sql, /profile_state\s+from public\.user_entitlements/);
  assert.doesNotMatch(sql, /current_role text;/i);
  assert.doesNotMatch(sql, /service[_-]?role|sb_secret_/i);
});

test("PWA invite client maps an existing entitlement to a safe user-facing message", async () => {
  const api = await read("lib/phase9-invite.ts");

  assert.match(api, /entitlement already active/);
  assert.match(api, /有効なPWA利用権がすでにあります/);
  assert.doesNotMatch(api, /service[_-]?role|sb_secret_/i);
});
