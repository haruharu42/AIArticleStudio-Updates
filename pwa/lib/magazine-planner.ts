import type { ArticleCreationDraft } from "@/lib/phase11-create";

export type MagazineArticleCount = 3 | 5 | 7 | 10;
export type MagazineDirection =
  | "beginner_roadmap"
  | "step_by_step"
  | "practical_series"
  | "comparison"
  | "deep_dive";
export type MagazinePublishingStyle = "gentle" | "practical" | "concise" | "professional";
export type MagazineMonetizationLevel = "intro" | "balanced" | "sales";
export type MagazineOrderStrategy = "foundation" | "problem_solution" | "quick_win" | "free_to_paid";
export type MagazineAudience =
  | "auto"
  | "beginner"
  | "employee"
  | "homemaker"
  | "student"
  | "self_employed"
  | "senior";

export type MagazinePlanDraft = {
  audience: MagazineAudience;
  articleCount: MagazineArticleCount;
  direction: MagazineDirection;
  publishingStyle: MagazinePublishingStyle;
  monetizationLevel: MagazineMonetizationLevel;
  orderStrategy: MagazineOrderStrategy;
  purpose: string;
  selectedSuggestion: number;
  name: string;
  articleTitles: string[];
};

export type MagazineSuggestion = {
  id: number;
  name: string;
  description: string;
  articleTitles: string[];
};

export const MAGAZINE_AUDIENCE_OPTIONS = [
  { value: "auto", label: "AIおまかせ" },
  { value: "beginner", label: "初心者" },
  { value: "employee", label: "会社員・副業初心者" },
  { value: "homemaker", label: "主婦・主夫" },
  { value: "student", label: "学生" },
  { value: "self_employed", label: "個人事業主・フリーランス" },
  { value: "senior", label: "シニア・学び直し" },
] as const;

export const MAGAZINE_DIRECTION_OPTIONS = [
  { value: "beginner_roadmap", label: "初心者向けロードマップ" },
  { value: "step_by_step", label: "段階的な入門シリーズ" },
  { value: "practical_series", label: "実践・手順中心" },
  { value: "comparison", label: "比較・選び方中心" },
  { value: "deep_dive", label: "テーマ深掘り" },
] as const;

export const MAGAZINE_STYLE_OPTIONS = [
  { value: "gentle", label: "やさしく丁寧" },
  { value: "practical", label: "実践的・具体的" },
  { value: "concise", label: "短く分かりやすく" },
  { value: "professional", label: "専門的・落ち着いた文体" },
] as const;

export const MAGAZINE_MONETIZATION_OPTIONS = [
  { value: "intro", label: "入門（信頼形成を優先）" },
  { value: "balanced", label: "標準（無料・有料の導線を両立）" },
  { value: "sales", label: "販売導線重視" },
] as const;

export const MAGAZINE_ORDER_OPTIONS = [
  { value: "foundation", label: "基礎から順番に" },
  { value: "problem_solution", label: "悩み → 解決の順番" },
  { value: "quick_win", label: "すぐ試せる内容から" },
  { value: "free_to_paid", label: "無料導入 → 有料深掘り" },
] as const;

export const MAGAZINE_ARTICLE_COUNT_OPTIONS: readonly MagazineArticleCount[] = [3, 5, 7, 10];

export const DEFAULT_MAGAZINE_PLAN: MagazinePlanDraft = {
  audience: "beginner",
  articleCount: 5,
  direction: "beginner_roadmap",
  publishingStyle: "gentle",
  monetizationLevel: "intro",
  orderStrategy: "foundation",
  purpose: "",
  selectedSuggestion: 0,
  name: "",
  articleTitles: [],
};

function labelFor<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function magazineAudienceLabel(value: MagazineAudience): string {
  return labelFor(MAGAZINE_AUDIENCE_OPTIONS, value);
}

export function magazineDirectionLabel(value: MagazineDirection): string {
  return labelFor(MAGAZINE_DIRECTION_OPTIONS, value);
}

export function magazinePublishingStyleLabel(value: MagazinePublishingStyle): string {
  return labelFor(MAGAZINE_STYLE_OPTIONS, value);
}

export function magazineMonetizationLabel(value: MagazineMonetizationLevel): string {
  return labelFor(MAGAZINE_MONETIZATION_OPTIONS, value);
}

export function magazineOrderLabel(value: MagazineOrderStrategy): string {
  return labelFor(MAGAZINE_ORDER_OPTIONS, value);
}

function cleanTheme(draft: Pick<ArticleCreationDraft, "theme" | "genre" | "subgenre">): string {
  return draft.theme.trim() || draft.subgenre.trim() || draft.genre.trim() || "テーマ";
}

function audiencePhrase(plan: MagazinePlanDraft, draft: Pick<ArticleCreationDraft, "ageGroup">): string {
  if (plan.audience === "auto") return draft.ageGroup && draft.ageGroup !== "AIおまかせ" ? `${draft.ageGroup}の読者` : "初心者";
  return magazineAudienceLabel(plan.audience);
}

function baseTitles(theme: string, audience: string): string[] {
  return [
    `${theme}とは？${audience}が最初に知っておきたい基本`,
    `${theme}を始める前に整えたい準備と考え方`,
    `${theme}を実際に進めるための手順とコツ`,
    `${theme}で迷いやすいポイントと失敗を減らす判断基準`,
    `${theme}を続けるための振り返り・改善チェックリスト`,
    `${theme}の選択肢を比較するときの見方`,
    `${theme}を一段深く活用する実践アイデア`,
    `${theme}を継続するときに確認したい運用ルール`,
    `${theme}のよくある疑問をまとめて解消`,
    `${theme}の次の一歩を決めるロードマップ`,
  ];
}

function orderedTitles(theme: string, audience: string, plan: MagazinePlanDraft): string[] {
  const base = baseTitles(theme, audience);
  if (plan.orderStrategy === "problem_solution") {
    return [
      `${theme}で${audience}がつまずきやすい3つのポイント`,
      `${theme}の悩みを整理するためのチェックリスト`,
      `${theme}の基本から解決手順までを順番に解説`,
      ...base.slice(3),
    ];
  }
  if (plan.orderStrategy === "quick_win") {
    return [
      `今日から試せる${theme}の小さな一歩`,
      `${theme}で最初に設定しておきたいこと`,
      `${theme}を無理なく続けるための基本`,
      ...base.slice(3),
    ];
  }
  if (plan.orderStrategy === "free_to_paid") {
    return [
      `${theme}入門｜まず知っておきたい全体像`,
      `${theme}を始めるための無料チェックリスト`,
      `${theme}の実践手順｜ここから深く取り組む`,
      ...base.slice(3),
    ];
  }
  return base;
}

function directionSuffix(plan: MagazinePlanDraft): string {
  if (plan.direction === "step_by_step") return "ステップ講座";
  if (plan.direction === "practical_series") return "実践シリーズ";
  if (plan.direction === "comparison") return "選び方ガイド";
  if (plan.direction === "deep_dive") return "深掘りノート";
  return "ロードマップ";
}

export function suggestMagazinePlans(
  draft: Pick<ArticleCreationDraft, "theme" | "genre" | "subgenre" | "ageGroup">,
  plan: MagazinePlanDraft,
): MagazineSuggestion[] {
  const theme = cleanTheme(draft);
  const audience = audiencePhrase(plan, draft);
  const titles = orderedTitles(theme, audience, plan).slice(0, plan.articleCount);
  const suffix = directionSuffix(plan);
  const genre = draft.genre.trim() || "テーマ";

  return [
    {
      id: 0,
      name: `ゼロから始める${theme}｜${suffix}`,
      description: `${audience}が、${theme}を基礎から順番に進められる${plan.articleCount}記事構成です。`,
      articleTitles: titles,
    },
    {
      id: 1,
      name: `${genre}のための${theme}実践ガイド`,
      description: `知識だけで終わらず、実際に行動へ移せる流れを重視した${plan.articleCount}記事構成です。`,
      articleTitles: [...titles.slice(1), titles[0]].slice(0, plan.articleCount),
    },
    {
      id: 2,
      name: `${audience}向け ${theme}やさしい入門`,
      description: `専門用語を抑え、読み進める順番が分かりやすい${plan.articleCount}記事構成です。`,
      articleTitles: titles.map((title, index) => index === 0 ? `${theme}入門｜${audience}向けに基本から解説` : title),
    },
  ];
}

export function applyMagazineSuggestion(
  plan: MagazinePlanDraft,
  suggestion: MagazineSuggestion,
): MagazinePlanDraft {
  return {
    ...plan,
    selectedSuggestion: suggestion.id,
    name: suggestion.name,
    articleTitles: [...suggestion.articleTitles],
  };
}

export function magazinePlanMatchesCurrentInputs(
  draft: Pick<ArticleCreationDraft, "theme" | "genre" | "subgenre" | "ageGroup">,
  plan: MagazinePlanDraft,
): boolean {
  const name = plan.name.trim();
  const titles = plan.articleTitles.map((title) => title.trim());
  if (!name || titles.length !== plan.articleCount || titles.some((title) => !title)) return false;

  const selected = suggestMagazinePlans(draft, plan).find(
    (suggestion) => suggestion.id === plan.selectedSuggestion,
  );
  if (!selected || selected.name !== name || selected.articleTitles.length !== titles.length) {
    return false;
  }
  return selected.articleTitles.every((title, index) => title === titles[index]);
}

function isOneOf<T extends string>(value: unknown, options: readonly { value: T }[]): value is T {
  return typeof value === "string" && options.some((option) => option.value === value);
}

export function parseMagazinePlanDraft(value: unknown): MagazinePlanDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !isOneOf(row.audience, MAGAZINE_AUDIENCE_OPTIONS)
    || !MAGAZINE_ARTICLE_COUNT_OPTIONS.includes(row.articleCount as MagazineArticleCount)
    || !isOneOf(row.direction, MAGAZINE_DIRECTION_OPTIONS)
    || !isOneOf(row.publishingStyle, MAGAZINE_STYLE_OPTIONS)
    || !isOneOf(row.monetizationLevel, MAGAZINE_MONETIZATION_OPTIONS)
    || !isOneOf(row.orderStrategy, MAGAZINE_ORDER_OPTIONS)
    || typeof row.purpose !== "string"
    || typeof row.selectedSuggestion !== "number"
    || !Number.isInteger(row.selectedSuggestion)
    || row.selectedSuggestion < 0
    || row.selectedSuggestion > 2
    || typeof row.name !== "string"
    || !Array.isArray(row.articleTitles)
    || row.articleTitles.some((title) => typeof title !== "string")
  ) return null;

  const articleCount = row.articleCount as MagazineArticleCount;
  const name = row.name.slice(0, 200).trim();
  const articleTitles = (row.articleTitles as string[])
    .slice(0, 10)
    .map((title) => title.slice(0, 500).trim());

  if (name) {
    if (articleTitles.length !== articleCount || articleTitles.some((title) => !title)) return null;
  } else if (articleTitles.length > 0) {
    return null;
  }

  return {
    audience: row.audience,
    articleCount,
    direction: row.direction,
    publishingStyle: row.publishingStyle,
    monetizationLevel: row.monetizationLevel,
    orderStrategy: row.orderStrategy,
    purpose: row.purpose.slice(0, 500),
    selectedSuggestion: row.selectedSuggestion,
    name,
    articleTitles,
  };
}
