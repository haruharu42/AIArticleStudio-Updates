import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("window errors retain safe source location diagnostics without storing stacks", async () => {
  const ops = await read("lib/ops.ts");
  const reporter = await read("components/app-error-reporter.tsx");

  assert.match(ops, /windowErrorDiagnostic/);
  assert.match(ops, /WINDOW_SCRIPT_ERROR_OPAQUE/);
  assert.match(ops, /browser-withheld-source-details/);
  assert.match(ops, /url\.pathname/);
  assert.match(ops, /line=/);
  assert.match(ops, /column=/);
  assert.doesNotMatch(ops, /\.stack/);

  assert.match(reporter, /windowErrorDiagnostic\(event\)/);
  assert.match(reporter, /diagnostic\.errorCode/);
  assert.match(reporter, /diagnostic\.message/);
  assert.doesNotMatch(reporter, /\.stack/);
});
