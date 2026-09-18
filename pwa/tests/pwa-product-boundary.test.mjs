import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pwaRoot = path.resolve(here, "..");
const scanRoots = ["app", "components", "lib", "worker"];
const forbiddenWindowsProductCode = ["AAS", "WIN", "BETA"].join("-");
const frozenCompatibilityFiles = new Set([
  path.join("components", "phase10-admin-page.tsx"),
  path.join("lib", "phase10-admin.ts"),
]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }
    if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(fullPath);
  }

  return files;
}

function activeRuntimeFiles(files) {
  return files.filter((file) => !frozenCompatibilityFiles.has(path.relative(pwaRoot, file)));
}

test("PWA runtime is bound only to the PWA product", async () => {
  const files = activeRuntimeFiles((
    await Promise.all(scanRoots.map((root) => collectSourceFiles(path.join(pwaRoot, root))))
  ).flat());

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.equal(
      source.includes(forbiddenWindowsProductCode),
      false,
      `Windows product code must not be referenced by PWA runtime: ${path.relative(pwaRoot, file)}`,
    );
  }

  const accessSource = await readFile(path.join(pwaRoot, "lib", "access-control.ts"), "utf8");
  const phase6Source = await readFile(path.join(pwaRoot, "lib", "phase6-access.ts"), "utf8");
  assert.match(
    accessSource,
    /export const PWA_PRODUCT_CODE = "AAS-PWA-BETA" as const;/,
    "central access control must remain explicitly bound to AAS-PWA-BETA",
  );
  assert.match(phase6Source, /PWA_PRODUCT_CODE/);
  assert.match(phase6Source, /@\/lib\/access-control/);
  assert.doesNotMatch(phase6Source, /const PWA_PRODUCT_CODE\s*=/);

  const adminRoute = await readFile(path.join(pwaRoot, "app", "admin", "users", "page.tsx"), "utf8");
  assert.match(adminRoute, /pwa-admin-users-page/);
  assert.doesNotMatch(adminRoute, /@\/components\/phase10-admin-page/);
});

test("PWA runtime does not depend on frozen Windows local implementation", async () => {
  const files = activeRuntimeFiles((
    await Promise.all(scanRoots.map((root) => collectSourceFiles(path.join(pwaRoot, root))))
  ).flat());
  const forbiddenMarkers = ["LOCALAPPDATA", "DPAPI", "Run-AIArticleStudio.cmd"];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      assert.equal(
        source.includes(marker),
        false,
        `Frozen Windows-local dependency found in PWA runtime (${marker}): ${path.relative(pwaRoot, file)}`,
      );
    }
  }
});


test("Cloudflare production workers.dev routing stays explicit and Preview remains the default", async () => {
  const vite = await readFile(path.join(pwaRoot, "vite.config.ts"), "utf8");

  assert.match(vite, /AAS_CLOUDFLARE_PUBLIC_WORKERS_DEV === "true"/);
  assert.match(vite, /workers_dev:\s*productionWorkersDevEnabled/);
  assert.match(vite, /preview_urls:\s*!productionWorkersDevEnabled/);
  assert.match(vite, /DEFAULT_WORKER_NAME = "ai-article-studio-pwa-preview"/);
});
