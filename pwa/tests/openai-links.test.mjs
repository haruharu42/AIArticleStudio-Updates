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

test("AI app launcher uses official web and store destinations with platform fallbacks", async () => {
  const links = await read("lib/ai-app-links.ts");

  assert.match(links, /https:\/\/chatgpt\.com\//);
  assert.match(links, /https:\/\/claude\.ai\//);
  assert.match(links, /https:\/\/gemini\.google\.com\//);
  assert.match(links, /apps\.apple\.com\/jp\/app\/chatgpt\/id6448311069/);
  assert.match(links, /apps\.apple\.com\/jp\/app\/claude-by-anthropic\/id6473753684/);
  assert.match(links, /apps\.apple\.com\/jp\/app\/google-gemini\/id6477489729/);
  assert.match(links, /com\.openai\.chatgpt/);
  assert.match(links, /com\.anthropic\.claude/);
  assert.match(links, /com\.google\.android\.apps\.bard/);
  assert.match(links, /browser_fallback_url/);
  assert.match(links, /visibilitychange/);
  assert.match(links, /launchAiApp/);
  assert.doesNotMatch(links, /api[_-]?key|sb_secret_|service[_-]?role/i);
});

test("beginner home and article wizard use the shared AI app launcher", async () => {
  const home = await read("components/phase18-beginner-home.tsx");
  const creator = await read("components/phase11-create-page.tsx");
  const images = await read("components/phase13-image-page.tsx");
  const tools = await read("components/phase-tools-page.tsx");

  assert.match(home, /AiLaunchCard appKey="chatgpt"/);
  assert.match(home, /AiLaunchCard appKey="claude"/);
  assert.match(home, /AiLaunchCard appKey="gemini"/);
  assert.match(home, /launchAiApp/);
  assert.match(home, /App Store/);
  assert.match(home, /Google Play/);
  assert.match(creator, /ChatGPTを開く/);
  assert.match(creator, /import \{ launchAiApp \} from "@\/lib\/ai-app-links"/);
  assert.equal((creator.match(/launchAiApp\("chatgpt"\)/g) ?? []).length, 2);
  assert.doesNotMatch(creator, /href=\{OPENAI_LINKS\.chatgpt\}/);
  assert.match(images, /ChatGPT Imagesを開く/);
  assert.match(tools, /ChatGPT Work/);
  assert.match(tools, /OpenAIツール/);
  assert.match(creator, /createArticleFromWizard/);
  assert.match(images, /buildImagePromptPlan/);
  assert.doesNotMatch(`${home}\n${creator}\n${images}\n${tools}`, /sora\.chatgpt\.com/i);
});
