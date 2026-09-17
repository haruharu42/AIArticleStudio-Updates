const WINDOWS_RESERVED = /[<>:"/\\|?*\u0000-\u001F]/g;
const MULTI_SEPARATOR = /[\s_\-]+/g;

function trimWindowsUnsafeEnd(value: string): string {
  return value.replace(/[. ]+$/g, "");
}

export function sanitizeImageTitle(value: string, maxLength = 72): string {
  const normalized = value
    .normalize("NFKC")
    .replace(WINDOWS_RESERVED, "_")
    .replace(MULTI_SEPARATOR, "_")
    .replace(/^[_ .]+|[_ .]+$/g, "");

  const base = trimWindowsUnsafeEnd(normalized) || "article-image";
  return Array.from(base).slice(0, Math.max(12, maxLength)).join("") || "article-image";
}

export function buildSuggestedImageFilename(input: {
  title: string;
  kind: "cover" | "inline";
  order?: number;
  extension?: "png" | "jpg" | "jpeg" | "webp";
}): string {
  const title = sanitizeImageTitle(input.title);
  const extension = input.extension ?? "png";
  const suffix = input.kind === "cover"
    ? "アイキャッチ"
    : `挿絵${String(Math.max(1, Math.trunc(input.order ?? 1))).padStart(2, "0")}`;
  return `${title}_${suffix}.${extension}`;
}
