import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeTier = "stable" | "fresh";
export type RankingKey = "level" | "completed_articles" | "weekly_xp";

export type CreatorDashboard = {
  publicName: string;
  bio: string;
  avatarUrl: string;
  favoriteGenre: string;
  creatorGoal: string;
  rankingOptIn: boolean;
  showLevel: boolean;
  showCompletedArticles: boolean;
  totalXp: number;
  level: number;
  completedArticles: number;
  completedMagazines: number;
  weeklyXp: number;
  currentStreak: number;
  bestStreak: number;
  noteMember: boolean;
  knowledgeTier: KnowledgeTier;
  knowledgeRefreshHours: number;
  knowledgeVersion: number;
  knowledgeLastPublishedAt: string;
  rankingLastGeneratedAt: string;
  rankingRefreshHours: number;
};

export type CreatorProfilePatch = Partial<{
  public_name: string;
  bio: string;
  avatar_url: string;
  favorite_genre: string;
  creator_goal: string;
  ranking_opt_in: boolean;
  show_level: boolean;
  show_completed_articles: boolean;
}>;

export type RankingRow = {
  rankingKey: RankingKey;
  rankPosition: number;
  publicName: string;
  avatarUrl: string;
  level: number | null;
  completedArticles: number | null;
  weeklyXp: number;
  metricValue: number;
  isMe: boolean;
  generatedAt: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data) || !data.length || typeof data[0] !== "object" || data[0] === null) return null;
  return data[0] as Record<string, unknown>;
}

export async function getMyCreatorDashboard(client: SupabaseClient): Promise<CreatorDashboard> {
  const { data, error } = await client.rpc("get_my_creator_dashboard");
  if (error) throw new Error("クリエイターステータスを読み込めませんでした。");
  const row = firstRow(data);
  if (!row) throw new Error("クリエイターステータスが見つかりません。");
  const tier: KnowledgeTier = row.knowledge_tier === "fresh" ? "fresh" : "stable";
  return {
    publicName: asString(row.public_name),
    bio: asString(row.bio),
    avatarUrl: asString(row.avatar_url),
    favoriteGenre: asString(row.favorite_genre),
    creatorGoal: asString(row.creator_goal),
    rankingOptIn: asBoolean(row.ranking_opt_in),
    showLevel: row.show_level !== false,
    showCompletedArticles: row.show_completed_articles !== false,
    totalXp: asNumber(row.total_xp),
    level: Math.max(1, asNumber(row.level, 1)),
    completedArticles: Math.max(0, asNumber(row.completed_articles)),
    completedMagazines: Math.max(0, asNumber(row.completed_magazines)),
    weeklyXp: Math.max(0, asNumber(row.weekly_xp)),
    currentStreak: Math.max(0, asNumber(row.current_streak)),
    bestStreak: Math.max(0, asNumber(row.best_streak)),
    noteMember: asBoolean(row.note_member),
    knowledgeTier: tier,
    knowledgeRefreshHours: Math.max(1, asNumber(row.knowledge_refresh_hours, tier === "fresh" ? 48 : 168)),
    knowledgeVersion: Math.max(1, asNumber(row.knowledge_version, 1)),
    knowledgeLastPublishedAt: asString(row.knowledge_last_published_at),
    rankingLastGeneratedAt: asString(row.ranking_last_generated_at),
    rankingRefreshHours: Math.max(1, asNumber(row.ranking_refresh_hours, 12)),
  };
}

export async function updateMyCreatorProfile(
  client: SupabaseClient,
  patch: CreatorProfilePatch,
): Promise<void> {
  const { error } = await client.rpc("update_my_creator_profile", { p_patch: patch });
  if (error) {
    if (String(error.message).includes("public name is required")) {
      throw new Error("ランキングへ参加するには公開名を入力してください。");
    }
    throw new Error("プロフィールを保存できませんでした。");
  }
}

export async function getCreatorRanking(
  client: SupabaseClient,
  key: RankingKey,
  limit = 50,
): Promise<RankingRow[]> {
  const { data, error } = await client.rpc("get_creator_ranking", {
    p_ranking_key: key,
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
  });
  if (error) throw new Error("ランキングを読み込めませんでした。");
  if (!Array.isArray(data)) return [];
  return data.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      rankingKey: row.ranking_key === "completed_articles" || row.ranking_key === "weekly_xp" ? row.ranking_key : "level",
      rankPosition: Math.max(1, asNumber(row.rank_position, 1)),
      publicName: asString(row.public_name) || "Creator",
      avatarUrl: asString(row.avatar_url),
      level: row.level === null ? null : Math.max(1, asNumber(row.level, 1)),
      completedArticles: row.completed_articles === null ? null : Math.max(0, asNumber(row.completed_articles)),
      weeklyXp: Math.max(0, asNumber(row.weekly_xp)),
      metricValue: Math.max(0, asNumber(row.metric_value)),
      isMe: asBoolean(row.is_me),
      generatedAt: asString(row.generated_at),
    };
  });
}

export function xpProgress(totalXp: number, level: number, xpPerLevel = 500): { current: number; needed: number; percent: number } {
  const safeLevel = Math.max(1, Math.trunc(level));
  const safeTotal = Math.max(0, Math.trunc(totalXp));
  const current = Math.max(0, safeTotal - (safeLevel - 1) * xpPerLevel);
  const needed = xpPerLevel;
  return { current, needed, percent: Math.min(100, Math.round((current / needed) * 100)) };
}

export function formatRefreshCadence(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "24時間ごと" : `${days}日ごと`;
  }
  return `${hours}時間ごと`;
}
