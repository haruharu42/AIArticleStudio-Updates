import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("pins the browser client and PWA product contract", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const access = await read("lib/phase6-access.ts");
  const client = await read("lib/supabase.ts");

  assert.equal(packageJson.dependencies["@supabase/supabase-js"], "2.112.3");
  assert.match(access, /AAS-PWA-BETA/);
  assert.match(access, /auth\.getUser\(\)/);
  assert.match(access, /\.from\("profiles"\)/);
  assert.match(access, /"can_access_product"/);
  assert.match(client, /flowType:\s*"pkce"/);
  assert.match(client, /detectSessionInUrl:\s*false/);
  assert.match(client, /sb_secret_/);
});

test("keeps Phase 6 separate from article and image data", async () => {
  const source = [
    await read("components/phase6-app.tsx"),
    await read("lib/phase6-access.ts"),
    await read("lib/supabase.ts"),
  ].join("\n");

  assert.doesNotMatch(source, /common_articles/);
  assert.doesNotMatch(source, /article_workspaces/);
  assert.doesNotMatch(source, /article_assets/);
  assert.doesNotMatch(source, /article-assets/);
});

test("service worker never caches auth callbacks or remote Supabase traffic", async () => {
  const worker = await read("public/sw.js");
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /\/auth\/callback/);
  assert.match(worker, /url\.searchParams\.has\("code"\)/);
  assert.match(worker, /url\.searchParams\.has\("access_token"\)/);
  assert.match(worker, /url\.searchParams\.has\("refresh_token"\)/);
  assert.doesNotMatch(worker, /supabase\.co/);
});

test("manifest and install icons are complete", async () => {
  const manifest = JSON.parse(await read("public/manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
});

test("build configuration rejects secret browser keys", async () => {
  const config = await read("next.config.ts");
  assert.match(config, /sb_secret_/);
  assert.match(config, /service\[_-\]\?role/);
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE_KEY/);
});
