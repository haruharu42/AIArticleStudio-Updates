import type { ArticleCreationDraft } from "@/lib/phase11-create";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  TARGET_LENGTH_OPTIONS,
  isImageStyleValue,
  subgenreOptionsFor,
} from "@/lib/phase18-content-options";

export const ARTICLE_CREATE_STEPS = [
  "記事の種類",
  "画像設定",
  "記事条件",
  "タイトル",
  "本文",
  "内容確認",
  "保存・タグ",
] as const;

export const DEFAULT_ARTICLE_DRAFT: ArticleCreationDraft = {
  generationMode: "prompt_export",
  theme: "",
  title: "",
  publicationTarget: "note",
  articleType: "free",
  genre: "AI副業",
  subgenre: "AIおまかせ",
  ageGroup: "30代",
  gender: "AIおまかせ",
  targetLength: 5000,
  price: null,
  affiliateEnabled: false,
  magazineEnabled: false,
  tags: [],
  coverEnabled: true,
  inlineEnabled: false,
  inlineCount: 2,
  imageStyle: "auto",
  body: "",
  saveStatus: "writing",
};

export function createInitialArticleDraft(
  params?: URLSearchParams | null,
): ArticleCreationDraft {
  const next: ArticleCreationDraft = {
    ...DEFAULT_ARTICLE_DRAFT,
    tags: [...DEFAULT_ARTICLE_DRAFT.tags],
  };
  if (!params) return next;

  const theme = params.get("theme");
  if (theme) next.theme = theme.slice(0, 1000);

  const title = params.get("title");
  if (title) next.title = title.slice(0, 500);

  const publicationTarget = params.get("publicationTarget");
  if (publicationTarget === "note" || publicationTarget === "tips" || publicationTarget === "brain" || publicationTarget === "blog") {
    next.publicationTarget = publicationTarget;
  }

  const articleType = params.get("articleType");
  if (articleType === "free" || articleType === "paid") {
    next.articleType = articleType;
    next.price = articleType === "paid" ? 980 : null;
  }

  const genre = params.get("genre");
  if (genre) next.genre = genre.slice(0, 120);

  const subgenre = params.get("subgenre");
  if (subgenre) {
    next.subgenre = subgenre.slice(0, 120);
  } else {
    const allowedSubgenres = subgenreOptionsFor(next.genre);
    if (!allowedSubgenres.includes(next.subgenre)) {
      next.subgenre = allowedSubgenres[0] ?? "AIおまかせ";
    }
  }

  const ageGroup = params.get("ageGroup");
  if (ageGroup && AGE_GROUP_OPTIONS.some((option) => option === ageGroup)) {
    next.ageGroup = ageGroup;
  }

  const gender = params.get("gender");
  if (gender && GENDER_OPTIONS.some((option) => option === gender)) {
    next.gender = gender;
  }

  const targetLength = Number(params.get("targetLength"));
  if (TARGET_LENGTH_OPTIONS.some((option) => option.value === targetLength)) {
    next.targetLength = targetLength;
  }

  const imageStyle = params.get("imageStyle");
  if (imageStyle && isImageStyleValue(imageStyle)) {
    next.imageStyle = imageStyle;
  }

  const inlineCount = Number(params.get("inlineCount"));
  if (Number.isSafeInteger(inlineCount) && inlineCount >= 1 && inlineCount <= 5) {
    next.inlineEnabled = true;
    next.inlineCount = inlineCount;
  } else if (params.get("inlineCount") === "0") {
    next.inlineEnabled = false;
  }

  return next;
}

export function initialDraftFromLocation(): ArticleCreationDraft {
  if (typeof window === "undefined") return createInitialArticleDraft();
  return createInitialArticleDraft(new URLSearchParams(window.location.search));
}

export function initialMessageFromLocation(): string {
  if (typeof window === "undefined") return "";
  const source = new URLSearchParams(window.location.search).get("from");
  if (source === "home-quick-setup") {
    return "ホームで選んだ基本設定を引き継ぎました。順番に確認しながら進めてください。";
  }
  if (source === "series-plan") {
    return "シリーズ計画からタイトル・無料/有料設定を引き継ぎました。アカウント設定も必要に応じて反映します。";
  }
  return "";
}

export function parseArticleTags(tagsText: string): string[] {
  return tagsText
    .split(/[,、\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function withArticleTags(
  draft: ArticleCreationDraft,
  tagsText: string,
): ArticleCreationDraft {
  return { ...draft, tags: parseArticleTags(tagsText) };
}

export function validateArticleCreateStep(
  step: number,
  draft: ArticleCreationDraft,
): string | null {
  if (step === 2 && (!draft.genre.trim() || draft.genre === "その他")) {
    return "「その他」を選んだ場合はジャンル名を入力してください。";
  }
  if (step === 2 && (!draft.subgenre.trim() || draft.subgenre === "その他")) {
    return "「その他」を選んだ場合はサブジャンル名を入力してください。";
  }
  if (step === 4 && draft.articleType === "paid" && draft.body.trim() && !/<!--\s*PAID_AREA\s*-->/i.test(draft.body)) {
    return "有料記事には有料エリア開始位置が必要です。本文に「<!-- PAID_AREA -->」を入れてください。";
  }
  if (step === 4 && draft.inlineEnabled) {
    for (let index = 1; index <= draft.inlineCount; index += 1) {
      const marker = new RegExp(`<!--\\s*IMAGE:0?${index}\\s*-->`, "i");
      if (!marker.test(draft.body)) {
        return `挿絵${index}の差し込み位置が本文にありません。「<!-- IMAGE:${String(index).padStart(2, "0")} -->」を入れてください。`;
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function parseStoredArticleDraft(value: unknown): ArticleCreationDraft | null {
  if (!isRecord(value)) return null;

  const generationMode = value.generationMode;
  const publicationTarget = value.publicationTarget;
  const articleType = value.articleType;
  const saveStatus = value.saveStatus;
  const targetLength = value.targetLength;
  const price = value.price;
  const inlineCount = value.inlineCount;
  const imageStyle = typeof value.imageStyle === "string" && isImageStyleValue(value.imageStyle)
    ? value.imageStyle
    : "auto";

  if (
    (generationMode !== "prompt_export" && generationMode !== "manual")
    || (publicationTarget !== "note" && publicationTarget !== "tips" && publicationTarget !== "brain" && publicationTarget !== "blog")
    || (articleType !== "free" && articleType !== "paid")
    || (saveStatus !== "draft" && saveStatus !== "writing" && saveStatus !== "ready")
    || typeof value.theme !== "string"
    || typeof value.title !== "string"
    || typeof value.genre !== "string"
    || typeof value.subgenre !== "string"
    || typeof value.ageGroup !== "string"
    || typeof value.gender !== "string"
    || !AGE_GROUP_OPTIONS.some((option) => option === value.ageGroup)
    || !GENDER_OPTIONS.some((option) => option === value.gender)
    || typeof targetLength !== "number"
    || !TARGET_LENGTH_OPTIONS.some((option) => option.value === targetLength)
    || (price !== null && (typeof price !== "number" || !Number.isInteger(price) || price <= 0))
    || typeof value.affiliateEnabled !== "boolean"
    || typeof value.magazineEnabled !== "boolean"
    || !isStringArray(value.tags)
    || typeof value.coverEnabled !== "boolean"
    || typeof value.inlineEnabled !== "boolean"
    || typeof inlineCount !== "number"
    || !Number.isInteger(inlineCount)
    || inlineCount < 1
    || inlineCount > 5
    || typeof value.body !== "string"
  ) {
    return null;
  }

  return {
    generationMode,
    theme: value.theme,
    title: value.title,
    publicationTarget,
    articleType,
    genre: value.genre.slice(0, 120),
    subgenre: value.subgenre.slice(0, 120),
    ageGroup: value.ageGroup,
    gender: value.gender,
    targetLength,
    price,
    affiliateEnabled: value.affiliateEnabled,
    magazineEnabled: value.magazineEnabled,
    tags: [...value.tags],
    coverEnabled: value.coverEnabled,
    inlineEnabled: value.inlineEnabled,
    inlineCount,
    imageStyle,
    body: value.body,
    saveStatus,
  };
}
