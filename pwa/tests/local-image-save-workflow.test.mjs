import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("image prompt workflow uses safe local filenames instead of active cloud image upload", async () => {
  const [helper, prompts, page, route] = await Promise.all([
    read("lib/image-file-names.ts"),
    read("lib/phase13-image-prompts.ts"),
    read("components/phase13-image-page.tsx"),
    read("app/images/page.tsx"),
  ]);

  assert.match(helper, /normalize\("NFKC"\)/);
  assert.match(helper, /WINDOWS_FORBIDDEN/);
  assert.match(helper, /MAX_TITLE_LENGTH = 80/);
  assert.match(helper, /article-image/);
  assert.match(helper, /アイキャッチ/);
  assert.match(helper, /挿絵/);
  assert.match(helper, /\.png/);

  assert.match(prompts, /suggestedFilename: string/);
  assert.match(prompts, /altText: string/);
  assert.match(prompts, /buildSuggestedImageFilename/);
  assert.match(prompts, /buildImageAltText/);
  assert.match(prompts, /生成後に端末へ保存する際の推奨ファイル名/);

  assert.match(route, /Phase13ImagePromptPage/);
  assert.match(page, /画像はAASへアップロードしません/);
  assert.match(page, /AASのSupabase Storage容量は消費しません/);
  assert.match(page, /画像プロンプトをコピー/);
  assert.match(page, /ファイル名をコピー/);
  assert.match(page, /altをコピー/);
  assert.doesNotMatch(page, /記事ライブラリの画像管理から保存できます/);
  assert.doesNotMatch(page, /\.storage\.from\(/);
  assert.doesNotMatch(page, /article-assets/);
});
