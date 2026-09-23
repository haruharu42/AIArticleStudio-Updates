import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pwaRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(pwaRoot, "..");
const read = (relative) => readFile(path.join(pwaRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("all side-hustle functions use dedicated definitions with dropdown plus custom input", async () => {
  const [content, sales, client, productivity, helper, catalog] = await Promise.all([
    read("features/side-hustles/definitions-content-media.ts"),
    read("features/side-hustles/definitions-sales.ts"),
    read("features/side-hustles/definitions-client-work.ts"),
    read("features/side-hustles/definitions-productivity.ts"),
    read("features/side-hustles/definition-helpers.ts"),
    read("features/side-hustles/catalog.ts"),
  ]);
  const definitions = [content, sales, client, productivity].join("\n");

  assert.equal((definitions.match(/\bslug:\s*"/g) ?? []).length, 12);
  assert.equal((definitions.match(/\bsideField\(/g) ?? []).length, 72);
  assert.match(helper, /SIDE_HUSTLE_CUSTOM_VALUE/);
  assert.match(helper, /その他・自由入力/);
  assert.match(helper, /options: \[\.\.\.options, sideOption\(SIDE_HUSTLE_CUSTOM_VALUE/);

  for (const task of [
    "sidejob_content",
    "sidejob_sns",
    "sidejob_video",
    "sidejob_affiliate",
    "sidejob_resale",
    "sidejob_crowdsourcing",
    "sidejob_skill_sales",
    "sidejob_digital_product",
    "sidejob_outreach",
    "sidejob_research",
    "sidejob_efficiency",
    "sidejob_planning",
  ]) {
    assert.match(definitions, new RegExp('knowledgeTask: "' + task + '"'));
  }

  for (const title of [
    "記事・ブログ・コンテンツ販売",
    "SNS運用・集客",
    "YouTube・ショート動画",
    "アフィリエイト",
    "物販・フリマ販売",
    "クラウドソーシング",
    "スキル販売",
    "デジタル商品・教材販売",
    "営業・案件獲得",
    "リサーチ・事実確認",
    "業務効率化・SOP化",
    "自分に合うAI副業を探す",
  ]) {
    assert.match(definitions, new RegExp(title));
  }

  assert.match(catalog, /CONTENT_MEDIA_SIDE_HUSTLES/);
  assert.match(catalog, /SALES_SIDE_HUSTLES/);
  assert.match(catalog, /CLIENT_WORK_SIDE_HUSTLES/);
  assert.match(catalog, /PRODUCTIVITY_SIDE_HUSTLES/);
  assert.doesNotMatch(definitions, /commonFields\(/);
});

test("dedicated prompts have task-specific deliverables instead of a generic shared prompt", async () => {
  const definitions = (
    await Promise.all([
      read("features/side-hustles/definitions-content-media.ts"),
      read("features/side-hustles/definitions-sales.ts"),
      read("features/side-hustles/definitions-client-work.ts"),
      read("features/side-hustles/definitions-productivity.ts"),
    ])
  ).join("\n");

  for (const uniqueDeliverable of [
    "無料・有料",
    "4週間の投稿配分",
    "サムネイル文言8個",
    "公式一次情報",
    "写真で撮るべき箇所",
    "納品前チェックリスト",
    "各章で購入者が作る成果物",
    "案件文から抜き出す要件チェック表",
    "フォローアップ文",
    "検証可能な小問",
    "AIへ渡してよい情報 / 渡さない情報",
    "30日で確認できる検証指標",
  ]) {
    assert.match(definitions, new RegExp(uniqueDeliverable.replace("/", "\\/")));
  }

  assert.match(definitions, /未確認/);
  assert.match(definitions, /作らない/);
});

test("side-hustle wizard injects cloud knowledge and prompt optimization and persists progress", async () => {
  const [builder, progress, wizard, field, rail, route, layout, runtime] = await Promise.all([
    read("features/side-hustles/prompt-builder.ts"),
    read("features/side-hustles/progress.ts"),
    read("components/side-hustle-wizard-page.tsx"),
    read("components/side-hustles/side-hustle-select-field.tsx"),
    read("components/side-hustles/side-hustle-step-rail.tsx"),
    read("app/side-hustles/[slug]/page.tsx"),
    read("app/layout.tsx"),
    read("lib/prompt-optimization.ts"),
  ]);

  assert.match(builder, /compileKnowledgeContext/);
  assert.match(builder, /compilePromptOptimizationContext/);
  assert.match(builder, /definition\.knowledgeTask/);
  assert.match(builder, /selectedPlan/);
  assert.match(progress, /aas-side-hustle-wizard/);
  assert.match(progress, /localStorage/);
  assert.match(progress, /resultText/);
  assert.match(progress, /Math\.min\(4, row\.step\)/);
  assert.match(wizard, /readSideHustleDraft/);
  assert.match(wizard, /writeSideHustleDraft/);
  assert.match(wizard, /pagehide/);
  assert.match(wizard, /beforeunload/);
  assert.match(wizard, /visibilitychange/);
  assert.match(wizard, /KNOWLEDGE_RUNTIME_EVENT/);
  assert.match(wizard, /Fresh/);
  assert.match(wizard, /Stable/);
  assert.match(wizard, /完成プロンプト/);
  assert.match(wizard, /コピーして/);
  assert.match(wizard, /AIの完成結果をAASへ戻す/);
  assert.match(wizard, /クリップボードから貼り付け/);
  assert.match(wizard, /完成結果をコピー/);
  assert.match(wizard, /resultText/);
  assert.match(wizard, /const nextDraft = \{ \.\.\.draft, step: 4 \}/);
  assert.match(wizard, /writeSideHustleDraft\(userId, definition, nextDraft\)/);
  assert.match(field, /<select/);
  assert.match(field, /SIDE_HUSTLE_CUSTOM_VALUE/);
  assert.match(field, /custom &&/);
  assert.match(rail, /基本設定/);
  assert.match(rail, /詳細設定/);
  assert.match(rail, /AI設定/);
  assert.match(rail, /AI出力/);
  assert.match(route, /generateStaticParams/);
  assert.match(route, /Phase15MemberGate/);
  assert.match(route, /params: Promise/);
  assert.match(layout, /phase51-side-hustle-wizard\.css/);
  assert.match(runtime, /aas:knowledge-runtime-updated/);
});

test("feature list routes side-hustle cards to dedicated functions, not category-filtered generic prompts", async () => {
  const tools = await read("features/tools/tool-catalog.ts");
  for (const slug of [
    "content-sales",
    "sns-management",
    "youtube-video",
    "affiliate",
    "resale",
    "crowdsourcing",
    "skill-sales",
    "digital-product",
    "outreach",
    "research",
    "workflow-efficiency",
    "sidejob-planner",
  ]) {
    assert.match(tools, new RegExp("/side-hustles/" + slug));
  }
  assert.doesNotMatch(tools, /\/prompts\?category=/);
});

test("database and refresh pipeline accept every dedicated side-hustle knowledge task", async () => {
  const [migration, autoUpdate, engine, optimizer] = await Promise.all([
    readRepo("supabase/migrations/20260923231331_side_hustle_knowledge_tasks_v1.sql"),
    read("lib/knowledge-auto-update.ts"),
    read("lib/knowledge-engine.ts"),
    read("lib/prompt-optimization.ts"),
  ]);

  for (const task of [
    "sidejob_content",
    "sidejob_sns",
    "sidejob_video",
    "sidejob_affiliate",
    "sidejob_resale",
    "sidejob_crowdsourcing",
    "sidejob_skill_sales",
    "sidejob_digital_product",
    "sidejob_outreach",
    "sidejob_research",
    "sidejob_efficiency",
    "sidejob_planning",
  ]) {
    for (const source of [migration, autoUpdate, engine]) {
      assert.match(source, new RegExp(task));
    }
  }

  assert.match(migration, /knowledge_catalog_tasks_check/);
  assert.match(migration, /prompt_optimization_catalog_task_check/);
  assert.match(migration, /admin_publish_knowledge_refresh_bundle/);
  assert.match(migration, /admin_review_knowledge_candidate/);
  assert.match(autoUpdate, /副業タスク割り当て/);
  assert.match(autoUpdate, /1つの変更を無関係な全タスクへ広げない/);
  assert.match(optimizer, /isKnowledgeTask/);
  assert.doesNotMatch([migration, autoUpdate].join("\n"), /service[_-]?role|sb_secret_/i);
});
