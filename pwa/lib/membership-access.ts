import type { SupabaseClient } from "@supabase/supabase-js";

export type CreatorMembershipPublicSettings = {
  displayName: string;
  noteMembershipUrl: string;
  guidance: string;
};

export type CreatorMembershipFeatureRow = {
  planCode: string;
  planName: string;
  tierRank: number;
  featureKey: string;
  featureName: string;
  featureDescription: string;
  enabled: boolean;
};

function row(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || !value.length) return null;
  const first = value[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? first as Record<string, unknown>
    : null;
}

export async function getCreatorMembershipPublicSettings(
  client: SupabaseClient,
): Promise<CreatorMembershipPublicSettings | null> {
  const { data, error } = await client.rpc("get_creator_membership_public_settings");
  if (error) return null;
  const item = row(data);
  if (!item) return null;
  return {
    displayName: typeof item.display_name === "string" ? item.display_name : "noteメンバーシップ",
    noteMembershipUrl: typeof item.note_membership_url === "string" ? item.note_membership_url : "",
    guidance: typeof item.guidance === "string" ? item.guidance : "",
  };
}

export async function hasCreatorMembershipFeature(
  client: SupabaseClient,
  featureKey: string,
): Promise<boolean> {
  const normalized = featureKey.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(normalized)) return false;
  const { data, error } = await client.rpc("has_creator_membership_feature", {
    p_feature_key: normalized,
  });
  if (error) return false;
  return data === true;
}


export async function listCreatorMembershipFeatureMatrix(
  client: SupabaseClient,
): Promise<CreatorMembershipFeatureRow[]> {
  const { data, error } = await client.rpc("list_creator_membership_feature_matrix");
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const tierRank = typeof item.tier_rank === "number" ? item.tier_rank : Number(item.tier_rank ?? 0);
    if (
      typeof item.plan_code !== "string"
      || typeof item.plan_name !== "string"
      || !Number.isFinite(tierRank)
      || typeof item.feature_key !== "string"
      || typeof item.feature_name !== "string"
      || typeof item.feature_description !== "string"
      || typeof item.enabled !== "boolean"
    ) return [];
    return [{
      planCode: item.plan_code,
      planName: item.plan_name,
      tierRank,
      featureKey: item.feature_key,
      featureName: item.feature_name,
      featureDescription: item.feature_description,
      enabled: item.enabled,
    }];
  });
}
