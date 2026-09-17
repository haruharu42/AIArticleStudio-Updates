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
  membershipPlanCode: string;
  membershipPlanName: string;
  membershipTierRank: number;
  membershipBadgeLabel: string;
  articleXpMultiplier: number;
  membershipArticleQuotaBonus: number;
  creatorArticleQuotaBonus: number;
  templateTier: string;
  knowledgeTier: KnowledgeTier;
  knowledgeRefreshHours: number;
  knowledgeVersion: number;
  knowledgeLastPublishedAt: string;
  rankingLastGeneratedAt: string;
  rankingRefreshHours: number;
  bonusGenerationCredits: number;
  availableMissions: number;
  claimableMissions: number;
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

export type CreatorMission = {
  missionCode: string;
  title: string;
  description: string;
  cadence: "daily" | "weekly" | "lifetime";
  targetCount: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  canClaim: boolean;
  rewardXp: number;
  rewardGenerationCredits: number;
  minimumTierRank: number;
};

export type MissionClaimResult = {
  missionCode: string;
  rewardXp: number;
  rewardGenerationCredits: number;
  totalXp: number;
  level: number;
  bonusGenerationCredits: number;
};

export type CreatorMembershipPlan = {
  planCode: string;
  displayName: string;
  tierRank: number;
  badgeLabel: string;
  knowledgeChannel: KnowledgeTier;
  knowledgeRefreshHours: number;
  articleXpMultiplier: number;
  articleQuotaBonus: number;
  templateTier: string;
  benefits: Record<string, unknown>;
  isCurrent: boolean;
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data) || !data.length || typeof data[0] !== "object" || data[0] === null) return null;
  return data[0] as Record<string, unknown>;
}

function parseDashboard(row: Record<string, unknown>): CreatorDashboard {
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
    totalXp: Math.max(0, asNumber(row.total_xp)),
    level: Math.max(1, asNumber(row.level, 1)),
    completedArticles: Math.max(0, asNumber(row.completed_articles)),
    completedMagazines: Math.max(0, asNumber(row.completed_magazines)),
    weeklyXp: Math.max(0, asNumber(row.weekly_xp)),
    currentStreak: Math.max(0, asNumber(row.current_streak)),
    bestStreak: Math.max(0, asNumber(row.best_streak)),
    noteMember: asBoolean(row.note_member),
    membershipPlanCode: asString(row.membership_plan_code),
    membershipPlanName: asString(row.membership_plan_name),
    membershipTierRank: Math.max(0, asNumber(row.membership_tier_rank)),
    membershipBadgeLabel: asString(row.membership_badge_label),
    articleXpMultiplier: Math.max(1, asNumber(row.article_xp_multiplier, 1)),
    membershipArticleQuotaBonus: Math.max(0, asNumber(row.membership_article_quota_bonus)),
    creatorArticleQuotaBonus: Math.max(0, asNumber(row.creator_article_quota_bonus)),
    templateTier: asString(row.template_tier) || "standard",
    knowledgeTier: tier,
    knowledgeRefreshHours: Math.max(1, asNumber(row.knowledge_refresh_hours, tier === "fresh" ? 48 : 168)),
    knowledgeVersion: Math.max(1, asNumber(row.knowledge_version, 1)),
    knowledgeLastPublishedAt: asString(row.knowledge_last_published_at),
    rankingLastGeneratedAt: asString(row.ranking_last_generated_at),
    rankingRefreshHours: Math.max(1, asNumber(row.ranking_refresh_hours, 12)),
    bonusGenerationCredits: Math.max(0, asNumber(row.bonus_generation_credits)),
    availableMissions: Math.max(0, asNumber(row.available_missions)),
    claimableMissions: Math.max(0, asNumber(row.claimable_missions)),
  };
}

export async function getMyCreatorDashboard(client: SupabaseClient): Promise<CreatorDashboard> {
  const v2 = await client.rpc("get_my_creator_dashboard_v2");
  if (!v2.error) {
    const row = firstRow(v2.data);
    if (!row) throw new Error("クリエイターステータスが見つかりません。");
    return parseDashboard(row);
  }

  // Compatibility fallback keeps Preview environments safe while migrations roll out.
  const legacy = await client.rpc("get_my_creator_dashboard");
  if (legacy.error) throw new Error("クリエイターステータスを読み込めませんでした。");
  const row = firstRow(legacy.data);
  if (!row) throw new Error("クリエイターステータスが見つかりません。");
  return parseDashboard(row);
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

export async function getMyCreatorMissions(client: SupabaseClient): Promise<CreatorMission[]> {
  const { data, error } = await client.rpc("get_my_creator_missions");
  if (error) throw new Error("ミッションを読み込めませんでした。");
  if (!Array.isArray(data)) return [];
  return data.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const cadence = row.cadence === "weekly" || row.cadence === "lifetime" ? row.cadence : "daily";
    return {
      missionCode: asString(row.mission_code),
      title: asString(row.title),
      description: asString(row.description),
      cadence,
      targetCount: Math.max(1, asNumber(row.target_count, 1)),
      progress: Math.max(0, asNumber(row.progress)),
      completed: asBoolean(row.completed),
      claimed: asBoolean(row.claimed),
      canClaim: asBoolean(row.can_claim),
      rewardXp: Math.max(0, asNumber(row.reward_xp)),
      rewardGenerationCredits: Math.max(0, asNumber(row.reward_generation_credits)),
      minimumTierRank: Math.max(0, asNumber(row.minimum_tier_rank)),
    };
  });
}

export async function claimCreatorMissionReward(client: SupabaseClient, missionCode: string): Promise<MissionClaimResult> {
  const { data, error } = await client.rpc("claim_creator_mission_reward", { p_mission_code: missionCode });
  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("already claimed")) throw new Error("このミッション報酬は受け取り済みです。");
    if (message.includes("not completed")) throw new Error("ミッションはまだ完了していません。");
    if (message.includes("membership tier required")) throw new Error("このミッションには対象のCreator Clubプランが必要です。");
    throw new Error("ミッション報酬を受け取れませんでした。");
  }
  const row = firstRow(data);
  if (!row) throw new Error("ミッション報酬の応答が不正です。");
  return {
    missionCode: asString(row.mission_code),
    rewardXp: Math.max(0, asNumber(row.reward_xp)),
    rewardGenerationCredits: Math.max(0, asNumber(row.reward_generation_credits)),
    totalXp: Math.max(0, asNumber(row.total_xp)),
    level: Math.max(1, asNumber(row.level, 1)),
    bonusGenerationCredits: Math.max(0, asNumber(row.bonus_generation_credits)),
  };
}

export async function listCreatorMembershipPlans(client: SupabaseClient): Promise<CreatorMembershipPlan[]> {
  const { data, error } = await client.rpc("list_my_creator_membership_plans");
  if (error) throw new Error("Creator Clubプランを読み込めませんでした。");
  if (!Array.isArray(data)) return [];
  return data.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const knowledgeChannel: KnowledgeTier = row.knowledge_channel === "fresh" ? "fresh" : "stable";
    return {
      planCode: asString(row.plan_code),
      displayName: asString(row.display_name),
      tierRank: Math.max(1, asNumber(row.tier_rank, 1)),
      badgeLabel: asString(row.badge_label),
      knowledgeChannel,
      knowledgeRefreshHours: Math.max(1, asNumber(row.knowledge_refresh_hours, knowledgeChannel === "fresh" ? 48 : 168)),
      articleXpMultiplier: Math.max(1, asNumber(row.article_xp_multiplier, 1)),
      articleQuotaBonus: Math.max(0, asNumber(row.article_quota_bonus)),
      templateTier: asString(row.template_tier) || "member",
      benefits: asObject(row.benefits),
      isCurrent: asBoolean(row.is_current),
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
