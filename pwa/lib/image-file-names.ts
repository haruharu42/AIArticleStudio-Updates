export type ImageFileKind = "cover" | "inline";

const WINDOWS_FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;
const MAX_TITLE_LENGTH = 80;

export function sanitizeImageFileTitle(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .replace(WINDOWS_FORBIDDEN, "_")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[._ ]+$/g, "")
    .trim();

  const safe = normalized || "article-image";
  return safe.length > MAX_TITLE_LENGTH ? safe.slice(0, MAX_TITLE_LENGTH).replace(/[._ ]+$/g, "") : safe;
}

export function buildSuggestedImageFilename(title: string, kind: ImageFileKind, order = 0): string {
  const base = sanitizeImageFileTitle(title);
  const suffix = kind === "cover" ? "アイキャッチ" : `挿絵${String(Math.max(1, Math.trunc(order))).padStart(2, "0")}`;
  return `${base}_${suffix}.png`;
}

export function buildImageAltText(title: string, kind: ImageFileKind, order = 0): string {
  const articleTitle = title.trim() || "記事";
  return kind === "cover"
    ? `${articleTitle}のアイキャッチ画像`
    : `${articleTitle}の挿絵${Math.max(1, Math.trunc(order))}`;
}
