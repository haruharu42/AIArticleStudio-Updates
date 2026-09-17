import type { ArticleCreationDraft } from "@/lib/phase11-create";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "aas:pwa:article-wizard-progress:v1:";

export type ArticleWizardProgress = {
  step: number;
  draft: ArticleCreationDraft;
  tagsText: string;
  updatedAt: string;
};

type StoredArticleWizardProgress = ArticleWizardProgress & {
  version: typeof STORAGE_VERSION;
};

function storageKey(ownerId: string): string {
  return `${STORAGE_PREFIX}${ownerId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadArticleWizardProgress(ownerId: string): ArticleWizardProgress | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey(ownerId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)
      || parsed.version !== STORAGE_VERSION
      || !Number.isInteger(parsed.step)
      || (parsed.step as number) < 0
      || (parsed.step as number) > 6
      || !isRecord(parsed.draft)
      || typeof parsed.tagsText !== "string"
      || typeof parsed.updatedAt !== "string") {
      window.localStorage.removeItem(storageKey(ownerId));
      return null;
    }

    return {
      step: parsed.step as number,
      draft: parsed.draft as unknown as ArticleCreationDraft,
      tagsText: parsed.tagsText,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    try {
      window.localStorage.removeItem(storageKey(ownerId));
    } catch {
      // Storage can be unavailable in restricted browser modes.
    }
    return null;
  }
}

export function saveArticleWizardProgress(
  ownerId: string,
  progress: Omit<ArticleWizardProgress, "updatedAt">,
): void {
  if (typeof window === "undefined") return;

  const stored: StoredArticleWizardProgress = {
    version: STORAGE_VERSION,
    ...progress,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey(ownerId), JSON.stringify(stored));
  } catch {
    // Article creation must keep working even if local storage is unavailable.
  }
}

export function clearArticleWizardProgress(ownerId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(ownerId));
  } catch {
    // Ignore storage cleanup failures; the cloud save itself remains authoritative.
  }
}
