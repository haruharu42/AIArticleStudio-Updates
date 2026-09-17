import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleDetail, ArticleStatus } from "@/lib/phase7-articles";

export const ARTICLE_LIBRARY_PAGE_SIZE = 30;

export type MagazineRole = "intro" | "standard" | "summary" | "bonus";
export type ArticleLibrarySort = "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "title_asc" | "series_order";

export type ArticleLibraryMeta = {
  articleId: string;
  magazineEnabled: boolean;
  magazineName: string | null;
  seriesName: string | null;
  seriesOrder: number | null;
  magazineRole: MagazineRole | null;
};

export type ArticleLibraryRow = {
  id: string;
  userId: string;
  title: string;
  publicationTarget: string;
  articleType: "free" | "paid";
  genre: string | null;
  subgenre: string | null;
  status: ArticleStatus;
  price: number | null;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  magazineEnabled: boolean;
  magazineName: string | null;
  seriesName: string | null;
  seriesOrder: number | null;
  magazineRole: MagazineRole | null;
};

export type ArticleLibraryFilters = {
  query?: string;
  status?: ArticleStatus | "";
  publicationTarget?: string;
  genre?: string;
  subgenre?: string;
  magazineOnly?: boolean;
  magazineName?: string;
  sort?: ArticleLibrarySort;
  page?: number;
};

export type ArticleLibraryPage = {
  rows: ArticleLibraryRow[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("記事ライブラリの応答形式が不正です。");
  return value as Record<string, unknown>;
}
function text(value: unknown, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string") throw new Error("記事ライブラリの文字列データが不正です。");
  return value;
}
function integer(value: unknown, nullable = false): number | null {
  if (value === null && nullable) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("記事ライブラリの数値データが不正です。");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("記事ライブラリの真偽値が不正です。");
  return value;
}
function parseRole(value: unknown): MagazineRole | null {
  if (value === null) return null;
  if (value === "intro" || value === "standard" || value === "summary" || value === "bonus") return value;
  throw new Error("マガジン役割が不正です。");
}
function parseRow(value: unknown, ownerId: string): ArticleLibraryRow {
  const row = object(value);
  const userId = text(row.user_id) as string;
  if (userId !== ownerId) throw new Error("記事所有者の照合に失敗しました。");
  const status = text(row.status) as ArticleStatus;
  if (!["draft","writing","ready","waiting_publish","published","on_hold","archived"].includes(status)) throw new Error("記事状態が不正です。");
  const articleType = text(row.article_type);
  if (articleType !== "free" && articleType !== "paid") throw new Error("記事種別が不正です。");
  if (!Array.isArray(row.tags) || row.tags.some((item) => typeof item !== "string")) throw new Error("タグが不正です。");
  return {
    id: text(row.id) as string,
    userId,
    title: text(row.title) as string,
    publicationTarget: text(row.publication_target) as string,
    articleType,
    genre: text(row.genre, true),
    subgenre: text(row.subgenre, true),
    status,
    price: integer(row.price, true),
    tags: row.tags as string[],
    revision: integer(row.revision) as number,
    createdAt: text(row.created_at) as string,
    updatedAt: text(row.updated_at) as string,
    magazineEnabled: boolean(row.magazine_enabled),
    magazineName: text(row.magazine_name, true),
    seriesName: text(row.series_name, true),
    seriesOrder: integer(row.series_order, true),
    magazineRole: parseRole(row.magazine_role),
  };
}

export async function listArticleLibraryPage(
  client: SupabaseClient,
  ownerId: string,
  filters: ArticleLibraryFilters,
): Promise<ArticleLibraryPage> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const { data, error } = await client.rpc("list_article_library_page", {
    p_page: page,
    p_page_size: ARTICLE_LIBRARY_PAGE_SIZE,
    p_query: filters.query?.trim() || null,
    p_status: filters.status || null,
    p_publication_target: filters.publicationTarget?.trim() || null,
    p_genre: filters.genre?.trim() || null,
    p_subgenre: filters.subgenre?.trim() || null,
    p_magazine_only: Boolean(filters.magazineOnly),
    p_magazine_name: filters.magazineName?.trim() || null,
    p_sort: filters.sort ?? "updated_desc",
  });
  if (error) throw error;
  const result = object(data);
  if (!Array.isArray(result.rows)) throw new Error("記事一覧の応答形式が不正です。");
  const total = integer(result.total) as number;
  const resultPage = integer(result.page) as number;
  const pageSize = integer(result.page_size) as number;
  return {
    rows: result.rows.map((row) => parseRow(row, ownerId)),
    total,
    page: resultPage,
    pageSize,
    hasNext: boolean(result.has_next),
  };
}

export async function getArticleLibraryMeta(client: SupabaseClient, articleId: string): Promise<ArticleLibraryMeta> {
  const { data, error } = await client.rpc("get_article_library_meta", { p_article_id: articleId });
  if (error) throw error;
  const row = object(data);
  return {
    articleId: text(row.article_id) as string,
    magazineEnabled: boolean(row.magazine_enabled),
    magazineName: text(row.magazine_name, true),
    seriesName: text(row.series_name, true),
    seriesOrder: integer(row.series_order, true),
    magazineRole: parseRole(row.magazine_role),
  };
}

export async function updateArticleLibraryMeta(
  client: SupabaseClient,
  articleId: string,
  revision: number,
  meta: ArticleLibraryMeta,
): Promise<number> {
  const { data, error } = await client.rpc("update_article_library_meta", {
    p_article_id: articleId,
    p_expected_revision: revision,
    p_meta: {
      magazine_enabled: meta.magazineEnabled,
      magazine_name: meta.magazineEnabled ? meta.magazineName : null,
      series_name: meta.magazineEnabled ? meta.seriesName : null,
      series_order: meta.magazineEnabled ? meta.seriesOrder : null,
      magazine_role: meta.magazineEnabled ? meta.magazineRole : null,
    },
  });
  if (error) throw error;
  const result = object(data);
  return integer(result.revision) as number;
}

export async function duplicateCloudArticle(client: SupabaseClient, articleId: string, revision: number): Promise<string> {
  const { data, error } = await client.rpc("duplicate_cloud_article", { p_article_id: articleId, p_expected_revision: revision });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("複製した記事IDを取得できませんでした。");
  return data;
}

export function safeArticleFilename(title: string, extension: "md" | "txt" | "html" | "json"): string {
  const stem = title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120) || "AAS記事";
  return `${stem}.${extension}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function articleDownloadPayload(detail: ArticleDetail, format: "md" | "txt" | "html" | "json"): { filename: string; mime: string; content: string } {
  const body = detail.workspace.publishBody || detail.body || "";
  const filename = safeArticleFilename(detail.title, format);
  if (format === "json") {
    return { filename, mime: "application/json;charset=utf-8", content: JSON.stringify({ title: detail.title, publicationTarget: detail.publicationTarget, articleType: detail.articleType, genre: detail.genre, subgenre: detail.subgenre, tags: detail.tags, body, updatedAt: detail.updatedAt }, null, 2) };
  }
  if (format === "html") {
    return { filename, mime: "text/html;charset=utf-8", content: `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${escapeHtml(detail.title)}</title><body><h1>${escapeHtml(detail.title)}</h1><pre style="white-space:pre-wrap">${escapeHtml(body)}</pre></body></html>` };
  }
  if (format === "txt") return { filename, mime: "text/plain;charset=utf-8", content: `${detail.title}\n\n${body}` };
  return { filename, mime: "text/markdown;charset=utf-8", content: `# ${detail.title}\n\n${body}` };
}

export function downloadTextFile(payload: { filename: string; mime: string; content: string }): void {
  const blob = new Blob([payload.content], { type: payload.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function desktopDownloadAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 768;
}
