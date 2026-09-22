const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const MAX_ZIP32 = 0xffffffff;

export type LocalZipEntry = {
  filename: string;
  data: Blob;
};

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function ensureZip32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ZIP32) {
    throw new Error(`${label}がZIPで扱えるサイズを超えています。`);
  }
}

function set16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function set32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concat(parts: Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function imageExtension(name: string, mimeType: string): string {
  const extension = name.trim().toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (extension && ["png", "jpg", "jpeg", "webp", "avif", "heic", "heif"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }
  const fromMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return fromMime[mimeType.toLowerCase()] ?? "png";
}

export function filenameForSelectedImage(
  suggestedFilename: string,
  originalFilename: string,
  mimeType: string,
): string {
  const extension = imageExtension(originalFilename, mimeType);
  const base = suggestedFilename.replace(/\.[^.]+$/, "");
  return `${base}.${extension}`;
}

export function buildImageZipFilename(articleTitle: string): string {
  const cleaned = articleTitle
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return `${cleaned || "AAS記事"}_画像一式.zip`;
}

export async function createLocalImageZip(entries: readonly LocalZipEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error("ZIPへ入れる画像を選択してください。");

  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localSize = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.filename);
    const dataBytes = new Uint8Array(await entry.data.arrayBuffer());
    ensureZip32(nameBytes.byteLength, "ファイル名");
    ensureZip32(dataBytes.byteLength, "画像");
    ensureZip32(localSize, "ZIP内オフセット");

    const crc = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(local.buffer);
    set32(localView, 0, 0x04034b50);
    set16(localView, 4, 20);
    set16(localView, 6, UTF8_FLAG);
    set16(localView, 8, STORE_METHOD);
    set16(localView, 10, 0);
    set16(localView, 12, 0);
    set32(localView, 14, crc);
    set32(localView, 18, dataBytes.byteLength);
    set32(localView, 22, dataBytes.byteLength);
    set16(localView, 26, nameBytes.byteLength);
    set16(localView, 28, 0);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(central.buffer);
    set32(centralView, 0, 0x02014b50);
    set16(centralView, 4, 20);
    set16(centralView, 6, 20);
    set16(centralView, 8, UTF8_FLAG);
    set16(centralView, 10, STORE_METHOD);
    set16(centralView, 12, 0);
    set16(centralView, 14, 0);
    set32(centralView, 16, crc);
    set32(centralView, 20, dataBytes.byteLength);
    set32(centralView, 24, dataBytes.byteLength);
    set16(centralView, 28, nameBytes.byteLength);
    set16(centralView, 30, 0);
    set16(centralView, 32, 0);
    set16(centralView, 34, 0);
    set16(centralView, 36, 0);
    set32(centralView, 38, 0);
    set32(centralView, 42, localSize);
    central.set(nameBytes, 46);

    localParts.push(local, dataBytes);
    centralParts.push(central);
    localSize += local.byteLength + dataBytes.byteLength;
    centralSize += central.byteLength;
  }

  ensureZip32(localSize, "ZIP本体");
  ensureZip32(centralSize, "ZIP索引");
  ensureZip32(localSize + centralSize, "ZIP全体");

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, entries.length);
  set16(endView, 10, entries.length);
  set32(endView, 12, centralSize);
  set32(endView, 16, localSize);
  set16(endView, 20, 0);

  const bytes = concat([...localParts, ...centralParts, end], localSize + centralSize + end.byteLength);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/zip" });
}

export function downloadLocalBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
