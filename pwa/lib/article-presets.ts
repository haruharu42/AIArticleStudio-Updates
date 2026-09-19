import type { SupabaseClient } from "@supabase/supabase-js";

import type { ArticleCreationDraft } from "@/lib/phase11-create";

export type ArticlePreset = {
  id: string;
  userId: string;
  name: string;
  publicationTarget: ArticleCreationDraft["publicationTarget"];
  articleType: ArticleCreationDraft["articleType"];
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
  targetLength: number;
  price: number | null;
  affiliateEnabled: boolean;
  generationMode: ArticleCreationDraft["generationMode"];
  coverEnabled: boolean;
  inlineEnabled: boolean;
  inlineCount: number;
  tags: string[];
  isDefault: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  updatedAt: string | null;
};

export type ArticlePresetDraft = Omit<
  ArticlePreset,
  "id" | "userId" | "usageCount" | "lastUsedAt" | "updatedAt"
>;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function parsePreset(row: Record<string, unknown>): ArticlePreset | null {
  const publicationTarget = row.publication_target;
  const articleType = row.article_type;
  const generationMode = row.generation_mode;
  if (
    typeof row.id !== "string"
    || typeof row.user_id !== "string"
    || typeof row.name !== "string"
    || !["note", "tips", "brain", "blog"].includes(String(publicationTarget))
    || !["free", "paid"].includes(String(articleType))
    || !["prompt_export", "manual"].includes(String(generationMode))
    || typeof row.genre !== "string"
    || typeof row.subgenre !== "string"
    || typeof row.age_group !== "string"
    || typeof row.gender !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    publicationTarget: publicationTarget as ArticlePreset["publicationTarget"],
    articleType: articleType as ArticlePreset["articleType"],
    genre: row.genre,
    subgenre: row.subgenre,
    ageGroup: row.age_group,
    gender: row.gender,
    targetLength: typeof row.target_length === "number" ? row.target_length : Number(row.target_length ?? 5000),
    price: row.price === null || row.price === undefined
      ? null
      : typeof row.price === "number"
        ? row.price
        : Number(row.price),
    affiliateEnabled: row.affiliate_enabled === true,
    generationMode: generationMode as ArticlePreset["generationMode"],
    coverEnabled: row.cover_enabled !== false,
    inlineEnabled: row.inline_enabled === true,
    inlineCount: typeof row.inline_count === "number" ? row.inline_count : Number(row.inline_count ?? 2),
    tags: asStringArray(row.tags),
    isDefault: row.is_default === true,
    usageCount: typeof row.usage_count === "number" ? row.usage_count : Number(row.usage_count ?? 0),
    lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export function articlePresetFromDraft(
  name: string,
  draft: ArticleCreationDraft,
  tags: string[],
  isDefault = false,
): ArticlePresetDraft {
  return {
    name: name.trim().slice(0, 60),
    publicationTarget: draft.publicationTarget,
    articleType: draft.articleType,
    genre: draft.genre.trim().slice(0, 120),
    subgenre: draft.subgenre.trim().slice(0, 120),
    ageGroup: draft.ageGroup.trim().slice(0, 60),
    gender: draft.gender.trim().slice(0, 60),
    targetLength: draft.targetLength,
    price: draft.articleType === "paid" ? draft.price : null,
    affiliateEnabled: draft.affiliateEnabled,
    generationMode: draft.generationMode,
    coverEnabled: draft.coverEnabled,
    inlineEnabled: draft.inlineEnabled,
    inlineCount: draft.inlineCount,
    tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 50),
    isDefault,
  };
}

export function applyArticlePreset(
  draft: ArticleCreationDraft,
  preset: ArticlePreset,
): ArticleCreationDraft {
  return {
    ...draft,
    publicationTarget: preset.publicationTarget,
    articleType: preset.articleType,
    genre: preset.genre,
    subgenre: preset.subgenre,
    ageGroup: preset.ageGroup,
    gender: preset.gender,
    targetLength: preset.targetLength,
    price: preset.articleType === "paid" ? preset.price : null,
    affiliateEnabled: preset.affiliateEnabled,
    generationMode: preset.generationMode,
    coverEnabled: preset.coverEnabled,
    inlineEnabled: preset.inlineEnabled,
    inlineCount: preset.inlineCount,
    tags: [...preset.tags],
  };
}

export async function loadArticlePresets(
  client: SupabaseClient,
  userId: string,
): Promise<ArticlePreset[]> {
  const { data, error } = await client
    .from("article_presets")
    .select("id,user_id,name,publication_target,article_type,genre,subgenre,age_group,gender,target_length,price,affiliate_enabled,generation_mode,cover_enabled,inline_enabled,inline_count,tags,is_default,usage_count,last_used_at,updated_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("usage_count", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) throw new Error("記事プリセットを読み込めませんでした。");
  return (data ?? [])
    .map((row: Record<string, unknown>) => parsePreset(row))
    .filter((preset: ArticlePreset | null): preset is ArticlePreset => Boolean(preset));
}

function presetPayload(userId: string, preset: ArticlePresetDraft) {
  if (!preset.name) throw new Error("プリセット名を入力してください。");
  if (!preset.genre || !preset.subgenre) throw new Error("ジャンルとサブジャンルを設定してください。");
  if (preset.articleType === "paid" && (!preset.price || preset.price < 1)) {
    throw new Error("有料記事プリセットには価格が必要です。");
  }

  return {
    user_id: userId,
    name: preset.name,
    publication_target: preset.publicationTarget,
    article_type: preset.articleType,
    genre: preset.genre,
    subgenre: preset.subgenre,
    age_group: preset.ageGroup,
    gender: preset.gender,
    target_length: preset.targetLength,
    price: preset.articleType === "paid" ? preset.price : null,
    affiliate_enabled: preset.affiliateEnabled,
    generation_mode: preset.generationMode,
    cover_enabled: preset.coverEnabled,
    inline_enabled: preset.inlineEnabled,
    inline_count: preset.inlineCount,
    tags: preset.tags,
    is_default: preset.isDefault,
  };
}

export async function createArticlePreset(
  client: SupabaseClient,
  userId: string,
  preset: ArticlePresetDraft,
): Promise<ArticlePreset> {
  const existing = await loadArticlePresets(client, userId);
  if (existing.length >= 30) throw new Error("記事プリセットは最大30件まで保存できます。");

  const { data, error } = await client
    .from("article_presets")
    .insert(presetPayload(userId, preset))
    .select("id,user_id,name,publication_target,article_type,genre,subgenre,age_group,gender,target_length,price,affiliate_enabled,generation_mode,cover_enabled,inline_enabled,inline_count,tags,is_default,usage_count,last_used_at,updated_at")
    .single();

  if (error || !data) throw new Error("記事プリセットを保存できませんでした。");
  const parsed = parsePreset(data as Record<string, unknown>);
  if (!parsed) throw new Error("保存した記事プリセットを確認できませんでした。");
  return parsed;
}

export async function updateArticlePreset(
  client: SupabaseClient,
  userId: string,
  presetId: string,
  preset: ArticlePresetDraft,
): Promise<ArticlePreset> {
  const { data, error } = await client
    .from("article_presets")
    .update(presetPayload(userId, preset))
    .eq("id", presetId)
    .eq("user_id", userId)
    .select("id,user_id,name,publication_target,article_type,genre,subgenre,age_group,gender,target_length,price,affiliate_enabled,generation_mode,cover_enabled,inline_enabled,inline_count,tags,is_default,usage_count,last_used_at,updated_at")
    .single();

  if (error || !data) throw new Error("記事プリセットを更新できませんでした。");
  const parsed = parsePreset(data as Record<string, unknown>);
  if (!parsed) throw new Error("更新した記事プリセットを確認できませんでした。");
  return parsed;
}

export async function setDefaultArticlePreset(
  client: SupabaseClient,
  userId: string,
  presetId: string,
): Promise<void> {
  const { error } = await client
    .from("article_presets")
    .update({ is_default: true })
    .eq("id", presetId)
    .eq("user_id", userId);
  if (error) throw new Error("既定プリセットを設定できませんでした。");
}

export async function deleteArticlePreset(
  client: SupabaseClient,
  userId: string,
  presetId: string,
): Promise<void> {
  const { error } = await client
    .from("article_presets")
    .delete()
    .eq("id", presetId)
    .eq("user_id", userId);
  if (error) throw new Error("記事プリセットを削除できませんでした。");
}
