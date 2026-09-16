import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pwaRoot = path.resolve(here, "..");
const scanRoots = ["app", "components", "lib", "worker"];
const forbiddenWindowsProductCode = ["AAS", "WIN", "BETA"].join("-");

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

test("PWA runtime is bound only to the PWA product", async () => {
  const files = (
    await Promise.all(scanRoots.map((root) => collectSourceFiles(path.join(pwaRoot, root))))
  ).flat();

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.equal(
      source.includes(forbiddenWindowsProductCode),
      false,
      `Windows product code must not be referenced by PWA runtime: ${path.relative(pwaRoot, file)}`,
    );
  }

  const accessSource = await readFile(path.join(pwaRoot, "lib", "phase6-access.ts"), "utf8");
  assert.match(
    accessSource,
    /export const PWA_PRODUCT_CODE = "AAS-PWA-BETA";/,
    "PWA access must remain explicitly bound to AAS-PWA-BETA",
  );
});

test("PWA runtime does not depend on frozen Windows local implementation", async () => {
  const files = (
    await Promise.all(scanRoots.map((root) => collectSourceFiles(path.join(pwaRoot, root))))
  ).flat();
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
