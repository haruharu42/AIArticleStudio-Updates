import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("PWA structure guide records the enforced runtime boundaries", async () => {
  const guide = await readFile(path.join(root, "STRUCTURE.md"), "utf8");
  assert.match(guide, /lib\/access-control\.ts/);
  assert.match(guide, /lib\/article-create-draft\.ts/);
  assert.match(guide, /Browser-stored data is untrusted/);
  assert.match(guide, /UI components must not duplicate profile ownership or PWA entitlement RPC logic/);
});
