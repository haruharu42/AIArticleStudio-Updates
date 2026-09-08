import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("pins patched framework versions and Phase 7 metadata", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const layout = await read("app/layout.tsx");
  const worker = await read("public/sw.js");

  assert.equal(packageJson.dependencies.next, "16.3.4");
  assert.equal(packageJson.dependencies.react, "19.2.8");
  assert.equal(packageJson.devDependencies.vinext, "1.0.0-beta.9");
  assert.equal(packageJson.devDependencies.vite, "8.2.2");
  assert.equal(packageJson.devDependencies.wrangler, "4.129.0");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.3.4");
  assert.match(layout, /phase7-local/);
  assert.match(layout, /"aas-phase": "7"/);
  assert.match(worker, /aas-pwa-phase7-v1/);
});

test("enables only the Phase 7 article library navigation", async () => {
  const app = await read("components/phase6-app.tsx");
  const library = await read("components/phase7-library.tsx");

  assert.match(app, /Phase7Library/);
  assert.match(app, /setSection\("library"\)/);
  assert.match(app, /記事を作る<small>Phase 8<\/small>/);
  assert.match(app, /画像<small>Phase 9<\/small>/);
  assert.match(library, /listCloudArticles/);
  assert.match(library, /getCloudArticleDetail/);
  assert.match(library, /updateCloudArticle/);
  assert.match(library, /deleteCloudArticle/);
  assert.doesNotMatch(library, /create_article/);
  assert.doesNotMatch(library, /prepare_article_asset/);
});

test("keeps list reads body-free and gates every article operation", async () => {
  const service = await read("lib/phase7-articles.ts");
  const listColumns = service.match(/ARTICLE_LIST_COLUMNS\s*=\s*\n?\s*"([^"]+)"/)?.[1] ?? "";

  assert.ok(listColumns.includes("title"));
  assert.ok(listColumns.includes("revision"));
  assert.ok(!listColumns.includes("body"));
  assert.match(service, /auth\.getUser\(\)/);
  assert.match(service, /"can_access_product"/);
  assert.match(service, /PWA_PRODUCT_CODE/);
  assert.match(service, /article_owner_mismatch/);
  assert.match(service, /workspace_owner_mismatch/);
  assert.match(service, /asset_owner_mismatch/);
});

test("uses revision-safe workspace updates and complete Storage deletion lifecycle", async () => {
  const service = await read("lib/phase7-articles.ts");

  assert.match(service, /"update_article_with_workspace"/);
  assert.match(service, /p_expected_revision/);
  assert.match(service, /"begin_delete_article_asset"/);
  assert.match(service, /\.remove\(\[asset\.storagePath\]\)/);
  assert.match(service, /"finalize_delete_article_asset"/);
  assert.match(service, /"delete_article"/);
  assert.match(service, /storage_object_exists/);
  assert.match(service, /"finalize_article_asset"/);
});
