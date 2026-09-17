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

test("AI app launcher keeps Android one-tap and gives iOS an explicit app/Web choice", async () => {
  const links = await read("lib/ai-app-links.ts");

  assert.match(links, /https:\/\/chatgpt\.com\//);
  assert.match(links, /https:\/\/claude\.ai\//);
  assert.match(links, /https:\/\/gemini\.google\.com\//);
  assert.match(links, /chatgpt:\/\//);
  assert.match(links, /claude:\/\//);
  assert.match(links, /googleapp:\/\/robin/);
  assert.match(links, /com\.openai\.chatgpt/);
  assert.match(links, /com\.anthropic\.claude/);
  assert.match(links, /com\.google\.android\.apps\.bard/);
  assert.match(links, /browser_fallback_url/);
  assert.match(links, /showIosLaunchChoice/);
  assert.match(links, /アプリを開く/);
  assert.match(links, /Web版を開く/);
  assert.match(links, /anchor\.href = app\.webUrl/);
  assert.match(links, /anchor\.href = app\.iosScheme/);
  assert.match(links, /anchor\.target = "_blank"/);
  assert.match(links, /anchor\.rel = "noopener noreferrer"/);
  assert.doesNotMatch(links, /window\.open\(app\.webUrl/);
  assert.doesNotMatch(links, /document\.createElement\("iframe"\)/);
  assert.doesNotMatch(links, /visibilitychange/);
  assert.doesNotMatch(links, /window\.confirm/);
  assert.doesNotMatch(links, /setTimeout\([^)]*1600|1600\)/);
  assert.doesNotMatch(links, /window\.location\.assign\(app\.iosScheme\)/);
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
  assert.match(home, /iPhone \/ iPadでは「アプリを開く」と「Web版を開く」を選べます/);
  assert.match(home, /Google Play/);
  assert.doesNotMatch(home, /iPhone は App Store/);
  assert.match(creator, /AIを使って作る/);
  assert.match(creator, /key: "chatgpt", label: "ChatGPT"/);
  assert.match(creator, /key: "claude", label: "Claude"/);
  assert.match(creator, /key: "gemini", label: "Gemini"/);
  assert.match(creator, /launchAiApp\(app\.key\)/);
  assert.match(creator, /AI用タイトルプロンプト/);
  assert.match(creator, /AI用完成記事プロンプト/);
  assert.doesNotMatch(creator, /href=\{OPENAI_LINKS\.chatgpt\}/);
  assert.match(images, /ChatGPT Imagesを開く/);
  assert.match(tools, /ChatGPT Work/);
  assert.match(tools, /OpenAIツール/);
  assert.match(creator, /createArticleFromWizard/);
  assert.match(images, /buildImagePromptPlan/);
  assert.doesNotMatch(`${home}\n${creator}\n${images}\n${tools}`, /sora\.chatgpt\.com/i);
});
