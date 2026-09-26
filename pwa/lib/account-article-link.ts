import type { ArticleCreationDraft } from "@/lib/phase11-create";
import { subgenreOptionsFor } from "@/lib/phase18-content-options";
import {
  accountDesignLabels,
  type PlatformAccountDesign,
} from "@/lib/platform-account-design";

const GENRE_MAP: Record<PlatformAccountDesign["genrePreset"], string> = {
  ai: "AI・テクノロジー",
  sidejob: "お金・副業",
  business: "ビジネス・経営",
  lifestyle: "生活・暮らし",
  gadget: "ガジェット",
  learning: "学習・自己成長",
  parenting: "子育て・教育",
  health_beauty: "健康・フィットネス",
  money: "お金・副業",
  creative: "趣味・エンタメ",
  entertainment: "趣味・エンタメ",
  other: "その他",
};

const AGE_MAP: Partial<Record<PlatformAccountDesign["audiencePreset"], string>> = {
  student: "学生",
  employee: "社会人",
  business_owner: "社会人",
  senior: "シニア層",
  broad: "全年代",
};

export type AccountDesignArticleApplyResult = {
  draft: ArticleCreationDraft;
  summary: string[];
};

export function applyAccountDesignToArticleDraft(
  current: ArticleCreationDraft,
  design: PlatformAccountDesign,
): AccountDesignArticleApplyResult {
  const labels = accountDesignLabels(design);
  const genre = design.genrePreset === "other" && design.customGenre.trim()
    ? design.customGenre.trim().slice(0, 120)
    : GENRE_MAP[design.genrePreset];
  const allowedSubgenres = subgenreOptionsFor(genre);
  const subgenre = allowedSubgenres.includes(current.subgenre)
    ? current.subgenre
    : allowedSubgenres[0] ?? "AIおまかせ";
  const topic = design.mainTopics.find((item) => item.trim())?.trim() ?? "";
  const theme = current.theme.trim() || topic;
  const tags = [...new Set([...current.tags, ...design.mainTopics.map((item) => item.trim()).filter(Boolean)])].slice(0, 50);
  const ageGroup = AGE_MAP[design.audiencePreset] ?? current.ageGroup;

  const summary = [
    `ジャンル: ${genre}`,
    `想定読者: ${labels.audience}`,
    `発信トーン: ${labels.tone}`,
  ];
  if (theme) summary.push(`テーマ: ${theme}`);
  if (tags.length) summary.push(`主なテーマ/タグ: ${tags.slice(0, 5).join(" / ")}`);

  return {
    draft: {
      ...current,
      publicationTarget: design.platform,
      genre,
      subgenre,
      ageGroup,
      theme,
      tags,
    },
    summary,
  };
}
