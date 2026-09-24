"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { NotePostAssistant } from "@/components/article-library/note-post-assistant";
import { noteMagazineFromWorkspace } from "@/lib/article-library-v2";
import { articleExportBody } from "@/lib/article-export";
import { copyNoteRichText } from "@/lib/note-rich-text";
import { publicationBodyForCopy } from "@/lib/phase11-create";
import type { ArticleDetail } from "@/lib/phase7-articles";
import {
  ARTICLE_STATUS_LABELS,
  MAGAZINE_ROLE_LABELS,
  MAGAZINE_TYPE_LABELS,
  formatArticleLibraryDate,
} from "@/lib/article-library-view";

export function ArticleLibraryDetailView({
  detail,
  busy,
  desktopDownloads,
  onBack,
  onEdit,
  onDuplicate,
  onArchiveToggle,
  onDownload,
  onDelete,
  images,
  aiTools,
}: {
  detail: ArticleDetail;
  busy: boolean;
  desktopDownloads: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchiveToggle: () => void;
  onDownload: () => void;
  onDelete: () => void;
  images: ReactNode;
  aiTools: ReactNode;
}) {
  const magazine = noteMagazineFromWorkspace(detail.workspace.workspaceJson);
  const [copyMessage, setCopyMessage] = useState("");
  const publicationBody = publicationBodyForCopy(articleExportBody(detail), detail.title);

  const copyTitle = async () => {
    if (!detail.title.trim()) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(detail.title);
      setCopyMessage("タイトルをコピーしました。");
    } catch {
      setCopyMessage("タイトルを自動コピーできませんでした。タイトルを長押ししてコピーしてください。");
    }
  };

  const copyRichBody = async () => {
    if (!publicationBody) return;
    try {
      await copyNoteRichText(publicationBody);
      setCopyMessage("装飾付き本文をコピーしました。掲載先の本文欄へ貼り付けてください。");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "装飾付き本文をコピーできませんでした。");
    }
  };

  return (
    <>
      <div className="library-toolbar detail-toolbar">
        <button className="back-action" type="button" onClick={onBack} disabled={busy}>← 一覧へ</button>
        <div>
          {desktopDownloads && (
            <button className="secondary-action" type="button" onClick={onDownload} disabled={busy}>PCへMarkdown保存</button>
          )}
          <Link className="secondary-action" href={`/workflow?tab=preflight&article=${encodeURIComponent(detail.id)}`}>公開前チェック</Link>
          <Link className="secondary-action" href={`/workflow?tab=reuse&article=${encodeURIComponent(detail.id)}`}>SNS再利用</Link>
          <button className="secondary-action" type="button" onClick={onDuplicate} disabled={busy}>複製</button>
          <button className="secondary-action" type="button" onClick={onArchiveToggle} disabled={busy}>
            {detail.status === "archived" ? "アーカイブから戻す" : "アーカイブ"}
          </button>
          <button className="secondary-action" type="button" onClick={onEdit} disabled={busy}>編集</button>
          <button className="danger-action" type="button" onClick={onDelete} disabled={busy}>削除</button>
        </div>
      </div>

      <article className="article-detail">
        <header>
          <div className="detail-badges">
            <span>{detail.publicationTarget}</span>
            <span>{detail.articleType === "paid" ? `有料 ¥${detail.price ?? 0}` : "無料"}</span>
            <span>{ARTICLE_STATUS_LABELS[detail.status]}</span>
            {magazine.enabled && <span>noteマガジン</span>}
          </div>
          <h2>{detail.title || "無題の記事"}</h2>
          <p>更新 {formatArticleLibraryDate(detail.updatedAt)} · revision {detail.revision}</p>
        </header>

        <section className="creator-publish-copy library-publish-copy" aria-label="掲載用コピー">
          <h3>掲載用コピー</h3>
          <p className="panel-muted">選択した記事のタイトルと本文を、そのまま掲載先へ貼り付けられます。本文は保存済みの掲載用本文を優先し、なければ完成本文を使用します。</p>
          <div className="openai-prompt-actions">
            <button className="secondary-action" type="button" disabled={busy || !detail.title.trim()} onClick={() => void copyTitle()}>
              タイトルをコピー
            </button>
            <button className="primary-action" type="button" disabled={busy || !publicationBody} onClick={() => void copyRichBody()}>
              完成本文を装飾付きコピー
            </button>
          </div>
          {detail.articleType === "paid" && publicationBody.includes("【ここから有料エリア】") && (
            <p className="beginner-help">有料エリアの位置は「【ここから有料エリア】」の目印として残ります。掲載先で有料ラインを設定後、目印だけ削除してください。</p>
          )}
          {publicationBody.includes("【挿絵") && (
            <p className="beginner-help">挿絵位置は「【挿絵1をここに挿入】」のような目印として残ります。画像を配置後、目印だけ削除してください。</p>
          )}
          {copyMessage && <div className="route-notice" role="status" aria-live="polite">{copyMessage}</div>}
        </section>

        {detail.publicationTarget === "note" && (
          <NotePostAssistant detail={detail} body={articleExportBody(detail)} />
        )}

        <dl className="detail-meta">
          <div><dt>ジャンル</dt><dd>{detail.genre || "—"}</dd></div>
          <div><dt>サブジャンル</dt><dd>{detail.subgenre || "—"}</dd></div>
          <div><dt>タグ</dt><dd>{detail.tags.length ? detail.tags.join(" / ") : "—"}</dd></div>
          <div><dt>作成日時</dt><dd>{formatArticleLibraryDate(detail.createdAt)}</dd></div>
          {magazine.enabled && (
            <>
              <div><dt>マガジン名</dt><dd>{magazine.name || "—"}</dd></div>
              <div><dt>マガジン種別</dt><dd>{MAGAZINE_TYPE_LABELS[magazine.type]}</dd></div>
              <div><dt>シリーズ</dt><dd>{magazine.seriesName || "—"}</dd></div>
              <div><dt>順番 / 役割</dt><dd>{magazine.order ?? "—"} / {MAGAZINE_ROLE_LABELS[magazine.role]}</dd></div>
            </>
          )}
        </dl>

        {images}
        {aiTools}

        <BodySection title="完成本文" value={detail.body} />
        <BodySection title="掲載用本文" value={detail.workspace.publishBody} />
        <BodySection title="元記事" value={detail.workspace.sourceBody} />
      </article>
    </>
  );
}

function BodySection({ title, value }: { title: string; value: string | null }) {
  return (
    <section className="body-section">
      <h3>{title}</h3>
      <pre>{value || "（本文なし）"}</pre>
    </section>
  );
}
