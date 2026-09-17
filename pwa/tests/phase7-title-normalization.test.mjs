import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

const { ArticleLibraryError, updateCloudArticle } = await vite.ssrLoadModule(
  "/lib/phase7-articles.ts",
);

const OWNER = "00000000-0000-4000-8000-000000000002";
const ARTICLE = "10000000-0000-4000-8000-000000000001";

function workspaceRow() {
  return {
    article_id: ARTICLE,
    user_id: OWNER,
    request_json: {},
    workspace_json: {},
    image_plan_json: {},
    source_body: "source",
    publish_body: "publish",
    workspace_version: 2,
    created_at: "2026-09-01T00:00:00+00:00",
    updated_at: "2026-09-02T00:00:00+00:00",
  };
}

function articleRow(title) {
  return {
    id: ARTICLE,
    user_id: OWNER,
    title,
    publication_target: "note",
    article_type: "free",
    genre: "test",
    subgenre: null,
    body: "body",
    status: "ready",
    price: null,
    tags: [],
    scheduled_at: null,
    published_at: null,
    published_url: null,
    revision: 4,
    created_at: "2026-09-01T00:00:00+00:00",
    updated_at: "2026-09-02T00:00:00+00:00",
  };
}

function fakeClient() {
  const calls = [];
  return {
    calls,
    auth: {
      async getUser() {
        return { data: { user: { id: OWNER } }, error: null };
      },
    },
    async rpc(name, parameters) {
      calls.push([name, structuredClone(parameters)]);
      if (name === "can_access_product") return { data: true, error: null };
      if (name === "update_article_with_workspace") {
        return {
          data: {
            article: articleRow(parameters.p_patch.title),
            workspace: workspaceRow(),
          },
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

const baseArticle = {
  title: "Title",
  publication_target: "note",
  article_type: "free",
  genre: "test",
  subgenre: null,
  body: "body",
  status: "ready",
  price: null,
  tags: [],
};

const baseWorkspace = {
  request_json: {},
  workspace_json: {},
  source_body: "source",
  publish_body: "publish",
};

test("trims surrounding whitespace from article titles before the update RPC", async () => {
  const client = fakeClient();
  const updated = await updateCloudArticle(
    client,
    OWNER,
    ARTICLE,
    3,
    { ...baseArticle, title: "   Normalized title   " },
    baseWorkspace,
  );

  const update = client.calls.find(([name]) => name === "update_article_with_workspace");
  assert.equal(update[1].p_patch.title, "Normalized title");
  assert.equal(updated.title, "Normalized title");
});

test("rejects an article title that is empty after trimming", async () => {
  const client = fakeClient();
  await assert.rejects(
    () =>
      updateCloudArticle(
        client,
        OWNER,
        ARTICLE,
        3,
        { ...baseArticle, title: "   \n\t  " },
        baseWorkspace,
      ),
    (error) =>
      error instanceof ArticleLibraryError &&
      error.category === "validation" &&
      error.message.includes("1〜500"),
  );
  assert.equal(client.calls.length, 0);
});
