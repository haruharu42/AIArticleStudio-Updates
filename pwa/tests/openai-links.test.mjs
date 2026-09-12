import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("OpenAI launch links stay on verified official ChatGPT destinations", async () => {
  const links = await read("lib/openai-links.ts");

  assert.match(links, /https:\/\/chatgpt\.com\//);
  assert.match(links, /https:\/\/chatgpt\.com\/work\//);
  assert.match(links, /https:\/\/chatgpt\.com\/images\//);
  assert.match(links, /https:\/\/chatgpt\.com\/codex\//);
  assert.doesNotMatch(links, /sora/i);
  assert.doesNotMatch(links, /openai\.com\/api|platform\.openai\.com/);
});

test("beginner home and prompt workflows expose OpenAI launches without changing persistence", async () => {
  const home = await read("components/phase18-beginner-home.tsx");
  const creator = await read("components/phase11-create-page.tsx");
  const images = await read("components/phase13-image-page.tsx");
  const tools = await read("components/phase-tools-page.tsx");

  assert.match(home, /OPENAI_LINKS\.chatgpt/);
  assert.match(home, /OPENAI_LINKS\.work/);
  assert.match(home, /OPENAI_LINKS\.images/);
  assert.match(home, /OPENAI_LINKS\.codex/);
  assert.match(creator, /ChatGPTを開く/);
  assert.match(images, /ChatGPT Imagesを開く/);
  assert.match(tools, /ChatGPT Work/);
  assert.match(tools, /OpenAIツール/);
  assert.match(creator, /createArticleFromWizard/);
  assert.match(images, /buildImagePromptPlan/);
  assert.doesNotMatch(`${home}\n${creator}\n${images}\n${tools}`, /sora\.chatgpt\.com/i);
});
