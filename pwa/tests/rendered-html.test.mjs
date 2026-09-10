import assert from "node:assert/strict";
import test from "node:test";

const productionMeta =
  /<meta(?=[^>]*\bname=["']aas-release-stage["'])(?=[^>]*\bcontent=["']production["'])[^>]*>/i;
const phase17Meta =
  /<meta(?=[^>]*\bname=["']aas-phase["'])(?=[^>]*\bcontent=["']17["'])[^>]*>/i;
const robotsMeta =
  /<meta(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["']noindex, nofollow["'])[^>]*>/i;

test("renders Phase 17 invite-only production metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const html = await response.text();
  assert.match(html, productionMeta);
  assert.match(html, phase17Meta);
  assert.match(html, robotsMeta);
  assert.doesNotMatch(html, /codex-preview|phase8-local/i);
});
