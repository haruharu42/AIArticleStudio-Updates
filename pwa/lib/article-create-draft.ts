import type { ArticleCreationDraft } from "@/lib/phase11-create";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  TARGET_LENGTH_OPTIONS,
  subgenreOptionsFor,
} from "@/lib/phase18-content-options";

export const ARTICLE_CREATE_STEPS = [
  "生成方法",
  "画像計画",
  "本文条件",
  "タイトル",
  "本文生成",
  "プレビュー",
  "保存",
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

  const publicationTarget = params.get("publicationTarget");
  if (publicationTarget === "note" || publicationTarget === "tips" || publicationTarget === "brain" || publicationTarget === "blog") {
    next.publicationTarget = publicationTarget;
  }

  const articleType = params.get("articleType");
  if (articleType === "free" || articleType === "paid") {
    next.articleType = articleType;
    next.price = articleType === "paid" ? 1 : null;
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
  return new URLSearchParams(window.location.search).get("from") === "home-quick-setup"
    ? "ホームで選んだ基本設定を引き継ぎました。順番に確認しながら進めてください。"
    : "";
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
  return null;
}
