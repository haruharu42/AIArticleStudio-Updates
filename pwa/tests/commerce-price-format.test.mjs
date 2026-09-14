import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Stripe JPY unit amounts are displayed without dividing by 100", async () => {
  const client = await read("lib/commerce.ts");

  assert.match(client, /const currency = price\.currency\.toLowerCase\(\)/);
  assert.match(client, /const amount = currency === "jpy" \? price\.unitAmount : price\.unitAmount \/ 100/);
  assert.match(client, /\.format\(amount\)/);
  assert.match(client, /return `\$\{amount\} \$\{price\.currency\.toUpperCase\(\)\}`/);
  assert.doesNotMatch(client, /\.format\(price\.unitAmount \/ 100\)/);
});
