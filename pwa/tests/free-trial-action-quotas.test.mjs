import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("all six configurable free-trial feature codes are wired to current user actions", async () => {
  const freeTrial = await read("lib/free-trial.ts");
  const createRoute = await read("app/create/page.tsx");
  const imageRoute = await read("app/images/page.tsx");
  const snsRoute = await read("app/sns/page.tsx");
  const creator = await read("components/phase11-create-page.tsx");
  const articleTools = await read("components/article-ai-tools.tsx");

  for (const feature of [
    "article_generate",
    "title_generate",
    "article_rewrite",
    "sns_generate",
    "image_generate",
    "ai_assist",
  ]) {
    assert.match(freeTrial, new RegExp(`"${feature}"`));
  }

  assert.match(createRoute, /feature="article_generate"/);
  assert.match(imageRoute, /feature="image_generate"/);
  assert.match(snsRoute, /feature="sns_generate"/);
  assert.match(creator, /consumeFreeTrialUsage\(getSupabaseClient\(\), "title_generate"\)/);
  assert.match(articleTools, /kind === "rewrite" \? "article_rewrite" : "ai_assist"/);
});

test("title quota is consumed only by explicit candidate generation and not by copy or AI launch", async () => {
  const creator = await read("components/phase11-create-page.tsx");

  assert.match(creator, /タイトル候補を生成/);
  assert.match(creator, /titlePromptAuthorized === titlePrompt/);
  assert.match(creator, /if \(!result\.allowed\)/);
  assert.match(creator, /titleQuotaInFlightRef\.current/);
  assert.equal((creator.match(/consumeFreeTrialUsage\(/g) || []).length, 1);
  assert.match(creator, /copyText\(titlePrompt, setMessage\)/);
  assert.match(creator, /launchAiApp\(app\.key\)/);
  assert.match(creator, /コピーやAIアプリ起動では追加消費しません/);
});

test("rewrite and AI assist prompts consume once before reveal and guard fast double clicks", async () => {
  const tools = await read("components/article-ai-tools.tsx");

  assert.match(tools, /if \(inFlightRef\.current \|\| !input\.body\.trim\(\)\) return/);
  assert.match(tools, /const result = await consumeFreeTrialUsage\(client, feature\)/);
  assert.match(tools, /if \(!result\.allowed\)/);
  assert.match(tools, /setPrompt\(kind === "rewrite" \? buildArticleRewritePrompt\(input\) : buildArticleAssistPrompt\(input\)\)/);
  assert.equal((tools.match(/consumeFreeTrialUsage\(/g) || []).length, 1);
  assert.match(tools, /コピーやAIアプリを開く操作では追加消費しません/);
});

test("article AI tools keep editorial safety rules and do not invent factual additions", async () => {
  const prompts = await read("lib/article-ai-tools.ts");

  assert.match(prompts, /実体験・実績・レビュー・購入経験・使用経験を事実として作らない/);
  assert.match(prompts, /確認できない変動情報を断定しない/);
  assert.match(prompts, /競合記事や既存作品の文章をコピー・近似模倣しない/);
  assert.match(prompts, /元記事にない固有名詞・数値・引用を事実として追加しない/);
  assert.match(prompts, /buildArticleRewritePrompt/);
  assert.match(prompts, /buildArticleAssistPrompt/);
});

test("article library exposes quota-aware AI tools only for the currently owned loaded article", async () => {
  const library = await read("components/phase7-library.tsx");

  assert.match(library, /ArticleAiTools/);
  assert.match(library, /key={`\$\{detail\.id\}:\$\{detail\.revision\}`}/);
  assert.match(library, /client={client}/);
  assert.match(library, /body: detail\.body/);
  assert.match(library, /getCloudArticleDetail\(client, ownerId, articleId\)/);
});
