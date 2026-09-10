import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listCloudArticles,
  requireArticleAccess,
  type ArticleSummary,
} from "@/lib/phase7-articles";

export type ContentAnalytics = {
  currentArticles: number;
  maxArticles: number | null;
  remainingArticles: number | null;
  unlimited: boolean;
  publicationCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  publishedRate: number;
  readyOrWaiting: number;
  recent: ArticleSummary[];
};

function countMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, number> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "number" && Number.isFinite(item) && item >= 0) {
      output[key] = item;
    }
  }
  return output;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}の形式が不正です。`);
  }
  return value;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

export async function loadContentAnalytics(
  client: SupabaseClient,
  ownerId: string,
): Promise<ContentAnalytics> {
  await requireArticleAccess(client, ownerId);
  const [{ data, error }, articles] = await Promise.all([
    client.rpc("get_my_article_stock_summary"),
    listCloudArticles(client, ownerId, 200),
  ]);
  if (error) throw new Error("記事集計の取得に失敗しました。");
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("記事集計の応答形式が不正です。");
  }
  const row = raw as Record<string, unknown>;
  const currentArticles = integer(row.current_articles, "記事数");
  const maxArticles = nullableInteger(row.max_articles, "上限");
  const remainingArticles = nullableInteger(row.remaining_articles, "残り記事数");
  const unlimited = row.is_unlimited === true;
  const publicationCounts = countMap(row.publication_counts);
  const statusCounts = countMap(row.status_counts);
  const published = statusCounts.published ?? 0;
  const readyOrWaiting = (statusCounts.ready ?? 0) + (statusCounts.waiting_publish ?? 0);
  const publishedRate = currentArticles > 0 ? Math.round((published / currentArticles) * 100) : 0;

  return {
    currentArticles,
    maxArticles,
    remainingArticles,
    unlimited,
    publicationCounts,
    statusCounts,
    publishedRate,
    readyOrWaiting,
    recent: articles.slice(0, 8),
  };
}
