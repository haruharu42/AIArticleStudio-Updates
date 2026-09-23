import type { SupabaseClient } from "@supabase/supabase-js";

export type MembershipSettings = {
  displayName: string;
  noteMembershipUrl: string;
  guidance: string;
  updatedAt: string | null;
};

export type MembershipPlan = {
  planCode: string;
  displayName: string;
  tierRank: number;
  badgeLabel: string;
  status: string;
};

export type MembershipFeature = {
  featureKey: string;
  displayName: string;
  description: string;
  status: string;
  sortOrder: number;
};

export type MembershipPlanFeature = {
  planCode: string;
  featureKey: string;
  enabled: boolean;
  updatedAt: string | null;
};

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("メンバーシップ管理APIの応答形式が不正です。");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("メンバーシップ管理APIの応答形式が不正です。");
    }
    return item as Record<string, unknown>;
  });
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field}の形式が不正です。`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : text(value, field);
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${field}の形式が不正です。`);
  }
  return value;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field}の形式が不正です。`);
  return value;
}

function adminError(error: unknown, fallback: string): Error {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof source.message === "string" ? source.message.toLowerCase() : "";
  if (message.includes("active admin required")) {
    return new Error("active管理者として確認できません。再ログインしてからお試しください。");
  }
  if (message.includes("invalid note membership url")) {
    return new Error("noteメンバーシップURLは https://note.com/ で始まるURLを入力してください。");
  }
  if (message.includes("membership plan not found")) {
    return new Error("指定したメンバーシッププランが見つかりません。");
  }
  if (message.includes("membership feature not found")) {
    return new Error("指定した特典機能が見つかりません。");
  }
  return new Error(fallback);
}

export async function getMembershipSettings(client: SupabaseClient): Promise<MembershipSettings> {
  const { data, error } = await client.rpc("admin_get_creator_membership_settings");
  if (error) throw adminError(error, "メンバーシップ設定を取得できませんでした。");
  const row = rows(data)[0];
  if (!row) throw new Error("メンバーシップ設定が見つかりません。");
  return {
    displayName: text(row.display_name, "display_name"),
    noteMembershipUrl: nullableText(row.note_membership_url, "note_membership_url") ?? "",
    guidance: text(row.guidance, "guidance"),
    updatedAt: nullableText(row.updated_at, "updated_at"),
  };
}

export async function updateMembershipSettings(
  client: SupabaseClient,
  input: { displayName: string; noteMembershipUrl: string; guidance: string },
): Promise<void> {
  const { error } = await client.rpc("admin_update_creator_membership_settings", {
    p_display_name: input.displayName.trim(),
    p_note_membership_url: input.noteMembershipUrl.trim() || null,
    p_guidance: input.guidance.trim(),
  });
  if (error) throw adminError(error, "メンバーシップ設定を保存できませんでした。");
}

export async function listMembershipPlans(client: SupabaseClient): Promise<MembershipPlan[]> {
  const { data, error } = await client.rpc("admin_list_creator_membership_plans");
  if (error) throw adminError(error, "メンバーシッププランを取得できませんでした。");
  return rows(data).map((row) => ({
    planCode: text(row.plan_code, "plan_code"),
    displayName: text(row.display_name, "display_name"),
    tierRank: integer(row.tier_rank, "tier_rank"),
    badgeLabel: text(row.badge_label, "badge_label"),
    status: text(row.status, "status"),
  }));
}

export async function listMembershipFeatures(client: SupabaseClient): Promise<MembershipFeature[]> {
  const { data, error } = await client.rpc("admin_list_creator_membership_features");
  if (error) throw adminError(error, "メンバー特典機能を取得できませんでした。");
  return rows(data).map((row) => ({
    featureKey: text(row.feature_key, "feature_key"),
    displayName: text(row.display_name, "display_name"),
    description: text(row.description, "description"),
    status: text(row.status, "status"),
    sortOrder: integer(row.sort_order, "sort_order"),
  }));
}

export async function listMembershipPlanFeatures(client: SupabaseClient): Promise<MembershipPlanFeature[]> {
  const { data, error } = await client.rpc("admin_list_creator_membership_plan_features");
  if (error) throw adminError(error, "プラン別特典設定を取得できませんでした。");
  return rows(data).map((row) => ({
    planCode: text(row.plan_code, "plan_code"),
    featureKey: text(row.feature_key, "feature_key"),
    enabled: booleanValue(row.enabled, "enabled"),
    updatedAt: nullableText(row.updated_at, "updated_at"),
  }));
}

export async function setMembershipPlanFeature(
  client: SupabaseClient,
  input: { planCode: string; featureKey: string; enabled: boolean },
): Promise<void> {
  const { error } = await client.rpc("admin_set_creator_membership_plan_feature", {
    p_plan_code: input.planCode,
    p_feature_key: input.featureKey,
    p_enabled: input.enabled,
  });
  if (error) throw adminError(error, "プランの特典機能を更新できませんでした。");
}

export async function hasCreatorMembershipFeature(
  client: SupabaseClient,
  featureKey: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("has_creator_membership_feature", {
    p_feature_key: featureKey,
  });
  if (error) return false;
  return data === true;
}
