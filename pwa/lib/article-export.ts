import type { ArticleDetail } from "@/lib/phase7-articles";

export function articleExportBody(detail: ArticleDetail): string {
  const body = detail.workspace.publishBody || detail.body || "";
  return body.replace(/\r\n?/g, "\n").trim();
}

export function articleExportFilename(detail: Pick<ArticleDetail, "title" | "id">): string {
  const normalized = detail.title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return `${normalized || `article-${detail.id.slice(0, 8)}`}.md`;
}

export function articleExportMarkdown(detail: ArticleDetail): string {
  const body = articleExportBody(detail);
  return body ? `${body}\n` : "";
}
