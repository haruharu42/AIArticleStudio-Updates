import type { SupabaseClient } from "@supabase/supabase-js";

export const FREE_TRIAL_USAGE_CHANGED_EVENT = "aas:free-trial-usage-changed";

export type TrialFeature =
  | "article_generate"
  | "title_generate"
  | "article_rewrite"
  | "sns_generate"
  | "image_generate"
  | "ai_assist";

export type FreeTrialSettings = {
  enabled: boolean;
  durationDays: number;
  dailyTotalLimit: number;
  articleGenerateLimit: number;
  titleGenerateLimit: number;
  articleRewriteLimit: number;
  snsGenerateLimit: number;
  imageGenerateLimit: number;
  aiAssistLimit: number;
  resetTimezone: string;
  resetHour: number;
  autoStartOnActivation: boolean;
  newUsersOnly: boolean;
  eligibleFrom: string;
  applyDurationChangesToActive: boolean;
  updatedAt: string;
};

export type FreeTrialStatus = {
  programEnabled: boolean;
  trialEligible: boolean;
  trialStatus: string;
  startedAt: string | null;
  endsAt: string | null;
  remainingDays: number | null;
  usageDate: string;
  totalUsed: number;
  dailyTotalLimit: number;
  articleGenerateUsed: number;
  articleGenerateLimit: number;
  titleGenerateUsed: number;
  titleGenerateLimit: number;
  articleRewriteUsed: number;
  articleRewriteLimit: number;
  snsGenerateUsed: number;
  snsGenerateLimit: number;
  imageGenerateUsed: number;
  imageGenerateLimit: number;
  aiAssistUsed: number;
  aiAssistLimit: number;
  resetTimezone: string;
  resetHour: number;
  bypassLimits: boolean;
};

export type TrialUsageResult = {
  allowed: boolean;
  bypassLimits: boolean;
  reason: string;
  usageDate: string | null;
  totalUsed: number;
  dailyTotalLimit: number;
  featureUsed: number;
  featureLimit: number;
  remaining: number;
};

export type AdminUserFreeTrial = {
  hasTrial: boolean;
  trialStatus: string;
  source: string | null;
  startedAt: string | null;
  endsAt: string | null;
  usageDate: string;
  totalUsed: number;
  dailyTotalLimit: number;
  articleGenerateUsed: number;
  articleGenerateLimit: number;
  titleGenerateUsed: number;
  titleGenerateLimit: number;
  articleRewriteUsed: number;
  articleRewriteLimit: number;
  snsGenerateUsed: number;
  snsGenerateLimit: number;
  imageGenerateUsed: number;
  imageGenerateLimit: number;
  aiAssistUsed: number;
  aiAssistLimit: number;
};

type Row = Record<string, unknown>;

function firstRow(value: unknown, label: string): Row {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`${label}の応答形式が不正です。`);
  }
  return item as Row;
}

function bool(value: unknown): boolean { return value === true; }
function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label}の形式が不正です。`);
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label}の形式が不正です。`);
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}
function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

function rpcError(error: unknown, fallback: string): Error {
  const source = error && typeof error === "object" ? error as Row : {};
  const message = typeof source.message === "string" ? source.message.toLowerCase() : "";
  if (message.includes("active admin required")) return new Error("管理者権限を確認できません。再ログインしてください。");
  if (message.includes("trial already exists")) return new Error("このユーザーは無料トライアルをすでに利用済みです。2回目のトライアルは開始できません。");
  if (message.includes("trial cannot be started")) return new Error("現在の設定またはユーザー状態では無料トライアルを開始できません。");
  if (message.includes("trial not found")) return new Error("このユーザーには無料トライアル履歴がありません。");
  if (message.includes("invalid reset timezone")) return new Error("リセットタイムゾーンを確認してください。");
  return new Error(fallback);
}

function parseSettings(value: unknown): FreeTrialSettings {
  const row = firstRow(value, "無料トライアル設定");
  return {
    enabled: bool(row.enabled),
    durationDays: integer(row.duration_days, "無料日数"),
    dailyTotalLimit: integer(row.daily_total_limit, "1日総上限"),
    articleGenerateLimit: integer(row.article_generate_limit, "記事生成上限"),
    titleGenerateLimit: integer(row.title_generate_limit, "タイトル生成上限"),
    articleRewriteLimit: integer(row.article_rewrite_limit, "リライト上限"),
    snsGenerateLimit: integer(row.sns_generate_limit, "SNS生成上限"),
    imageGenerateLimit: integer(row.image_generate_limit, "画像生成上限"),
    aiAssistLimit: integer(row.ai_assist_limit, "AI補助上限"),
    resetTimezone: text(row.reset_timezone, "リセットタイムゾーン"),
    resetHour: integer(row.reset_hour, "リセット時刻"),
    autoStartOnActivation: bool(row.auto_start_on_activation),
    newUsersOnly: bool(row.new_users_only),
    eligibleFrom: text(row.eligible_from, "対象開始日時"),
    applyDurationChangesToActive: bool(row.apply_duration_changes_to_active),
    updatedAt: text(row.updated_at, "更新日時"),
  };
}

function parseStatus(value: unknown): FreeTrialStatus {
  const row = firstRow(value, "無料トライアル状態");
  return {
    programEnabled: bool(row.program_enabled),
    trialEligible: bool(row.trial_eligible),
    trialStatus: text(row.trial_status, "トライアル状態"),
    startedAt: nullableText(row.started_at, "開始日時"),
    endsAt: nullableText(row.ends_at, "終了日時"),
    remainingDays: nullableInteger(row.remaining_days, "残り日数"),
    usageDate: text(row.usage_date, "利用日"),
    totalUsed: integer(row.total_used, "総利用回数"),
    dailyTotalLimit: integer(row.daily_total_limit, "1日総上限"),
    articleGenerateUsed: integer(row.article_generate_used, "記事生成利用回数"),
    articleGenerateLimit: integer(row.article_generate_limit, "記事生成上限"),
    titleGenerateUsed: integer(row.title_generate_used, "タイトル生成利用回数"),
    titleGenerateLimit: integer(row.title_generate_limit, "タイトル生成上限"),
    articleRewriteUsed: integer(row.article_rewrite_used, "リライト利用回数"),
    articleRewriteLimit: integer(row.article_rewrite_limit, "リライト上限"),
    snsGenerateUsed: integer(row.sns_generate_used, "SNS生成利用回数"),
    snsGenerateLimit: integer(row.sns_generate_limit, "SNS生成上限"),
    imageGenerateUsed: integer(row.image_generate_used, "画像生成利用回数"),
    imageGenerateLimit: integer(row.image_generate_limit, "画像生成上限"),
    aiAssistUsed: integer(row.ai_assist_used, "AI補助利用回数"),
    aiAssistLimit: integer(row.ai_assist_limit, "AI補助上限"),
    resetTimezone: text(row.reset_timezone, "リセットタイムゾーン"),
    resetHour: integer(row.reset_hour, "リセット時刻"),
    bypassLimits: bool(row.bypass_limits),
  };
}

function notifyFreeTrialUsageChanged(result: TrialUsageResult): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FREE_TRIAL_USAGE_CHANGED_EVENT, { detail: result }));
}

export async function ensureMyFreeTrial(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("ensure_my_free_trial");
  if (error) throw rpcError(error, "無料トライアルの開始条件を確認できませんでした。");
  return data === true;
}

export async function getMyFreeTrialStatus(client: SupabaseClient): Promise<FreeTrialStatus> {
  const { data, error } = await client.rpc("get_my_free_trial_status");
  if (error) throw rpcError(error, "無料トライアル状態を取得できませんでした。");
  return parseStatus(data);
}

export async function consumeFreeTrialUsage(client: SupabaseClient, feature: TrialFeature): Promise<TrialUsageResult> {
  const { data, error } = await client.rpc("consume_free_trial_usage", { p_feature: feature });
  if (error) throw rpcError(error, "無料トライアルの利用回数を確認できませんでした。");
  const row = firstRow(data, "利用回数");
  const result: TrialUsageResult = {
    allowed: bool(row.allowed),
    bypassLimits: bool(row.bypass_limits),
    reason: text(row.reason, "判定理由"),
    usageDate: nullableText(row.usage_date, "利用日"),
    totalUsed: integer(row.total_used, "総利用回数"),
    dailyTotalLimit: integer(row.daily_total_limit, "1日総上限"),
    featureUsed: integer(row.feature_used, "機能利用回数"),
    featureLimit: integer(row.feature_limit, "機能上限"),
    remaining: integer(row.remaining, "残り回数"),
  };
  notifyFreeTrialUsageChanged(result);
  return result;
}

export function trialUsageMessage(result: TrialUsageResult): string {
  if (result.allowed) return result.bypassLimits ? "有料・管理者利用のため回数制限はありません。" : `本日の残り利用回数は最大 ${result.remaining} 回です。`;
  if (result.reason === "daily_limit") return "本日の無料トライアル利用回数に達しました。リセット後に再度利用するか、料金プランをご確認ください。";
  if (result.reason === "feature_limit") return "この機能の本日の無料利用回数に達しました。リセット後に再度利用してください。";
  if (result.reason === "trial_expired") return "無料トライアル期間が終了しました。料金プランをご確認ください。";
  if (result.reason === "trial_stopped") return "無料トライアルは停止中です。";
  if (result.reason === "trial_disabled") return "無料トライアルは現在利用できません。";
  return "このアカウントでは無料トライアルを利用できません。";
}

export async function getAdminFreeTrialSettings(client: SupabaseClient): Promise<FreeTrialSettings> {
  const { data, error } = await client.rpc("admin_get_free_trial_settings");
  if (error) throw rpcError(error, "無料トライアル設定を取得できませんでした。");
  return parseSettings(data);
}

export async function updateAdminFreeTrialSettings(client: SupabaseClient, settings: FreeTrialSettings): Promise<void> {
  const { error } = await client.rpc("admin_update_free_trial_settings", {
    p_enabled: settings.enabled,
    p_duration_days: settings.durationDays,
    p_daily_total_limit: settings.dailyTotalLimit,
    p_article_generate_limit: settings.articleGenerateLimit,
    p_title_generate_limit: settings.titleGenerateLimit,
    p_article_rewrite_limit: settings.articleRewriteLimit,
    p_sns_generate_limit: settings.snsGenerateLimit,
    p_image_generate_limit: settings.imageGenerateLimit,
    p_ai_assist_limit: settings.aiAssistLimit,
    p_reset_timezone: settings.resetTimezone,
    p_reset_hour: settings.resetHour,
    p_auto_start_on_activation: settings.autoStartOnActivation,
    p_new_users_only: settings.newUsersOnly,
    p_eligible_from: settings.eligibleFrom,
    p_apply_duration_changes_to_active: settings.applyDurationChangesToActive,
  });
  if (error) throw rpcError(error, "無料トライアル設定を保存できませんでした。");
}

export async function getAdminUserFreeTrial(client: SupabaseClient, userId: string): Promise<AdminUserFreeTrial> {
  const { data, error } = await client.rpc("admin_get_user_free_trial", { p_target_user_id: userId });
  if (error) throw rpcError(error, "ユーザーの無料トライアル状態を取得できませんでした。");
  const row = firstRow(data, "ユーザートライアル");
  return {
    hasTrial: bool(row.has_trial),
    trialStatus: text(row.trial_status, "状態"),
    source: nullableText(row.source, "開始方法"),
    startedAt: nullableText(row.started_at, "開始日時"),
    endsAt: nullableText(row.ends_at, "終了日時"),
    usageDate: text(row.usage_date, "利用日"),
    totalUsed: integer(row.total_used, "総利用回数"),
    dailyTotalLimit: integer(row.daily_total_limit, "1日総上限"),
    articleGenerateUsed: integer(row.article_generate_used, "記事生成利用回数"),
    articleGenerateLimit: integer(row.article_generate_limit, "記事生成上限"),
    titleGenerateUsed: integer(row.title_generate_used, "タイトル生成利用回数"),
    titleGenerateLimit: integer(row.title_generate_limit, "タイトル生成上限"),
    articleRewriteUsed: integer(row.article_rewrite_used, "リライト利用回数"),
    articleRewriteLimit: integer(row.article_rewrite_limit, "リライト上限"),
    snsGenerateUsed: integer(row.sns_generate_used, "SNS生成利用回数"),
    snsGenerateLimit: integer(row.sns_generate_limit, "SNS生成上限"),
    imageGenerateUsed: integer(row.image_generate_used, "画像生成利用回数"),
    imageGenerateLimit: integer(row.image_generate_limit, "画像生成上限"),
    aiAssistUsed: integer(row.ai_assist_used, "AI補助利用回数"),
    aiAssistLimit: integer(row.ai_assist_limit, "AI補助上限"),
  };
}

export async function startAdminUserFreeTrial(client: SupabaseClient, userId: string, durationDays?: number): Promise<void> {
  const { error } = await client.rpc("admin_start_user_free_trial", {
    p_target_user_id: userId,
    p_duration_days: durationDays ?? null,
  });
  if (error) throw rpcError(error, "無料トライアルを開始できませんでした。");
}

export async function updateAdminUserFreeTrial(client: SupabaseClient, userId: string, status: "active" | "stopped", endsAt: string): Promise<void> {
  const { error } = await client.rpc("admin_update_user_free_trial", {
    p_target_user_id: userId,
    p_status: status,
    p_ends_at: endsAt,
  });
  if (error) throw rpcError(error, "無料トライアルを更新できませんでした。");
}

export async function resetAdminUserFreeTrialUsage(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.rpc("admin_reset_user_free_trial_usage", { p_target_user_id: userId });
  if (error) throw rpcError(error, "本日の無料トライアル利用回数をリセットできませんでした。");
}
