import type { SupabaseClient } from "@supabase/supabase-js";

export type CreatorProfile = {
  userId: string;
  aasUserId: string;
  displayName: string;
  bio: string;
  favoriteGenres: string[];
  goal: string;
  rankingOptIn: boolean;
  showLevel: boolean;
  showCompletedCount: boolean;
  updatedAt: string;
};

export type CreatorStats = {
  xp: number;
  level: number;
  completedArticles: number;
  completedThisWeek: number;
  levelRank: number | null;
  completedRank: number | null;
};

export type LeaderboardMode = "level" | "completed";

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  level: number;
  xp: number;
  completedArticles: number;
};

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error("クリエイター情報の応答形式が不正です。");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("クリエイター情報の応答形式が不正です。");
    }
    return item as Row;
  });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = number(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function getMyCreatorProfile(client: SupabaseClient): Promise<CreatorProfile> {
  const { data, error } = await client.rpc("get_my_creator_profile");
  if (error) throw new Error("プロフィールを取得できませんでした。");
  const row = rows(data)[0];
  if (!row) throw new Error("プロフィールを取得できませんでした。");
  return {
    userId: text(row.user_id),
    aasUserId: text(row.aas_user_id),
    displayName: text(row.display_name, "クリエイター"),
    bio: text(row.bio),
    favoriteGenres: stringArray(row.favorite_genres),
    goal: text(row.goal),
    rankingOptIn: bool(row.ranking_opt_in, true),
    showLevel: bool(row.show_level, true),
    showCompletedCount: bool(row.show_completed_count, true),
    updatedAt: text(row.updated_at),
  };
}

export async function updateMyCreatorProfile(
  client: SupabaseClient,
  profile: Omit<CreatorProfile, "userId" | "aasUserId" | "updatedAt">,
): Promise<void> {
  const genres = profile.favoriteGenres
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  const { error } = await client.rpc("update_my_creator_profile", {
    p_display_name: profile.displayName.trim(),
    p_bio: profile.bio.trim(),
    p_favorite_genres: genres,
    p_goal: profile.goal.trim(),
    p_ranking_opt_in: profile.rankingOptIn,
    p_show_level: profile.showLevel,
    p_show_completed_count: profile.showCompletedCount,
  });
  if (error) throw new Error("プロフィールを保存できませんでした。入力内容を確認してください。");
}

export async function getMyCreatorStats(client: SupabaseClient): Promise<CreatorStats> {
  const { data, error } = await client.rpc("get_my_creator_stats");
  if (error) throw new Error("クリエイター実績を取得できませんでした。");
  const row = rows(data)[0];
  if (!row) {
    return { xp: 0, level: 1, completedArticles: 0, completedThisWeek: 0, levelRank: null, completedRank: null };
  }
  return {
    xp: number(row.xp),
    level: number(row.level, 1),
    completedArticles: number(row.completed_articles),
    completedThisWeek: number(row.completed_this_week),
    levelRank: nullableNumber(row.level_rank),
    completedRank: nullableNumber(row.completed_rank),
  };
}

export async function getCreatorLeaderboard(
  client: SupabaseClient,
  mode: LeaderboardMode,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await client.rpc("get_creator_leaderboard", {
    p_mode: mode,
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
  });
  if (error) throw new Error("ランキングを取得できませんでした。");
  return rows(data).map((row) => ({
    rank: number(row.rank),
    userId: text(row.user_id),
    displayName: text(row.display_name, "クリエイター"),
    level: number(row.creator_level, 1),
    xp: number(row.xp),
    completedArticles: number(row.completed_articles),
  }));
}
