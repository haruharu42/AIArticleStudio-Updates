export type LocalArticleImageKind = "cover" | "inline";

export type LocalArticleImageRecord = {
  key: string;
  userId: string;
  articleId: string;
  kind: LocalArticleImageKind;
  order: number;
  filename: string;
  mimeType: string;
  blob: Blob;
  updatedAt: string;
};

const DB_NAME = "aas-local-article-images";
const STORE_NAME = "images";
const DB_VERSION = 1;

function imageKey(userId: string, articleId: string, kind: LocalArticleImageKind, order: number): string {
  return `${userId}:${articleId}:${kind}:${order}`;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("このブラウザーでは端末内画像保存を利用できません。"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("端末内画像保存を開けませんでした。"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("article", ["userId", "articleId"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error ?? new Error("端末内画像の処理に失敗しました。"));
      request.onsuccess = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("端末内画像の処理が中断されました。"));
    });
  } finally {
    db.close();
  }
}

export async function saveLocalArticleImage(input: {
  userId: string;
  articleId: string;
  kind: LocalArticleImageKind;
  order: number;
  file: File;
  filename?: string;
}): Promise<LocalArticleImageRecord> {
  const record: LocalArticleImageRecord = {
    key: imageKey(input.userId, input.articleId, input.kind, input.order),
    userId: input.userId,
    articleId: input.articleId,
    kind: input.kind,
    order: input.order,
    filename: input.filename?.trim() || input.file.name || `${input.kind}-${input.order}`,
    mimeType: input.file.type || "application/octet-stream",
    blob: input.file,
    updatedAt: new Date().toISOString(),
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function listLocalArticleImages(userId: string, articleId: string): Promise<LocalArticleImageRecord[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("article");
      const request = index.getAll(IDBKeyRange.only([userId, articleId]));
      request.onerror = () => reject(request.error ?? new Error("端末内画像を読み込めませんでした。"));
      request.onsuccess = () => {
        const records = (request.result as LocalArticleImageRecord[]).sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "cover" ? -1 : 1;
          return a.order - b.order;
        });
        resolve(records);
      };
    });
  } finally {
    db.close();
  }
}

export async function deleteLocalArticleImage(
  userId: string,
  articleId: string,
  kind: LocalArticleImageKind,
  order: number,
): Promise<void> {
  await withStore("readwrite", (store) => store.delete(imageKey(userId, articleId, kind, order)));
}

export function localArticleImageToFile(record: LocalArticleImageRecord): File {
  return new File([record.blob], record.filename, {
    type: record.mimeType,
    lastModified: Date.parse(record.updatedAt) || Date.now(),
  });
}
