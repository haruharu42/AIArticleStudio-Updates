import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("routes stable-shell image navigation to the dedicated images page", async () => {
  const app = await read("components/phase6-app.tsx");

  assert.match(app, /const navigateRoute = \(path: string\) => \{ if \(mayLeave\(\)\) window\.location\.assign\(path\); \};/);
  assert.equal((app.match(/navigateRoute\("\/images"\)/g) || []).length, 2);
  assert.doesNotMatch(app, /onClick=\{\(\) => navigate\("library"\)\}><span>◫<\/span>画像<\/button>/);
});
