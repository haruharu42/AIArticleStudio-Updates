import {
  EMPTY_NOTE_MAGAZINE,
  noteMagazineFromWorkspace,
  type ArticleLibraryItem,
  type ArticleLibrarySort,
  type NoteMagazineRole,
  type NoteMagazineSettings,
  type NoteMagazineType,
} from "@/lib/article-library-v2";
import {
  type ArticleDetail,
  type ArticlePatch,
  type ArticleStatus,
} from "@/lib/phase7-articles";

export type LibraryView = "list" | "detail" | "edit";

export type ArticleLibraryEditValues = {
  title: string;
  publicationTarget: string;
  articleType: "free" | "paid";
  genre: string;
  subgenre: string;
  status: ArticleStatus;
  price: string;
  tags: string;
  body: string;
  sourceBody: string;
  publishBody: string;
  magazineEnabled: boolean;
  magazineName: string;
  magazineType: NoteMagazineType;
  seriesName: string;
  seriesOrder: string;
  magazineRole: NoteMagazineRole;
};

export type LibraryFilters = {
  query: string;
  status: ArticleStatus | "";
  publicationTarget: string;
  articleType: "free" | "paid" | "";
  genre: string;
  subgenre: string;
  magazineName: string;
  sort: ArticleLibrarySort;
};

export const ARTICLE_LIBRARY_PAGE_SIZE = 50;

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: "",
  status: "",
  publicationTarget: "",
  articleType: "",
  genre: "",
  subgenre: "",
  magazineName: "",
  sort: "updated_desc",
};

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: "下書き",
  writing: "執筆中",
  ready: "完成",
  waiting_publish: "公開待ち",
  published: "公開済み",
  on_hold: "保留",
  archived: "アーカイブ",
};

export const MAGAZINE_TYPE_LABELS: Record<NoteMagazineType, string> = {
  free: "無料マガジン",
  paid: "有料マガジン",
  mixed: "無料・有料混在",
};

export const MAGAZINE_ROLE_LABELS: Record<NoteMagazineRole, string> = {
  intro: "導入記事",
  standard: "通常記事",
  summary: "まとめ記事",
  bonus: "特典・補足記事",
};

export function formatArticleLibraryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function isDesktopArticleLibraryUserAgent(userAgent: string): boolean {
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function articleLibraryEditValuesFromDetail(detail: ArticleDetail): ArticleLibraryEditValues {
  const magazine = noteMagazineFromWorkspace(detail.workspace.workspaceJson);
  return {
    title: detail.title,
    publicationTarget: detail.publicationTarget,
    articleType: detail.articleType,
    genre: detail.genre ?? "",
    subgenre: detail.subgenre ?? "",
    status: detail.status,
    price: detail.price === null ? "" : String(detail.price),
    tags: detail.tags.join(", "),
    body: detail.body,
    sourceBody: detail.workspace.sourceBody ?? "",
    publishBody: detail.workspace.publishBody ?? "",
    magazineEnabled: magazine.enabled,
    magazineName: magazine.name,
    magazineType: magazine.type,
    seriesName: magazine.seriesName,
    seriesOrder: magazine.order === null ? "" : String(magazine.order),
    magazineRole: magazine.role,
  };
}

export type ArticleLibrarySavePayload = {
  article: ArticlePatch;
  sourceBody: string | null;
  publishBody: string | null;
  magazine: NoteMagazineSettings;
};

export type ArticleLibraryEditResult =
  | { ok: true; value: ArticleLibrarySavePayload }
  | { ok: false; message: string };

export function buildArticleLibrarySavePayload(values: ArticleLibraryEditValues): ArticleLibraryEditResult {
  const publicationTarget = values.publicationTarget.trim();
  if (!/^[a-z][a-z0-9_-]{0,49}$/.test(publicationTarget)) {
    return { ok: false, message: "掲載先を正しく入力してください。" };
  }

  let price: number | null = null;
  if (values.articleType === "paid") {
    if (!/^\d+$/.test(values.price)) {
      return { ok: false, message: "有料記事の価格は1以上の整数で入力してください。" };
    }
    price = Number(values.price);
    if (!Number.isSafeInteger(price) || price <= 0) {
      return { ok: false, message: "有料記事の価格は1以上の整数で入力してください。" };
    }
  }

  const tags = values.tags
    .split(/[,、\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 50) {
    return { ok: false, message: "タグは50件以内です。" };
  }

  let order: number | null = null;
  if (values.seriesOrder.trim()) {
    if (!/^\d{1,4}$/.test(values.seriesOrder.trim())) {
      return { ok: false, message: "マガジン内の順番は0〜9999の整数で入力してください。" };
    }
    order = Number(values.seriesOrder.trim());
  }

  const magazine: NoteMagazineSettings = publicationTarget === "note"
    ? {
        enabled: values.magazineEnabled,
        name: values.magazineName,
        type: values.magazineType,
        seriesName: values.seriesName,
        order,
        role: values.magazineRole,
      }
    : { ...EMPTY_NOTE_MAGAZINE };

  if (magazine.enabled && !magazine.name.trim()) {
    return { ok: false, message: "マガジンをONにする場合はマガジン名を入力してください。" };
  }

  return {
    ok: true,
    value: {
      article: {
        title: values.title,
        publication_target: publicationTarget,
        article_type: values.articleType,
        genre: values.genre.trim() || null,
        subgenre: values.subgenre.trim() || null,
        body: values.body,
        status: values.status,
        price,
        tags,
      },
      sourceBody: values.sourceBody || null,
      publishBody: values.publishBody || null,
      magazine,
    },
  };
}

export function statusFromArchiveWorkspace(detail: ArticleDetail): ArticleStatus {
  const candidate = detail.workspace.workspaceJson.pwa_archive_previous_status;
  if (
    candidate === "draft" ||
    candidate === "writing" ||
    candidate === "ready" ||
    candidate === "waiting_publish" ||
    candidate === "published" ||
    candidate === "on_hold"
  ) {
    return candidate;
  }
  return "draft";
}

export function articlePatchFromDetail(detail: ArticleDetail, status: ArticleStatus): ArticlePatch {
  return {
    title: detail.title,
    publication_target: detail.publicationTarget,
    article_type: detail.articleType,
    genre: detail.genre,
    subgenre: detail.subgenre,
    body: detail.body,
    status,
    price: detail.price,
    tags: detail.tags,
  };
}

export function areLibraryFiltersActive(filters: LibraryFilters): boolean {
  return Object.entries(filters).some(([key, value]) =>
    key === "sort" ? value !== "updated_desc" : Boolean(value),
  );
}

function uniqueJapanese(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
}

export function collectArticleLibraryFilterOptions(articles: ArticleLibraryItem[]) {
  return {
    genres: uniqueJapanese(articles.map((article) => article.genre)),
    subgenres: uniqueJapanese(articles.map((article) => article.subgenre)),
    magazines: uniqueJapanese(articles.map((article) => article.magazineName)),
  };
}
