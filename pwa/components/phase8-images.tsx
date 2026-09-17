"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { articleLibraryMessage } from "@/lib/phase7-articles";
import {
  createImageSignedUrl,
  listArticleImages,
  type ImageAsset,
  type ImageContext,
} from "@/lib/phase8-images";

const storageOrigin = (process.env.NEXT_PUBLIC_AAS_SUPABASE_URL ?? "").trim();
const STATUS: Record<ImageAsset["status"], string> = {
  ready: "保存済み（旧方式）",
  pending_upload: "旧アップロード未完了",
  delete_pending: "旧削除処理待ち",
};

function PrivatePreview({ ctx, asset }: { ctx: ImageContext; asset: ImageAsset }) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { rootMargin: "150px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || asset.status !== "ready") return;
    let alive = true;
    void createImageSignedUrl(ctx, asset, storageOrigin)
      .then((next) => {
        if (!alive) return;
        setUrl(next);
        setError(false);
      })
      .catch(() => {
        if (!alive) return;
        setUrl("");
        setError(true);
      });
    return () => { alive = false; };
  }, [asset, ctx, retry, visible]);

  return (
    <div ref={holder} className="image-preview">
      {url && !error ? (
        // Private, expiring URLs must bypass public image optimization/caches.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={asset.altText || (asset.assetType === "cover" ? "記事のアイキャッチ" : "記事の挿絵")}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
        />
      ) : (
        <div className="image-placeholder">
          <span aria-hidden="true">▧</span>
          <span>{error ? "旧クラウド画像を表示できませんでした" : asset.status === "ready" ? "画像を読み込みます" : STATUS[asset.status]}</span>
          {error && <button type="button" className="back-action" onClick={() => setRetry((value) => value + 1)}>画像を再取得</button>}
        </div>
      )}
    </div>
  );
}

export function Phase8Images({
  client,
  ownerId,
  articleId,
  revision,
  onBusyChange,
  onUnsavedChange,
}: {
  client: SupabaseClient;
  ownerId: string;
  articleId: string;
  revision: number;
  onBusyChange: (busy: boolean) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  const ctx = useMemo(() => ({ client, ownerId, articleId, revision }), [articleId, client, ownerId, revision]);
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    onBusyChange(false);
    onUnsavedChange(false);
    return () => {
      onBusyChange(false);
      onUnsavedChange(false);
    };
  }, [onBusyChange, onUnsavedChange]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      setAssets(await listArticleImages(ctx));
    } catch (caught) {
      setError(articleLibraryMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  const ordered = [...assets].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="article-images" aria-labelledby="article-images-title">
      <div className="images-heading">
        <div>
          <p className="eyebrow">LOCAL IMAGE POLICY</p>
          <h3 id="article-images-title">記事の画像</h3>
          <p>新しい画像はAASへアップロードせず、スマホ・PCへ保存する方式に変更しました。</p>
        </div>
        <div className="image-actions">
          <button type="button" className="secondary-action" onClick={() => void reload()} disabled={loading}>旧クラウド画像を再確認</button>
          <a className="primary-action" href="/images">画像生成プロンプトを作る</a>
        </div>
      </div>

      <div className="route-notice" role="note">
        画像生成画面では「記事タイトル_アイキャッチ.png」「記事タイトル_挿絵01.png」のような推奨ファイル名を自動作成します。画像本体をSupabase Storageへ保存しないため、Storage容量を消費しません。
      </div>

      {error && <p className="library-notice error" role="alert">{error}</p>}
      {notice && <p className="library-notice success" role="status">{notice}</p>}
      {loading ? (
        <p role="status">旧クラウド画像を確認しています…</p>
      ) : ordered.length ? (
        <>
          <p className="panel-muted">以下は切り替え前に保存された旧クラウド画像です。閲覧のみ可能で、新規追加・差し替えは行いません。</p>
          <div className="image-grid">
            {ordered.map((asset, index) => (
              <div className="image-card" key={asset.id}>
                <PrivatePreview ctx={ctx} asset={asset} />
                <div className="image-card-content">
                  <div className="image-card-title">
                    <strong>{asset.assetType === "cover" ? "アイキャッチ" : `挿絵 ${index + 1}`}</strong>
                    <span>{STATUS[asset.status]}</span>
                  </div>
                  <p className="image-filename">{asset.originalFilename} · {(asset.sizeBytes / 1024).toFixed(0)} KB</p>
                  {asset.insertionMarker && <p>挿入マーカー: {asset.insertionMarker}</p>}
                  {asset.altText && <p>alt: {asset.altText}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="images-empty">
          <span aria-hidden="true">▧</span>
          <h4>クラウド画像は保存しません</h4>
          <p>画像生成後は端末へ保存してください。AASは画像生成プロンプト・推奨ファイル名・挿入位置の案内に集中します。</p>
        </div>
      )}
    </section>
  );
}
