import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("AI Action Studio branding is used on the active PWA shell", async () => {
  const [layout, shell, legacyShell, manifest, home] = await Promise.all([
    read("app/layout.tsx"),
    read("components/aas-reference-shell.tsx"),
    read("components/phase6-app.tsx"),
    read("public/manifest.webmanifest"),
    read("components/phase18-beginner-home.tsx"),
  ]);

  assert.match(layout, /AI Action Studio/);
  assert.match(layout, /AIで副業を、もっと簡単に。/);
  assert.match(shell, /AI Action Studio/);
  assert.match(shell, /AIで副業を、もっと簡単に。/);
  assert.match(legacyShell, /AI ACTION/);
  assert.match(legacyShell, /AIで副業を、/);
  assert.doesNotMatch(legacyShell, /AI ARTICLE/);
  assert.match(manifest, /AI Action Studio/);
  assert.match(home, /ActionStudioHomeHub/);
});

test("home provides side-hustle and action-first entry points without breaking article routes", async () => {
  const [hub, home, css, layout] = await Promise.all([
    read("components/action-studio-home-hub.tsx"),
    read("components/phase18-beginner-home.tsx"),
    read("app/phase48-action-studio.css"),
    read("app/layout.tsx"),
  ]);

  for (const label of ["副業から探す", "やりたいことから探す", "note副業", "SNS運用・集客", "自分に合うAI副業を探す", "記事を作る"]) {
    assert.match(hub, new RegExp(label));
  }
  for (const href of ["/create", "/note-operations", "/sns-plan", "/sidejob", "/images", "/tools"]) {
    assert.match(hub, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.match(home, /<ActionStudioHomeHub \/>/);
  assert.match(layout, /phase48-action-studio\.css/);
  assert.match(css, /\.action-studio-card-grid/);
});
