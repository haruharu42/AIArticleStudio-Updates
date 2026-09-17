import { noteMagazineFromWorkspace } from "@/lib/article-library-v2";
import type { ArticleDetail } from "@/lib/phase7-articles";

export type ArticleExportFile = {
  name: string;
  content: string;
  type: string;
};

export function articleExportBody(detail: ArticleDetail): string {
  const body = detail.workspace.publishBody || detail.body || "";
  return body.replace(/\r\n?/g, "\n").trim();
}

export function safeArticleBaseName(detail: Pick<ArticleDetail, "title" | "id">): string {
  const normalized = detail.title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return normalized || `article-${detail.id.slice(0, 8)}`;
}

export function articleExportFilename(detail: Pick<ArticleDetail, "title" | "id">): string {
  return `${safeArticleBaseName(detail)}.md`;
}

export function articleExportMarkdown(detail: ArticleDetail): string {
  const body = articleExportBody(detail);
  return body ? `${body}\n` : "";
}

export function articleExportText(detail: ArticleDetail): string {
  return articleExportMarkdown(detail);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function articleExportHtml(detail: ArticleDetail): string {
  const title = escapeHtml(detail.title || "無題の記事");
  const body = escapeHtml(articleExportBody(detail));
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n</head>\n<body>\n<article>\n<h1>${title}</h1>\n<pre style="white-space:pre-wrap;font:inherit">${body}</pre>\n</article>\n</body>\n</html>\n`;
}

export function articleExportJson(detail: ArticleDetail): string {
  const magazine = noteMagazineFromWorkspace(detail.workspace.workspaceJson);
  return `${JSON.stringify({
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    article: {
      id: detail.id,
      title: detail.title,
      publicationTarget: detail.publicationTarget,
      articleType: detail.articleType,
      genre: detail.genre,
      subgenre: detail.subgenre,
      status: detail.status,
      price: detail.price,
      tags: detail.tags,
      body: detail.body,
      scheduledAt: detail.scheduledAt,
      publishedAt: detail.publishedAt,
      publishedUrl: detail.publishedUrl,
      revision: detail.revision,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    },
    noteMagazine: magazine,
    workspace: {
      requestJson: detail.workspace.requestJson,
      workspaceJson: detail.workspace.workspaceJson,
      imagePlanJson: detail.workspace.imagePlanJson,
      sourceBody: detail.workspace.sourceBody,
      publishBody: detail.workspace.publishBody,
      workspaceVersion: detail.workspace.workspaceVersion,
    },
  }, null, 2)}\n`;
}

export function buildArticleExportFiles(detail: ArticleDetail): ArticleExportFile[] {
  const base = safeArticleBaseName(detail);
  return [
    { name: `${base}.md`, content: articleExportMarkdown(detail), type: "text/markdown;charset=utf-8" },
    { name: `${base}.txt`, content: articleExportText(detail), type: "text/plain;charset=utf-8" },
    { name: `${base}.html`, content: articleExportHtml(detail), type: "text/html;charset=utf-8" },
    { name: `${base}.json`, content: articleExportJson(detail), type: "application/json;charset=utf-8" },
  ];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function asBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createStoredZip(files: ArticleExportFile[]): Blob {
  if (!files.length) throw new Error("ZIPに含めるファイルがありません。");
  if (files.length > 500) throw new Error("一度に保存できるファイル数を超えています。");

  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50);
    u16(localView, 4, 20);
    u16(localView, 6, 0x0800);
    u16(localView, 8, 0);
    u16(localView, 10, 0);
    u16(localView, 12, 0x0021);
    u32(localView, 14, checksum);
    u32(localView, 18, dataBytes.length);
    u32(localView, 22, dataBytes.length);
    u16(localView, 26, nameBytes.length);
    u16(localView, 28, 0);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 8, 0x0800);
    u16(centralView, 10, 0);
    u16(centralView, 12, 0);
    u16(centralView, 14, 0x0021);
    u32(centralView, 16, checksum);
    u32(centralView, 20, dataBytes.length);
    u32(centralView, 24, dataBytes.length);
    u16(centralView, 28, nameBytes.length);
    u16(centralView, 30, 0);
    u16(centralView, 32, 0);
    u16(centralView, 34, 0);
    u16(centralView, 36, 0);
    u32(centralView, 38, 0);
    u32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 4, 0);
  u16(endView, 6, 0);
  u16(endView, 8, files.length);
  u16(endView, 10, files.length);
  u32(endView, 12, centralSize);
  u32(endView, 16, localOffset);
  u16(endView, 20, 0);

  return new Blob(
    [...localParts, ...centralParts, end].map(asBlobPart),
    { type: "application/zip" },
  );
}
