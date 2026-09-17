"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { articleLibraryMessage } from "@/lib/phase7-articles";
import { listArticleImages, type ImageAsset } from "@/lib/phase8-images";

const STATUS: Record<ImageAsset["status"], string> = {
  ready: "保存済み",
  pending_upload: "アップロード準備中",
  delete_pending: "削除待ち",
};

export function Phase8Images({ client, ownerId, articleId, revision, onBusyChange, onUnsavedChange }: {
  client: SupabaseClient;
  ownerId: string;
  articleId: string;
  revision: number;
  onBusyChange: (busy: boolean) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  const ctx = useMemo(() => ({ client, ownerId, articleId, revision }), [client, ownerId, articleId, revision]);
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAssets(await listArticleImages(ctx));
    } catch (caught) {
      setError(articleLibraryMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(first);
  }, [refresh]);

  useEffect(() => {
    const reset = window.setTimeout(() => {
      onBusyChange(false);
      onUnsavedChange(false);
    }, 0);
    return () => window.clearTimeout(reset);
  }, [onBusyChange, onUnsavedChange]);

  return (
    <section className="article-images" aria-labelledby="article-images-title">
      <div className="images-heading">
        <div>
          <p className="eyebrow">ARTICLE IMAGES</p>
          <h3 id="article-images-title">記事の画像（端末保存）</h3>
          <p>新しい画像ファイルはAASのSupabase Storageへアップロードせず、スマホまたはPCへ保存します。</p>
        </div>
        <div className="image-actions">
          <button type="button" className="secondary-action" onClick={() => void refresh()} disabled={loading}>過去のクラウド画像を確認</button>
          <a className="primary-action" href="/images">画像生成プロンプトを作る</a>
        </div>
      </div>

      <p className="panel-muted">
        画像生成画面では、記事タイトルから「記事タイトル_アイキャッチ.png」「記事タイトル_挿絵01.png」のような推奨ファイル名を自動作成します。画像本体をAASへ保存しないため、Supabase Storage容量を消費しません。
      </p>

      {error && <p className="library-notice error" role="alert">{error}</p>}
      {loading && <p role="status">過去のクラウド画像を確認しています…</p>}

      {!loading && !assets.length && (
        <div className="images-empty">
          <span aria-hidden="true">▧</span>
          <h4>クラウド保存画像はありません</h4>
          <p>現在の端末保存方針では正常です。完成画像は推奨ファイル名を使ってスマホまたはPCへ保存してください。</p>
        </div>
      )}

      {!loading && assets.length > 0 && (
        <section className="image-comparison">
          <h4>過去のクラウド画像</h4>
          <p>以前に保存された画像は互換性・復旧のため削除せず保持しています。PWAからの新規アップロード・差し替えは現在停止しています。</p>
          <ul>
            {[...assets].sort((a, b) => a.sortOrder - b.sortOrder).map((asset, index) => (
              <li key={asset.id}>
                <strong>{asset.assetType === "cover" ? "アイキャッチ" : `挿絵 ${index + 1}`}</strong>
                {` · ${asset.originalFilename} · ${STATUS[asset.status]}`}
                {asset.insertionMarker ? ` · ${asset.insertionMarker}` : ""}
                <br />
                {asset.altText || "代替テキストなし"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
