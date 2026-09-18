import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const PROFILE_AVATAR_MAX_STORED_BYTES = 500 * 1024;
export const PROFILE_AVATAR_MAX_EDGE = 512;

const PROFILE_AVATAR_REFERENCE_PREFIX = `storage:${PROFILE_AVATAR_BUCKET}/`;
const ALLOWED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PreparedProfileAvatar = {
  blob: Blob;
  width: number;
  height: number;
};

function pathFromStorageReference(value: string): string | null {
  const clean = value.trim();
  if (!clean.startsWith(PROFILE_AVATAR_REFERENCE_PREFIX)) return null;
  const withVersion = clean.slice(PROFILE_AVATAR_REFERENCE_PREFIX.length);
  const path = withVersion.split("?", 1)[0]?.trim() ?? "";
  return path || null;
}

export function profileAvatarPathFromReference(value: string): string | null {
  return pathFromStorageReference(value);
}

export function resolveProfileAvatarUrl(client: SupabaseClient, value: string): string {
  const path = pathFromStorageReference(value);
  if (!path) return value.trim();

  const { data } = client.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
  const version = value.includes("?v=") ? value.slice(value.indexOf("?v=")) : "";
  return `${data.publicUrl}${version}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした。別の画像を選択してください。"));
    };
    image.src = objectUrl;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== "image/webp") {
        reject(new Error("このブラウザーではWebP変換を利用できません。"));
        return;
      }
      resolve(blob);
    }, "image/webp", quality);
  });
}

export async function prepareProfileAvatar(file: File): Promise<PreparedProfileAvatar> {
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) {
    throw new Error("プロフィール画像はJPEG・PNG・WebPから選択してください。");
  }
  if (file.size <= 0 || file.size > PROFILE_AVATAR_MAX_SOURCE_BYTES) {
    throw new Error("元画像は10MB以下のものを選択してください。");
  }

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("画像サイズを確認できませんでした。");
  }

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.floor((image.naturalWidth - cropSize) / 2);
  const sourceY = Math.floor((image.naturalHeight - cropSize) / 2);
  const targetSizes = [...new Set([
    Math.min(PROFILE_AVATAR_MAX_EDGE, cropSize),
    Math.min(448, cropSize),
    Math.min(384, cropSize),
    Math.min(320, cropSize),
  ])].filter((size) => size > 0);
  const qualities = [0.86, 0.76, 0.66, 0.56, 0.46];

  let smallest: PreparedProfileAvatar | null = null;
  for (const size of targetSizes) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像変換を開始できませんでした。");
    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      size,
      size,
    );

    for (const quality of qualities) {
      const blob = await canvasToWebp(canvas, quality);
      const prepared = { blob, width: size, height: size };
      if (!smallest || blob.size < smallest.blob.size) smallest = prepared;
      if (blob.size <= PROFILE_AVATAR_MAX_STORED_BYTES) return prepared;
    }
  }

  if (smallest && smallest.blob.size <= PROFILE_AVATAR_MAX_STORED_BYTES) return smallest;
  throw new Error("画像を500KB以下に圧縮できませんでした。別の画像を選択してください。");
}

export async function uploadProfileAvatar(
  client: SupabaseClient,
  blob: Blob,
): Promise<string> {
  if (blob.type !== "image/webp" || blob.size > PROFILE_AVATAR_MAX_STORED_BYTES) {
    throw new Error("プロフィール画像の保存形式を確認できませんでした。");
  }

  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new Error("ログイン状態を確認できません。");

  const path = `${user.id}/avatar.webp`;
  const { error } = await client.storage.from(PROFILE_AVATAR_BUCKET).upload(path, blob, {
    contentType: "image/webp",
    cacheControl: "60",
    upsert: true,
  });
  if (error) throw new Error("プロフィール画像をアップロードできませんでした。");

  return `${PROFILE_AVATAR_REFERENCE_PREFIX}${path}?v=${Date.now()}`;
}

export async function removeProfileAvatar(client: SupabaseClient): Promise<void> {
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new Error("ログイン状態を確認できません。");

  const { error } = await client.storage
    .from(PROFILE_AVATAR_BUCKET)
    .remove([`${user.id}/avatar.webp`]);
  if (error) throw new Error("プロフィール画像を削除できませんでした。");
}
