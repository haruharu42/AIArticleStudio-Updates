import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());

const prompts = await vite.ssrLoadModule("/lib/phase13-image-prompts.ts");

test("recommended image filenames are safe and identify cover and inline images", () => {
  assert.equal(
    prompts.buildSuggestedImageFilename("ChatGPT: AI/副業? * test", "cover"),
    "ChatGPT_AI_副業_test_アイキャッチ.png",
  );
  assert.equal(
    prompts.buildSuggestedImageFilename("記事タイトル", "inline", 1),
    "記事タイトル_挿絵01.png",
  );
  assert.equal(
    prompts.buildSuggestedImageFilename("記事タイトル", "inline", 10),
    "記事タイトル_挿絵10.png",
  );
  assert.equal(
    prompts.buildSuggestedImageFilename(" \\/:*?\"<>| ", "cover"),
    "article-image_アイキャッチ.png",
  );
  const longName = prompts.buildSuggestedImageFilename("長".repeat(300), "cover");
  assert.ok(longName.length < 140);
  assert.match(longName, /_アイキャッチ\.png$/);
});

test("image prompt plan carries filename, alt text and insertion metadata", () => {
  const items = prompts.buildImagePromptPlan({
    title: "AI副業初心者ガイド",
    theme: "初心者向けAI副業",
    publicationTarget: "note",
    genre: "AI副業",
    subgenre: "AIおまかせ",
    ageGroup: "30代",
    gender: "AIおまかせ",
    coverEnabled: true,
    inlineEnabled: true,
    inlineCount: 2,
  });

  assert.equal(items.length, 3);
  assert.equal(items[0].suggestedFilename, "AI副業初心者ガイド_アイキャッチ.png");
  assert.equal(items[0].altText, "AI副業初心者ガイドのアイキャッチ画像");
  assert.equal(items[1].suggestedFilename, "AI副業初心者ガイド_挿絵01.png");
  assert.equal(items[1].insertionMarker, "IMAGE:01");
  assert.equal(items[2].suggestedFilename, "AI副業初心者ガイド_挿絵02.png");
  assert.equal(items[2].insertionMarker, "IMAGE:02");
});

test("PWA image UI uses local saving while legacy Storage code remains available", async () => {
  const [promptPage, articleImages, storageLibrary, creator] = await Promise.all([
    read("components/phase13-image-page.tsx"),
    read("components/phase8-images.tsx"),
    read("lib/phase8-images.ts"),
    read("lib/phase11-create.ts"),
  ]);

  assert.match(promptPage, /推奨ファイル名/);
  assert.match(promptPage, /ファイル名をコピー/);
  assert.match(promptPage, /alt候補/);
  assert.match(promptPage, /スマホまたはPCへ保存/);
  assert.match(promptPage, /画像本体はSupabaseへアップロードせず/);

  assert.match(articleImages, /記事の画像（端末保存）/);
  assert.match(articleImages, /Supabase Storageへアップロードせず/);
  assert.match(articleImages, /PWAからの新規アップロード・差し替えは現在停止/);
  assert.doesNotMatch(articleImages, /uploadArticleImage|prepareImageFile|画像を追加|差し替え/);

  assert.match(storageLibrary, /uploadArticleImage/);
  assert.match(storageLibrary, /prepare_article_asset_checked/);
  assert.match(creator, /prompt_plan: imagePrompts/);
});
