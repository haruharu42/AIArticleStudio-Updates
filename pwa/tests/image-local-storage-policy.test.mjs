import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());

const filenames = await vite.ssrLoadModule("/lib/image-file-names.ts");
const prompts = await vite.ssrLoadModule("/lib/phase13-image-prompts.ts");

test("suggested image filenames are Windows-safe and identify image purpose", () => {
  assert.equal(
    filenames.buildSuggestedImageFilename({ title: "AI副業: 初心者/入門?", kind: "cover" }),
    "AI副業_初心者_入門_アイキャッチ.png",
  );
  assert.equal(
    filenames.buildSuggestedImageFilename({ title: "AI副業: 初心者/入門?", kind: "inline", order: 2 }),
    "AI副業_初心者_入門_挿絵02.png",
  );
  assert.doesNotMatch(filenames.buildSuggestedImageFilename({ title: '<>:"/\\|?*', kind: "cover" }), /[<>:"/\\|?*]/);
});

test("image prompt plan includes local filename and alt metadata", () => {
  const items = prompts.buildImagePromptPlan({
    title: "ChatGPTで始めるAI副業",
    theme: "初心者向けの始め方",
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
  assert.equal(items[0].suggestedFilename, "ChatGPTで始めるAI副業_アイキャッチ.png");
  assert.equal(items[2].suggestedFilename, "ChatGPTで始めるAI副業_挿絵02.png");
  assert.match(items[0].prompt, /推奨保存ファイル名/);
  assert.match(items[0].prompt, /AASへアップロードせず/);
  assert.match(items[1].altText, /挿絵1/);
});

test("PWA image UI is local-save first and does not expose cloud upload actions", async () => {
  const [imagePage, legacyViewer] = await Promise.all([
    read("components/phase13-image-page.tsx"),
    read("components/phase8-images.tsx"),
  ]);
  assert.match(imagePage, /推奨ファイル名/);
  assert.match(imagePage, /ファイル名をコピー/);
  assert.match(imagePage, /Supabase Storageへアップロードしません/);
  assert.match(legacyViewer, /閲覧のみ可能/);
  assert.doesNotMatch(legacyViewer, /uploadArticleImage/);
  assert.doesNotMatch(legacyViewer, /type="file"/);
  assert.doesNotMatch(legacyViewer, /画像を追加/);
});
