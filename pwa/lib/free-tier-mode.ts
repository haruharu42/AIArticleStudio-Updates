import type { SupabaseClient } from "@supabase/supabase-js";

import type { FreeTrialSettings } from "@/lib/free-trial";

export async function getAdminPermanentDailyFreeEnabled(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("admin_get_permanent_daily_free_enabled");
  if (error) throw new Error("期限なし日次無料枠の設定を取得できませんでした。");
  return data === true;
}

export async function updateAdminFreeTierSettings(
  client: SupabaseClient,
  settings: FreeTrialSettings,
  permanentDailyFreeEnabled: boolean,
): Promise<void> {
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
    p_permanent_daily_free_enabled: permanentDailyFreeEnabled,
  });
  if (error) throw new Error("無料プラン設定を保存できませんでした。");
}
