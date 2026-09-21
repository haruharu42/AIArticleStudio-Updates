import type { ArticleCreationDraft } from "@/lib/phase11-create";
import type { PlatformAccountDesign } from "@/lib/platform-account-design";

import {
  WORKSPACE_PRESETS,
  type WorkspacePresetPreference,
} from "@/features/presets/workspace-presets";

export function applyWorkspacePresetToArticleDraft(
  draft: ArticleCreationDraft,
  preference: WorkspacePresetPreference,
): ArticleCreationDraft {
  if (!preference.applyArticle) return draft;
  const preset = WORKSPACE_PRESETS[preference.presetKey];
  const article = preset.article;
  return {
    ...draft,
    publicationTarget: article.publicationTarget ?? draft.publicationTarget,
    articleType: article.articleType ?? draft.articleType,
    genre: article.genre ?? draft.genre,
    targetLength: article.targetLength ?? draft.targetLength,
    coverEnabled: article.coverEnabled ?? draft.coverEnabled,
    inlineEnabled: article.inlineEnabled ?? draft.inlineEnabled,
    inlineCount: article.inlineCount ?? draft.inlineCount,
    price: article.articleType === "free" ? null : draft.price,
    tags: [...new Set([...draft.tags, ...(article.tags ?? [])])].slice(0, 50),
  };
}

export function workspacePresetImageDefaults(preference: WorkspacePresetPreference | null) {
  if (!preference?.applyImages) return null;
  return WORKSPACE_PRESETS[preference.presetKey].images;
}

export function workspacePresetSocialDefaults(
  preference: WorkspacePresetPreference | null,
  platform: "x" | "instagram" | "threads" | "tiktok" | "youtube",
) {
  if (!preference?.applySns) return null;
  const social = WORKSPACE_PRESETS[preference.presetKey].social;
  return {
    preferredPlatform: social.preferredPlatform ?? null,
    targetCharacters: social.targetCharacters[platform],
  };
}

export function workspacePresetWorkflowDefaults(preference: WorkspacePresetPreference | null) {
  if (!preference?.applyWorkflow) return null;
  return WORKSPACE_PRESETS[preference.presetKey].workflow;
}


export function applyWorkspacePresetToAccountDesign(
  design: PlatformAccountDesign,
  preference: WorkspacePresetPreference,
): PlatformAccountDesign {
  if (!preference.applyAccountDesign) return design;
  const preset = WORKSPACE_PRESETS[preference.presetKey];
  const note = preset.note;
  const topics = [...new Set([
    ...design.mainTopics,
    ...(note.topics ?? preset.article.tags ?? []),
  ])].slice(0, 12);

  return {
    ...design,
    genrePreset: note.genre ? "other" : design.genrePreset,
    customGenre: note.genre ?? design.customGenre,
    accountStylePreset: note.style ? "other" : design.accountStylePreset,
    customAccountStyle: note.style ?? design.customAccountStyle,
    audiencePreset: note.audience ? "other" : design.audiencePreset,
    customAudience: note.audience ?? design.customAudience,
    tonePreset: note.tone ? "other" : design.tonePreset,
    customTone: note.tone ?? design.customTone,
    monetizationPreset: note.monetization ? "other" : design.monetizationPreset,
    customMonetization: note.monetization ?? design.customMonetization,
    goalPreset: note.goal?.includes("読者") ? "growth" : design.goalPreset,
    mainTopics: topics,
  };
}
