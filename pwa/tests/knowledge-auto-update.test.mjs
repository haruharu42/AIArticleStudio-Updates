import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pwaRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(pwaRoot, "..");
const readPwa = (relative) => readFile(path.join(pwaRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("knowledge refresh scheduler releases processing requests that are stuck for more than 24 hours", async () => {
  const migration = await readRepo("supabase/migrations/20260923234555_knowledge_refresh_stale_recovery.sql");
  const panel = await readPwa("components/knowledge-refresh-panel.tsx");

  assert.match(migration, /status = 'failed'/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /next refresh cycle/);
  assert.match(migration, /enqueue_due_knowledge_refreshes/);
  assert.match(migration, /revoke all on function private\.enqueue_due_knowledge_refreshes/);
  assert.match(panel, /24時間以上処理中だったため自動解除/);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_/i);
});

test("knowledge auto-update control plane keeps Fresh and Stable review-gated and versioned", async () => {
  const migration = await readRepo("supabase/migrations/20260919083000_knowledge_prompt_auto_update.sql");

  assert.match(migration, /create table if not exists public\.prompt_optimization_catalog/);
  assert.match(migration, /alter table public\.prompt_optimization_catalog enable row level security/);
  assert.match(migration, /alter table public\.prompt_optimization_catalog force row level security/);
  assert.match(migration, /revoke all on table public\.prompt_optimization_catalog from public, anon, authenticated/);
  assert.match(migration, /admin_publish_knowledge_refresh_bundle/);
  assert.match(migration, /request_row\.channel = 'fresh'.*'fresh_first'/s);
  assert.match(migration, /stable_knowledge_refresh_hours/);
  assert.match(migration, /current_version = next_version/);
  assert.match(migration, /published_version = next_version/);
  assert.match(migration, /knowledge key must start with auto:/);
  assert.match(migration, /prompt key must start with auto:/);
  assert.match(migration, /source_urls are required/);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_/i);
});

test("runtime loads cloud knowledge and task-aware prompt optimizations together", async () => {
  const bootstrap = await readPwa("components/knowledge-runtime-bootstrap.tsx");
  const promptOptimization = await readPwa("lib/prompt-optimization.ts");
  const personalization = await readPwa("lib/user-personalization.ts");

  assert.match(bootstrap, /loadActiveKnowledgeCatalog/);
  assert.match(bootstrap, /loadActivePromptOptimizations/);
  assert.match(bootstrap, /loadKnowledgeRuntimeState/);
  assert.match(bootstrap, /Promise\.all/);
  assert.match(promptOptimization, /compilePromptOptimizationContext/);
  assert.match(promptOptimization, /KNOWLEDGE_RUNTIME_EVENT/);
  assert.match(promptOptimization, /isKnowledgeTask/);
  assert.match(promptOptimization, /AAS CLOUD PROMPT OPTIMIZATION/);
  assert.match(promptOptimization, /rule\.provider === "all" \|\| rule\.provider === provider/);
  assert.match(promptOptimization, /rule\.task === "all" \|\| rule\.task === task/);
  assert.match(personalization, /task: KnowledgeTask = "article"/);
  assert.match(personalization, /compilePromptOptimizationContext/);
});

test("all major exported prompt builders can consume the cloud optimization layer", async () => {
  const creator = await readPwa("lib/phase11-create.ts");
  const image = await readPwa("lib/phase13-image-prompts.ts");
  const social = await readPwa("lib/phase14-sns.ts");
  const promotion = await readPwa("lib/admin-promotion.ts");
  const sidejob = await readPwa("lib/phase15-sidejob.ts");
  const snsPlan = await readPwa("lib/phase15-sns-plan.ts");

  assert.match(creator, /promptContextBlock\("title"\)/);
  assert.match(creator, /promptContextBlock\("article"\)/);
  assert.match(image, /buildUserPromptContext\(getRuntimeWritingProfile\(\), "image"\)/);
  assert.match(social, /buildUserPromptContext\(getRuntimeWritingProfile\(\), "social"\)/);
  assert.match(promotion, /buildUserPromptContext\(getRuntimeWritingProfile\(\), "promotion"\)/);
  assert.match(sidejob, /buildUserPromptContext\(getRuntimeWritingProfile\(\), "article"\)/);
  assert.match(snsPlan, /buildUserPromptContext\(getRuntimeWritingProfile\(\), "social"\)/);
  assert.match(creator, /cloud_knowledge_channel/);
  assert.match(creator, /cloud_knowledge_version/);
  assert.match(creator, /prompt_optimization_version/);
});

test("admin refresh UI requires sourced JSON review before publication", async () => {
  const panel = await readPwa("components/knowledge-refresh-panel.tsx");
  const client = await readPwa("lib/knowledge-auto-update.ts");
  const admin = await readPwa("components/admin-knowledge-page.tsx");

  assert.match(admin, /KnowledgeRefreshPanel/);
  assert.match(panel, /自動収集＝自動公開ではありません/);
  assert.match(panel, /調査プロンプトをコピー/);
  assert.match(panel, /差分確認後に公開/);
  assert.match(client, /まず公式ヘルプ、公式ドキュメント、公式発表を使う/);
  assert.match(client, /可能な限り2つ以上の独立した根拠/);
  assert.match(client, /source_urlsが空の候補は出さない/);
  assert.match(client, /副業タスク割り当て/);
  assert.match(client, /sidejob_affiliate/);
  assert.match(client, /sidejob_resale/);
  assert.match(client, /sidejob_crowdsourcing/);
  assert.match(client, /admin_publish_knowledge_refresh_bundle/);
  assert.doesNotMatch(`${panel}\n${client}`, /service[_-]?role|sb_secret_|api[_-]?key/i);
});


test("knowledge update diff migration records material changes before publish", async () => {
  const migration = await readRepo("supabase/migrations/20260919122008_knowledge_prompt_update_diff_visibility.sql");

  assert.match(migration, /add column if not exists change_details jsonb/);
  assert.match(migration, /private\.aas_knowledge_refresh_diff/);
  assert.match(migration, /admin_preview_knowledge_refresh_bundle_diff/);
  assert.match(migration, /admin_publish_knowledge_refresh_bundle_v2/);
  assert.match(migration, /admin_list_knowledge_refresh_requests_v2/);
  assert.match(migration, /admin_get_knowledge_refresh_channels/);
  assert.match(migration, /changed_fields/);
  assert.match(migration, /'added'/);
  assert.match(migration, /'updated'/);
  assert.match(migration, /'unchanged'/);
  assert.match(migration, /private\.is_active_admin/);
  assert.doesNotMatch(migration, /grant .* to anon/i);
  assert.doesNotMatch(migration, /service[_-]?role|sb_secret_/i);
});

test("Fresh and Stable are explained clearly and publication requires diff review", async () => {
  const panel = await readPwa("components/knowledge-refresh-panel.tsx");
  const client = await readPwa("lib/knowledge-auto-update.ts");
  const css = await readPwa("app/phase26-knowledge.css");

  assert.match(panel, /FRESH/);
  assert.match(panel, /先行確認版/);
  assert.match(panel, /STABLE/);
  assert.match(panel, /標準版/);
  assert.match(panel, /Fresh = 早めに確認する場所/);
  assert.match(panel, /Stable = 一般利用の基準/);
  assert.match(panel, /変更点を確認/);
  assert.match(panel, /差分確認後に公開/);
  assert.match(panel, /今回どこが変わるか/);
  assert.match(panel, /変更した場所を詳しく見る/);
  assert.match(panel, /adminPreviewKnowledgeRefreshBundleDiff/);
  assert.match(panel, /adminGetKnowledgeRefreshChannels/);

  assert.match(client, /admin_list_knowledge_refresh_requests_v2/);
  assert.match(client, /admin_publish_knowledge_refresh_bundle_v2/);
  assert.match(client, /parseKnowledgeRefreshDiff/);
  assert.match(css, /\.knowledge-channel-guide/);
  assert.match(css, /\.knowledge-diff-summary/);
});


test("side-hustle knowledge migration expands task constraints without changing the review gate", async () => {
  const migration = await readRepo("supabase/migrations/20260923231331_side_hustle_knowledge_tasks_v1.sql");
  assert.match(migration, /sidejob_content/);
  assert.match(migration, /sidejob_sns/);
  assert.match(migration, /sidejob_video/);
  assert.match(migration, /sidejob_affiliate/);
  assert.match(migration, /sidejob_resale/);
  assert.match(migration, /sidejob_crowdsourcing/);
  assert.match(migration, /sidejob_skill_sales/);
  assert.match(migration, /sidejob_digital_product/);
  assert.match(migration, /sidejob_outreach/);
  assert.match(migration, /sidejob_research/);
  assert.match(migration, /sidejob_efficiency/);
  assert.match(migration, /sidejob_planning/);
  assert.match(migration, /admin_publish_knowledge_refresh_bundle/);
  assert.match(migration, /admin_review_knowledge_candidate/);
  assert.doesNotMatch(migration, /grant .* to anon/i);
});
