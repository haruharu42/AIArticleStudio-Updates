"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ArticleLibraryError,
  articleLibraryMessage,
  buildCompatibleWorkspacePatch,
  deleteCloudArticle,
  getCloudArticleDetail,
  listCloudArticles,
  updateCloudArticle,
  type ArticleDetail,
  type ArticlePatch,
  type ArticleStatus,
  type ArticleSummary,
} from "@/lib/phase7-articles";

type LibraryView = "list" | "detail" | "edit";

type EditValues = {
  title: string;
  publicationTarget: string;
  articleType: "free" | "paid";
  genre: string;
  subgenre: string;
  status: ArticleStatus;
  price: string;
  tags: string;
  body: string;
  sourceBody: string;
  publishBody: string;
};

const STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: "下書き",
  writing: "執筆中",
  ready: "完成",
  waiting_publish: "公開待ち",
  published: "公開済み",
  on_hold: "保留",
  archived: "アーカイブ",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function valuesFrom(detail: ArticleDetail): EditValues {
  return {
    title: detail.title,
    publicationTarget: detail.publicationTarget,
    articleType: detail.articleType,
    genre: detail.genre ?? "",
    subgenre: detail.subgenre ?? "",
    status: detail.status,
    price: detail.price === null ? "" : String(detail.price),
    tags: detail.tags.join(", "),
    body: detail.body,
    sourceBody: detail.workspace.sourceBody ?? "",
    publishBody: detail.workspace.publishBody ?? "",
  };
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="library-notice error" role="alert">
      <strong>処理を完了できませんでした</strong>
      <span>{message}</span>
    </div>
  );
}

function SuccessNotice({ message }: { message: string }) {
  return (
    <div className="library-notice success" role="status">
      {message}
    </div>
  );
}

function EmptyLibrary({ reload }: { reload: () => Promise<void> }) {
  return (
    <section className="library-empty">
      <span aria-hidden="true">▤</span>
      <h2>クラウド記事はまだありません</h2>
      <p>
        Windows版でクラウド同期した記事がここに表示されます。既存のローカル記事が
        自動で移行されることはありません。
      </p>
      <button className="secondary-action" type="button" onClick={() => void reload()}>
        一覧を更新
      </button>
    </section>
  );
}

function ArticleList({
  articles,
  onOpen,
}: {
  articles: ArticleSummary[];
  onOpen: (id: string) => Promise<void>;
}) {
  return (
    <div className="article-list" role="list">
      {articles.map((article) => (
        <button
          className="article-row"
          key={article.id}
          type="button"
          role="listitem"
          onClick={() => void onOpen(article.id)}
        >
          <span className="article-main">
            <strong>{article.title || "無題の記事"}</strong>
            <small>
              {article.publicationTarget} · {article.articleType === "paid" ? "有料" : "無料"}
              {article.genre ? ` · ${article.genre}` : ""}
            </small>
          </span>
          <span className={`article-status status-${article.status}`}>
            {STATUS_LABELS[article.status]}
          </span>
          <span className="article-date">
            <small>更新</small>
            {formatDate(article.updatedAt)}
          </span>
          <span className="row-arrow" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

function ArticleDetailView({
  detail,
  busy,
  onBack,
  onEdit,
  onDelete,
}: {
  detail: ArticleDetail;
  busy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <>
      <div className="library-toolbar detail-toolbar">
        <button className="back-action" type="button" onClick={onBack} disabled={busy}>← 一覧へ</button>
        <div>
          <button className="secondary-action" type="button" onClick={onEdit} disabled={busy}>編集</button>
          <button className="danger-action" type="button" onClick={() => void onDelete()} disabled={busy}>
            {busy ? "削除中…" : "削除"}
          </button>
        </div>
      </div>

      <article className="article-detail">
        <header>
          <div className="detail-badges">
            <span>{detail.publicationTarget}</span>
            <span>{detail.articleType === "paid" ? `有料 ¥${detail.price ?? 0}` : "無料"}</span>
            <span>{STATUS_LABELS[detail.status]}</span>
          </div>
          <h2>{detail.title || "無題の記事"}</h2>
          <p>更新 {formatDate(detail.updatedAt)} · revision {detail.revision}</p>
        </header>

        <dl className="detail-meta">
          <div><dt>ジャンル</dt><dd>{detail.genre || "—"}</dd></div>
          <div><dt>サブジャンル</dt><dd>{detail.subgenre || "—"}</dd></div>
          <div><dt>タグ</dt><dd>{detail.tags.length ? detail.tags.join(" / ") : "—"}</dd></div>
          <div><dt>作成日時</dt><dd>{formatDate(detail.createdAt)}</dd></div>
        </dl>

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

function Editor({
  detail,
  busy,
  onCancel,
  onSave,
}: {
  detail: ArticleDetail;
  busy: boolean;
  onCancel: () => void;
  onSave: (article: ArticlePatch, sourceBody: string | null, publishBody: string | null) => Promise<void>;
}) {
  const [values, setValues] = useState<EditValues>(() => valuesFrom(detail));
  const [validation, setValidation] = useState("");

  const change = <Key extends keyof EditValues>(key: Key, value: EditValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidation("");
    let price: number | null = null;
    if (values.articleType === "paid") {
      if (!/^\d+$/.test(values.price)) {
        setValidation("有料記事の価格は0以上の整数で入力してください。");
        return;
      }
      price = Number(values.price);
      if (!Number.isSafeInteger(price)) {
        setValidation("価格が大きすぎます。");
        return;
      }
    }
    const tags = values.tags
      .split(/[,、\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length > 50) {
      setValidation("タグは50件以内です。");
      return;
    }
    await onSave(
      {
        title: values.title,
        publication_target: values.publicationTarget.trim(),
        article_type: values.articleType,
        genre: values.genre.trim() || null,
        subgenre: values.subgenre.trim() || null,
        body: values.body,
        status: values.status,
        price,
        tags,
      },
      values.sourceBody || null,
      values.publishBody || null,
    );
  };

  return (
    <form className="article-editor" onSubmit={submit}>
      <div className="library-toolbar detail-toolbar">
        <button className="back-action" type="button" onClick={onCancel} disabled={busy}>← 編集をやめる</button>
        <button className="primary-action" type="submit" disabled={busy}>{busy ? "保存中…" : "変更を保存"}</button>
      </div>
      {validation && <ErrorNotice message={validation} />}
      <div className="editor-card">
        <label className="editor-field full">
          <span>タイトル</span>
          <input value={values.title} maxLength={500} onChange={(event) => change("title", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>掲載先</span>
          <input value={values.publicationTarget} maxLength={50} pattern="[a-z][a-z0-9_-]{0,49}" onChange={(event) => change("publicationTarget", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>種別</span>
          <select value={values.articleType} onChange={(event) => change("articleType", event.target.value as "free" | "paid")}>
            <option value="free">無料</option>
            <option value="paid">有料</option>
          </select>
        </label>
        {values.articleType === "paid" && (
          <label className="editor-field">
            <span>価格（円）</span>
            <input inputMode="numeric" value={values.price} onChange={(event) => change("price", event.target.value)} />
          </label>
        )}
        <label className="editor-field">
          <span>状態</span>
          <select value={values.status} onChange={(event) => change("status", event.target.value as ArticleStatus)}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="editor-field">
          <span>ジャンル</span>
          <input value={values.genre} maxLength={200} onChange={(event) => change("genre", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>サブジャンル</span>
          <input value={values.subgenre} maxLength={200} onChange={(event) => change("subgenre", event.target.value)} />
        </label>
        <label className="editor-field full">
          <span>タグ（カンマ区切り）</span>
          <input value={values.tags} onChange={(event) => change("tags", event.target.value)} />
        </label>
        <EditorTextArea label="完成本文" value={values.body} onChange={(value) => change("body", value)} />
        <EditorTextArea label="掲載用本文" value={values.publishBody} onChange={(value) => change("publishBody", value)} />
        <EditorTextArea label="元記事" value={values.sourceBody} onChange={(value) => change("sourceBody", value)} />
      </div>
    </form>
  );
}

function EditorTextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="editor-field full">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function Phase7Library({
  client,
  ownerId,
}: {
  client: SupabaseClient;
  ownerId: string;
}) {
  const [view, setView] = useState<LibraryView>("list");
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setArticles(await listCloudArticles(client, ownerId));
    } catch (caught) {
      setError(articleLibraryMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [client, ownerId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ja");
    if (!needle) return articles;
    return articles.filter((article) =>
      [article.title, article.genre ?? "", article.subgenre ?? "", ...article.tags]
        .join(" ")
        .toLocaleLowerCase("ja")
        .includes(needle),
    );
  }, [articles, query]);

  const open = async (articleId: string) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      setDetail(await getCloudArticleDetail(client, ownerId, articleId));
      setView("detail");
    } catch (caught) {
      setError(articleLibraryMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const save = async (
    article: ArticlePatch,
    sourceBody: string | null,
    publishBody: string | null,
  ) => {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateCloudArticle(
        client,
        ownerId,
        detail.id,
        detail.revision,
        article,
        buildCompatibleWorkspacePatch(detail, article, sourceBody, publishBody),
      );
      setDetail(updated);
      setView("detail");
      setSuccess("クラウド記事を安全に保存しました。");
      await reload();
    } catch (caught) {
      setError(articleLibraryMessage(caught));
      if (caught instanceof ArticleLibraryError && caught.category === "conflict") {
        setView("edit");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!detail || busy) return;
    const confirmed = window.confirm(
      `「${detail.title || "無題の記事"}」を削除しますか？\n\nクラウド記事と紐づくStorage画像が削除されます。この操作は元に戻せません。`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await deleteCloudArticle(client, ownerId, detail.id, detail.revision);
      setDetail(null);
      setView("list");
      setSuccess("クラウド記事と紐づく画像を削除しました。");
      await reload();
    } catch (caught) {
      setError(articleLibraryMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setView("list");
    setDetail(null);
    setError("");
  };

  return (
    <section className="library-page" aria-labelledby="library-title">
      <header className="library-head">
        <div>
          <p className="eyebrow">COMMON ARTICLE LIBRARY · PHASE 7</p>
          <h1 id="library-title">記事ライブラリ</h1>
          <p>Windows版と同期した自分の記事を、閲覧・編集・削除できます。</p>
        </div>
        <span className="access-badge">● RLSでユーザー分離</span>
      </header>

      {error && <ErrorNotice message={error} />}
      {success && <SuccessNotice message={success} />}

      {view === "list" && (
        <>
          <div className="library-toolbar">
            <label className="library-search">
              <span className="sr-only">記事を検索</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・ジャンル・タグで検索" />
            </label>
            <span>{filtered.length} / {articles.length} 件</span>
            <button className="secondary-action" type="button" onClick={() => void reload()} disabled={loading}>
              {loading ? "更新中…" : "一覧を更新"}
            </button>
          </div>
          {loading ? (
            <div className="library-loading" role="status"><span className="spinner" />記事を読み込んでいます…</div>
          ) : articles.length === 0 && !error ? (
            <EmptyLibrary reload={reload} />
          ) : (
            <ArticleList articles={filtered} onOpen={open} />
          )}
        </>
      )}

      {view === "detail" && detail && (
        <ArticleDetailView detail={detail} busy={busy} onBack={back} onEdit={() => setView("edit")} onDelete={remove} />
      )}

      {view === "edit" && detail && (
        <Editor key={`${detail.id}:${detail.revision}`} detail={detail} busy={busy} onCancel={() => setView("detail")} onSave={save} />
      )}
    </section>
  );
}
