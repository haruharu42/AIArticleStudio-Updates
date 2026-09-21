import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("root layout keeps verified access state alive across client-side route changes", async () => {
  const [layout, provider] = await Promise.all([
    read("app/layout.tsx"),
    read("components/access-state-provider.tsx"),
  ]);

  assert.match(layout, /<AccessStateProvider>/);
  assert.match(layout, /<AccessStateProvider>[\s\S]*?\{children\}[\s\S]*?<PersistentMobileNav \/>[\s\S]*?<\/AccessStateProvider>/);
  assert.match(provider, /loadAccessState/);
  assert.match(provider, /onAuthStateChange/);
  assert.match(provider, /if \(!session\) \{[\s\S]*?setState\(\{ kind: "signed_out" \}\)/);
  assert.match(provider, /useSharedAccessState/);
});

test("home no longer shows the large account access loading card on every navigation", async () => {
  const home = await read("components/phase18-beginner-home.tsx");

  assert.match(home, /useSharedAccessState\(\)/);
  assert.doesNotMatch(home, /loadAccessState/);
  assert.doesNotMatch(home, /onAuthStateChange/);
  assert.doesNotMatch(home, />LOADING</);
  assert.doesNotMatch(home, /アカウントと利用権を確認しています/);
  assert.match(home, /reference-route-loading/);
  assert.match(home, /準備中/);
  assert.match(home, /接続状態を確認できませんでした/);
});

test("home internal navigation uses Next Link instead of document reload anchors", async () => {
  const home = await read("components/phase18-beginner-home.tsx");

  assert.match(home, /import Link from "next\/link"/);
  assert.match(home, /<Link href="\/create"/);
  assert.match(home, /<Link href="\/missions"/);
  assert.match(home, /<Link href="\/manual"/);
  assert.match(home, /<Link href="\/ranking"/);
  assert.match(home, /<Link href="\/profile"/);
  assert.match(home, /<Link className="beginner-quick-start" href=\{quickCreateHref\}/);
  assert.doesNotMatch(home, /<a\b[^>]*href=(?:"\/|\{quickCreateHref\})/);
});

test("compact route progress stays small and respects reduced motion", async () => {
  const [layout, css] = await Promise.all([
    read("app/layout.tsx"),
    read("app/phase42-route-transition.css"),
  ]);

  assert.match(layout, /phase42-route-transition\.css/);
  assert.match(css, /\.reference-route-loading/);
  assert.match(css, /height:\s*3px/);
  assert.match(css, /@keyframes aas-route-loading/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});


test("settings, tools, and inquiries reuse the root access state instead of refetching it on mount", async () => {
  const [settings, tools, inquiries] = await Promise.all([
    read("components/pwa-settings-page.tsx"),
    read("components/phase-tools-page.tsx"),
    read("components/user-inquiries-page.tsx"),
  ]);

  for (const source of [settings, tools, inquiries]) {
    assert.match(source, /useSharedAccessState\(\)/);
    assert.doesNotMatch(source, /loadAccessState/);
  }

  assert.match(tools, /import Link from "next\/link"/);
  assert.match(tools, /<Link className="route-back" href="\/"/);
  assert.doesNotMatch(tools, /<a className="route-back" href="\/"/);
});
