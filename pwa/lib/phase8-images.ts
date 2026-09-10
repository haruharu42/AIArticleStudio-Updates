import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTICLE_ASSET_BUCKET, ArticleLibraryError, fromApiError, parseAsset, requireArticleAccess } from "@/lib/phase7-articles";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SIGNED_IMAGE_SECONDS = 90;
export const IMAGE_COLUMNS = "id,article_id,user_id,asset_type,status,storage_bucket,storage_path,original_filename,mime_type,size_bytes,width,height,checksum_sha256,sort_order,insertion_marker,alt_text,created_at,updated_at";
export type ImageContext = { client: SupabaseClient; ownerId: string; articleId: string; revision: number };
export type ImageAsset = ReturnType<typeof parseAsset> & {
  assetType: "cover" | "inline";
  originalFilename: string;
  sizeBytes: number;
  sortOrder: number;
  insertionMarker: string | null;
  altText: string;
  createdAt: string;
  updatedAt: string;
};
export type ImageMetadata = { assetType: "cover" | "inline"; sortOrder: number; insertionMarker: string | null; altText: string };
export type ImageDraft = { asset: ImageAsset; sortOrder: number; insertionMarker: string | null; altText: string };
export type PreparedImage = { file: File; mimeType: string; checksum: string; width: number; height: number };

function invalid(message: string): ArticleLibraryError {
  return new ArticleLibraryError(message, { category: "validation", code: "invalid_image" });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("画像の応答形式が不正です。");
  return value as Record<string, unknown>;
}
function one(value: unknown): unknown { return Array.isArray(value) && value.length === 1 ? value[0] : value; }
function text(value: unknown): string {
  if (typeof value !== "string") throw invalid("画像情報の形式が不正です。");
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw invalid("画像の数値情報が不正です。");
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (!/^\d{4}-\d\d-\d\dT/.test(result) || !Number.isFinite(Date.parse(result))) throw invalid("画像の更新日時が不正です。");
  return result; // Preserve microseconds for the database comparison.
}
export function parseImageAsset(value: unknown, ownerId: string, articleId: string): ImageAsset {
  const row = object(value);
  const base = parseAsset(value, articleId, ownerId);
  if (row.asset_type !== "cover" && row.asset_type !== "inline") throw invalid("画像の用途が不正です。");
  const marker = row.insertion_marker === null ? null : text(row.insertion_marker);
  if ((row.asset_type === "cover" && marker !== null) || (marker !== null && (!marker.trim() || marker.length > 500))) throw invalid("挿入位置が不正です。");
  const altText = row.alt_text === null ? "" : text(row.alt_text);
  if (altText.length > 2000) throw invalid("代替テキストが長すぎます。");
  return { ...base, assetType: row.asset_type, originalFilename: text(row.original_filename),
    sizeBytes: integer(row.size_bytes, 1, MAX_IMAGE_BYTES), sortOrder: integer(row.sort_order, 0, 2147483647),
    insertionMarker: marker, altText, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) };
}
function parseImages(value: unknown, ctx: ImageContext): ImageAsset[] {
  if (!Array.isArray(value) || value.length >= 1000) throw invalid("画像一覧を完全に取得できませんでした。");
  const assets = value.map(row => parseImageAsset(row, ctx.ownerId, ctx.articleId));
  if (new Set(assets.map(a => a.id)).size !== assets.length) throw invalid("画像一覧に重複があります。");
  return assets;
}
function checkContext(ctx: ImageContext, asset?: ImageAsset): void {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!uuid.test(ctx.ownerId) || !uuid.test(ctx.articleId)) throw invalid("画像の所有者情報が不正です。");
  integer(ctx.revision, 1, 2147483647);
  if (asset) {
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[asset.mimeType];
    if (!uuid.test(asset.id) || asset.userId !== ctx.ownerId || asset.articleId !== ctx.articleId
      || asset.storageBucket !== ARTICLE_ASSET_BUCKET || !ext
      || asset.storagePath !== `${ctx.ownerId}/${ctx.articleId}/${asset.id}.${ext}`) throw invalid("画像の所有者または保存先が一致しません。");
    timestamp(asset.updatedAt);
  }
}
export function validateImageMetadata(value: ImageMetadata): ImageMetadata {
  if (value.assetType !== "cover" && value.assetType !== "inline") throw invalid("画像の用途を選択してください。");
  integer(value.sortOrder, 0, 2147483647);
  const marker = (value.insertionMarker ?? "").trim() || null;
  if ((value.assetType === "cover" && marker !== null) || (value.assetType === "inline" && (!marker || marker.length > 500))) throw invalid("挿絵の挿入マーカーを1〜500文字で入力してください。");
  if (value.altText.length > 2000) throw invalid("代替テキストは2000文字以内で入力してください。");
  return { ...value, insertionMarker: marker };
}
export function detectImageMime(bytes: Uint8Array): string {
  if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) throw invalid("画像は10 MiB以下のファイルを選択してください。");
  if ([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  throw invalid("PNG・JPEG・WebPの画像を選択してください。");
}
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  integer(file.size, 1, MAX_IMAGE_BYTES);
  if (!file.name.trim() || file.name.length > 255) throw invalid("画像ファイル名は255文字以内にしてください。");
  const bytes = await file.arrayBuffer();
  const mimeType = detectImageMime(new Uint8Array(bytes));
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2,"0")).join("");
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve,reject) => {
      const preview = new Image();
      preview.onload = () => resolve({ width: preview.naturalWidth, height: preview.naturalHeight });
      preview.onerror = () => reject(invalid("画像を読み込めません。壊れていない画像を選択してください。"));
      preview.src = url;
    });
    integer(size.width, 1, 2147483647); integer(size.height, 1, 2147483647);
    return { file, mimeType, checksum, ...size };
  } finally { URL.revokeObjectURL(url); }
}
export async function listArticleImages(ctx: ImageContext): Promise<ImageAsset[]> {
  checkContext(ctx);
  await requireArticleAccess(ctx.client, ctx.ownerId);
  const { data, error } = await ctx.client.from("article_assets").select(IMAGE_COLUMNS)
    .eq("article_id", ctx.articleId).eq("user_id", ctx.ownerId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1001);
  if (error) throw fromApiError(error, "画像一覧の取得に失敗しました。");
  return parseImages(data, ctx);
}
export async function saveImageMetadata(ctx: ImageContext, drafts: ImageDraft[]): Promise<ImageAsset[]> {
  checkContext(ctx);
  if (!drafts.length || drafts.length > 500 || new Set(drafts.map(d => d.asset.id)).size !== drafts.length) throw invalid("更新する画像を確認してください。");
  const changes = drafts.map(d => {
    checkContext(ctx, d.asset);
    if (d.asset.status !== "ready") throw invalid("転送または削除の途中です。先に画像の状態を確認してください。");
    const metadata = validateImageMetadata({ assetType: d.asset.assetType, ...d });
    return { id: d.asset.id, expected_updated_at: d.asset.updatedAt, sort_order: metadata.sortOrder,
      insertion_marker: metadata.insertionMarker, alt_text: metadata.altText };
  });
  await requireArticleAccess(ctx.client, ctx.ownerId);
  const { data,error } = await ctx.client.rpc("update_article_assets_metadata", { p_article_id: ctx.articleId, p_changes: changes });
  if (error) throw imageError(error, "画像情報を保存できませんでした。入力内容は残っています。");
  return parseImages(data, ctx);
}
function imageError(error: unknown, fallback: string): ArticleLibraryError {
  const row = error && typeof error === "object" ? error as Record<string,unknown> : {};
  if (row.code === "40001") return new ArticleLibraryError("別の端末で更新されています。入力内容は残っています。「最新状態を確認」で比較してください。", { category: "conflict", code: "40001", status: 409 });
  if (row.code === "23505" || row.message === "article_inline_marker_exists" || row.message === "article_cover_exists") return invalid("同じ挿入マーカーまたはアイキャッチが存在します。画像一覧を確認してください。");
  if (row.message === "storage_object_already_exists" || row.message === "storage_object_exists") return invalid("画像は送信済みです。「送信済みか確認」で保存を完了してから削除してください。");
  if (row.message === "storage_object_missing") return invalid("アップロードが完了していません。同じ画像を選んで再送するか、準備を取り消してください。");
  return fromApiError(error, fallback);
}
async function transition(ctx: ImageContext, asset: ImageAsset, action: string, image?: PreparedImage): Promise<Record<string,unknown>> {
  checkContext(ctx,asset);
  const { data,error } = await ctx.client.rpc("transition_article_asset_checked", {
    p_article_id: ctx.articleId, p_asset_id: asset.id, p_expected_updated_at: asset.updatedAt,
    p_expected_article_revision: ctx.revision, p_action: action,
    p_width: image?.width ?? asset.width, p_height: image?.height ?? asset.height,
    p_checksum_sha256: image?.checksum ?? asset.checksumSha256,
  });
  if (error) throw imageError(error, "画像の処理を完了できませんでした。最新状態を確認して再開してください。");
  const result = object(one(data));
  if (action === "cancel_pending" || action === "finalize_delete") {
    if (result.deleted_asset_id !== asset.id) throw invalid("画像削除の応答が一致しません。");
  } else {
    const changed = parseImageAsset(result.asset,ctx.ownerId,ctx.articleId);
    if (changed.id !== asset.id || changed.storagePath !== asset.storagePath || changed.status !== (action === "finalize" ? "ready" : "delete_pending")) throw invalid("画像の状態変更を確認できませんでした。");
  }
  return result;
}
export async function uploadArticleImage(ctx: ImageContext, image: PreparedImage, metadata: ImageMetadata, pending?: ImageAsset): Promise<ImageAsset> {
  checkContext(ctx,pending);
  const values = validateImageMetadata(metadata);
  integer(image.file.size, 1, MAX_IMAGE_BYTES);
  if (!/^[0-9a-f]{64}$/.test(image.checksum)) throw invalid("画像ファイルを選び直してください。");
  await requireArticleAccess(ctx.client,ctx.ownerId);
  let asset: ImageAsset;
  if (pending) {
    if (pending.status !== "pending_upload" || !pending.checksumSha256 || pending.checksumSha256 !== image.checksum
      || pending.mimeType !== image.mimeType || pending.sizeBytes !== image.file.size) throw invalid("最初に選択した画像と一致しません。準備を取り消してから追加し直してください。");
    asset = pending;
  } else {
    const { data,error } = await ctx.client.rpc("prepare_article_asset_checked", {
      p_article_id: ctx.articleId, p_expected_article_revision: ctx.revision, p_asset_type: values.assetType,
      p_original_filename: image.file.name, p_mime_type: image.mimeType, p_size_bytes: image.file.size,
      p_sort_order: values.sortOrder, p_insertion_marker: values.insertionMarker, p_alt_text: values.altText, p_checksum_sha256: image.checksum,
    });
    if (error) throw imageError(error,"アップロードの準備を確認できませんでした。最新状態を確認してください。");
    asset = parseImageAsset(one(data),ctx.ownerId,ctx.articleId);
    if (asset.status !== "pending_upload" || asset.checksumSha256 !== image.checksum) throw invalid("アップロード準備の応答が一致しません。");
  }
  // Immutable path and upsert:false. After a lost response, finalize verifies
  // the object already stored at this exact prepared path before any retry.
  let uploadError: unknown;
  try {
    const result = await ctx.client.storage.from(ARTICLE_ASSET_BUCKET)
      .upload(asset.storagePath, image.file, { contentType: image.mimeType, upsert: false, cacheControl: "0" });
    uploadError = result.error;
  } catch (caught) { uploadError = caught; }
  try {
    const result = await transition(ctx,asset,"finalize",image);
    return parseImageAsset(result.asset,ctx.ownerId,ctx.articleId);
  } catch (error) {
    if (uploadError && !(error instanceof ArticleLibraryError && error.category === "conflict")) throw imageError(uploadError,"送信を確認できませんでした。画像は選択したままです。最新状態を確認して再送してください。");
    throw error;
  }
}
export async function recoverArticleImage(ctx: ImageContext, asset: ImageAsset): Promise<void> {
  checkContext(ctx,asset);
  await requireArticleAccess(ctx.client,ctx.ownerId);
  if (asset.status === "pending_upload") { await transition(ctx,asset,"finalize"); return; }
  if (asset.status === "delete_pending") { await removeArticleImage(ctx,asset); return; }
  throw invalid("この画像はすでに利用可能です。");
}
export async function removeArticleImage(ctx: ImageContext, original: ImageAsset): Promise<void> {
  checkContext(ctx,original);
  await requireArticleAccess(ctx.client,ctx.ownerId);
  let asset = original;
  if (asset.status === "pending_upload") {
    // A stored object must be finalized explicitly before the normal delete flow.
    await transition(ctx,asset,"cancel_pending"); return;
  }
  const changed = await transition(ctx,asset,"begin_delete");
  asset = parseImageAsset(changed.asset,ctx.ownerId,ctx.articleId);
  const { error } = await ctx.client.storage.from(ARTICLE_ASSET_BUCKET).remove([asset.storagePath]);
  if (error) throw imageError(error,"画像を削除できませんでした。削除待ちの画像から再開できます。");
  await transition(ctx,asset,"finalize_delete");
}
export async function createImageSignedUrl(ctx: ImageContext, asset: ImageAsset, storageOrigin: string): Promise<string> {
  checkContext(ctx,asset);
  if (asset.status !== "ready") throw invalid("利用可能な画像を選択してください。");
  const origin = new URL(storageOrigin);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost","127.0.0.1"].includes(origin.hostname))) throw invalid("画像の接続先が不正です。");
  await requireArticleAccess(ctx.client,ctx.ownerId);
  const { data,error } = await ctx.client.storage.from(ARTICLE_ASSET_BUCKET).createSignedUrl(asset.storagePath,SIGNED_IMAGE_SECONDS);
  if (error) throw imageError(error,"画像を表示できませんでした。再取得してください。");
  const url = new URL(text(data?.signedUrl));
  if (url.origin !== origin.origin || url.username || url.password || url.hash
    || decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/${ARTICLE_ASSET_BUCKET}/${asset.storagePath}`
    || !url.searchParams.get("token")) throw invalid("画像URLの保存先が一致しません。");
  return url.href;
}
