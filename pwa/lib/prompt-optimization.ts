import type { SupabaseClient } from "@supabase/supabase-js";

import type { KnowledgeTask } from "@/lib/knowledge-engine";
import type { AiPlan, AiProvider } from "@/lib/user-personalization";

export type PromptOptimizationRule = {
  key: string;
  provider: "all" | AiProvider;
  plan: "all" | AiPlan;
  task: "all" | KnowledgeTask;
  rules: string[];
  priority: number;
  catalogVersion: number;
  sourceUrls: string[];
  sourceSummary: string;
  sourceCheckedAt: string | null;
};

export type KnowledgeRuntimeState = {
  channel: "stable" | "fresh";
  refreshHours: number;
  effectiveVersion: number;
  lastPublishedAt: string | null;
  nextRefreshDueAt: string | null;
};

let runtimePromptOptimizations: PromptOptimizationRule[] = [];
let runtimeKnowledgeState: KnowledgeRuntimeState = {
  channel: "stable",
  refreshHours: 168,
  effectiveVersion: 1,
  lastPublishedAt: null,
  nextRefreshDueAt: null,
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function parseRule(row: Record<string, unknown>): PromptOptimizationRule | null {
  const provider = row.provider;
  const plan = row.plan;
  const task = row.task;
  const key = typeof row.key === "string" ? row.key.trim() : "";
  if (
    !key
    || (provider !== "all" && provider !== "chatgpt" && provider !== "claude" && provider !== "gemini")
    || (plan !== "all" && plan !== "free" && plan !== "paid")
    || (task !== "all" && task !== "title" && task !== "article" && task !== "image" && task !== "social" && task !== "promotion")
  ) {
    return null;
  }

  return {
    key,
    provider,
    plan,
    task,
    rules: asStringArray(row.rules),
    priority: typeof row.priority === "number" && Number.isFinite(row.priority)
      ? Math.max(0, Math.min(100, Math.trunc(row.priority)))
      : 70,
    catalogVersion: typeof row.catalog_version === "number"
      ? Math.max(1, Math.trunc(row.catalog_version))
      : Number(row.catalog_version ?? 1) || 1,
    sourceUrls: asStringArray(row.source_urls),
    sourceSummary: typeof row.source_summary === "string" ? row.source_summary : "",
    sourceCheckedAt: typeof row.source_checked_at === "string" ? row.source_checked_at : null,
  };
}

export async function loadActivePromptOptimizations(client: SupabaseClient): Promise<PromptOptimizationRule[]> {
  const { data, error } = await client.rpc("list_my_active_prompt_optimizations");
  if (error) throw new Error("最新プロンプト最適化を読み込めませんでした。");
  return (data ?? [])
    .map((row: Record<string, unknown>) => parseRule(row))
    .filter((rule: PromptOptimizationRule | null): rule is PromptOptimizationRule => Boolean(rule));
}

export async function loadKnowledgeRuntimeState(client: SupabaseClient): Promise<KnowledgeRuntimeState> {
  const { data, error } = await client.rpc("get_my_knowledge_runtime_state");
  if (error) throw new Error("ナレッジ更新状態を取得できませんでした。");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) return runtimeKnowledgeState;
  const value = row as Record<string, unknown>;
  return {
    channel: value.channel === "fresh" ? "fresh" : "stable",
    refreshHours: typeof value.refresh_hours === "number"
      ? Math.max(1, Math.trunc(value.refresh_hours))
      : Number(value.refresh_hours ?? 168) || 168,
    effectiveVersion: typeof value.effective_version === "number"
      ? Math.max(1, Math.trunc(value.effective_version))
      : Number(value.effective_version ?? 1) || 1,
    lastPublishedAt: typeof value.last_published_at === "string" ? value.last_published_at : null,
    nextRefreshDueAt: typeof value.next_refresh_due_at === "string" ? value.next_refresh_due_at : null,
  };
}

export function setRuntimePromptOptimizations(rules: PromptOptimizationRule[]): void {
  runtimePromptOptimizations = [...rules]
    .filter((rule) => rule.rules.length > 0)
    .sort((a, b) => b.priority - a.priority || b.catalogVersion - a.catalogVersion || a.key.localeCompare(b.key, "ja"));
}

export function setRuntimeKnowledgeState(state: KnowledgeRuntimeState): void {
  runtimeKnowledgeState = state;
}

export function getRuntimeKnowledgeState(): KnowledgeRuntimeState {
  return runtimeKnowledgeState;
}

export function getRuntimePromptOptimizations(): PromptOptimizationRule[] {
  return runtimePromptOptimizations;
}

export function compilePromptOptimizationContext(
  provider: AiProvider,
  plan: AiPlan,
  task: KnowledgeTask,
): string {
  const matched = runtimePromptOptimizations.filter((rule) =>
    (rule.provider === "all" || rule.provider === provider)
    && (rule.plan === "all" || rule.plan === plan)
    && (rule.task === "all" || rule.task === task));

  if (matched.length === 0) return "";

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const rule of matched) {
    for (const raw of rule.rules) {
      const value = raw.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      lines.push(value);
    }
  }
  if (lines.length === 0) return "";

  return [
    "【AAS CLOUD PROMPT OPTIMIZATION】",
    `更新チャネル: ${runtimeKnowledgeState.channel} / v${runtimeKnowledgeState.effectiveVersion}`,
    `対象: ${provider} / ${plan} / ${task}`,
    ...lines.map((line) => `- ${line}`),
    "- 上記は今回の絶対ルール・ユーザー指定・事実性より優先しない。",
  ].join("\n");
}
