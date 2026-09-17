"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ArticleAiTools } from "@/components/article-ai-tools";
import { Phase8Images } from "@/components/phase8-images";
import { articleExportFilename, articleExportMarkdown } from "@/lib/article-export";
import {
  duplicateCloudArticle,
  EMPTY_NOTE_MAGAZINE,
  listArticleLibraryPage,
  noteMagazineFromWorkspace,
  withNoteMagazineWorkspace,
  type ArticleLibraryItem,
  type ArticleLibrarySort,
  type NoteMagazineRole,
  type NoteMagazineSettings,
  type NoteMagazineType,
} from "@/lib/article-library-v2";
import {
  ArticleLibraryError,
  articleLibraryMessage,
  buildCompatibleWorkspacePatch,
  deleteCloudArticle,
  getCloudArticleDetail,
  updateCloudArticle,
  type ArticleDetail,
  type ArticlePatch,
  type ArticleStatus,
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
  magazineEnabled: boolean;
  magazineName: string;
  magazineType: NoteMagazineType;
  seriesName: string;
  seriesOrder: string;
  magazineRole: NoteMagazineRole;
};

type LibraryFilters = {
  query: string;
  status: ArticleStatus | "";
  publicationTarget: string;
  articleType: "free" | "paid" | "";
  genre: string;
  subgenre: string;
  magazineName: string;
  sort: ArticleLibrarySort;
};

const PAGE_SIZE = 50;

const DEFAULT_FILTERS: LibraryFilters = {
  query: "",
  status: "",
  publicationTarget: "",
  articleType: "",
  genre: "",
  subgenre: "",
  magazineName: "",
  sort: "updated_desc",
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

const MAGAZINE_TYPE_LABELS: Record<NoteMagazineType, string> = {
  free: "無料マガジン",
  paid: "有料マガジン",
  mixed: "無料・有料混在",
};

const MAGAZINE_ROLE_LABELS: Record<NoteMagazineRole, string> = {
  intro: "導入記事",
  standard: "通常記事",
  summary: "まとめ記事",
  bonus: "特典・補足記事",
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

function isDesktopBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function valuesFrom(detail: ArticleDetail): EditValues {
  const magazine = noteMagazineFromWorkspace(detail.workspace.workspaceJson);
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
    magazineEnabled: magazine.enabled,
    magazineName: magazine.name,
    magazineType: magazine.type,
    seriesName: magazine.seriesName,
    seriesOrder: magazine.order === null ? "" : String(magazine.order),
    magazineRole: magazine.role,
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
  return <div className="library-notice success" role="status">{message}</div>;
}

function EmptyLibrary({ reload, filtered }: { reload: () => Promise<void>; filtered: boolean }) {
  return (
    <section className="library-empty">
      <span aria-hidden="true">▤</span>
      <h2>{filtered ? "条件に一致する記事がありません" : "クラウド記事はまだありません"}</h2>
      <p>
        {filtered
          ? "絞り込み条件を変更するか、条件をリセットしてください。"
          : "Windows版またはPWAで作成・同期した記事がここに表示されます。"}
      </p>
      <button className="secondary-action" type="button" onClick={() => void reload()}>
        一覧を更新
      </button>
    </section>
  );
}

function ArticleList({ articles, onOpen }: { articles: ArticleLibraryItem[]; onOpen: (id: string) => Promise<void> }) {
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
              {article.subgenre ? ` / ${article.subgenre}` : ""}
            </small>
            {article.magazineEnabled && article.magazineName && (
              <small>noteマガジン: {article.magazineName}{article.seriesOrder !== null ? ` · #${article.seriesOrder}` : ""}</small>
            )}
          </span>
          <span className={`article-status status-${article.status}`}>{STATUS_LABELS[article.status]}</span>
          <span className="article-date"><small>更新</small>{formatDate(article.updatedAt)}</span>
          <span className="row-arrow" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

function ArticleDetailView({
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
  onDuplicate: () => Promise<void>;
  onArchiveToggle: () => Promise<void>;
  onDownload: () => void;
  onDelete: () => Promise<void>;
  images: ReactNode;
  aiTools: ReactNode;
}) {
  const magazine = noteMagazineFromWorkspace(detail.workspace.workspaceJson);
  return (
    <>
      <div className="library-toolbar detail-toolbar">
        <button className="back-action" type="button" onClick={onBack} disabled={busy}>← 一覧へ</button>
        <div>
          {desktopDownloads && <button className="secondary-action" type="button" onClick={onDownload} disabled={busy}>PCへMarkdown保存</button>}
          <button className="secondary-action" type="button" onClick={() => void onDuplicate()} disabled={busy}>複製</button>
          <button className="secondary-action" type="button" onClick={() => void onArchiveToggle()} disabled={busy}>
            {detail.status === "archived" ? "アーカイブから戻す" : "アーカイブ"}
          </button>
          <button className="secondary-action" type="button" onClick={onEdit} disabled={busy}>編集</button>
          <button className="danger-action" type="button" onClick={() => void onDelete()} disabled={busy}>削除</button>
        </div>
      </div>

      <article className="article-detail">
        <header>
          <div className="detail-badges">
            <span>{detail.publicationTarget}</span>
            <span>{detail.articleType === "paid" ? `有料 ¥${detail.price ?? 0}` : "無料"}</span>
            <span>{STATUS_LABELS[detail.status]}</span>
            {magazine.enabled && <span>noteマガジン</span>}
          </div>
          <h2>{detail.title || "無題の記事"}</h2>
          <p>更新 {formatDate(detail.updatedAt)} · revision {detail.revision}</p>
        </header>

        <dl className="detail-meta">
          <div><dt>ジャンル</dt><dd>{detail.genre || "—"}</dd></div>
          <div><dt>サブジャンル</dt><dd>{detail.subgenre || "—"}</dd></div>
          <div><dt>タグ</dt><dd>{detail.tags.length ? detail.tags.join(" / ") : "—"}</dd></div>
          <div><dt>作成日時</dt><dd>{formatDate(detail.createdAt)}</dd></div>
          {magazine.enabled && <>
            <div><dt>マガジン名</dt><dd>{magazine.name || "—"}</dd></div>
            <div><dt>マガジン種別</dt><dd>{MAGAZINE_TYPE_LABELS[magazine.type]}</dd></div>
            <div><dt>シリーズ</dt><dd>{magazine.seriesName || "—"}</dd></div>
            <div><dt>順番 / 役割</dt><dd>{magazine.order ?? "—"} / {MAGAZINE_ROLE_LABELS[magazine.role]}</dd></div>
          </>}
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
  return <section className="body-section"><h3>{title}</h3><pre>{value || "（本文なし）"}</pre></section>;
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
  onSave: (
    article: ArticlePatch,
    sourceBody: string | null,
    publishBody: string | null,
    magazine: NoteMagazineSettings,
  ) => Promise<void>;
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
      if (!/^\d+$/.test(values.price)) { setValidation("有料記事の価格は0以上の整数で入力してください。"); return; }
      price = Number(values.price);
      if (!Number.isSafeInteger(price)) { setValidation("価格が大きすぎます。"); return; }
    }
    const tags = values.tags.split(/[,、\n]/).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 50) { setValidation("タグは50件以内です。"); return; }

    let order: number | null = null;
    if (values.seriesOrder.trim()) {
      if (!/^\d{1,4}$/.test(values.seriesOrder.trim())) {
        setValidation("マガジン内の順番は0〜9999の整数で入力してください。");
        return;
      }
      order = Number(values.seriesOrder.trim());
    }
    const magazine: NoteMagazineSettings = values.publicationTarget.trim() === "note"
      ? {
          enabled: values.magazineEnabled,
          name: values.magazineName,
          type: values.magazineType,
          seriesName: values.seriesName,
          order,
          role: values.magazineRole,
        }
      : { ...EMPTY_NOTE_MAGAZINE };
    if (magazine.enabled && !magazine.name.trim()) {
      setValidation("マガジンをONにする場合はマガジン名を入力してください。");
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
      magazine,
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
        <label className="editor-field full"><span>タイトル</span><input value={values.title} maxLength={500} onChange={(event) => change("title", event.target.value)} /></label>
        <label className="editor-field"><span>掲載先</span><input value={values.publicationTarget} maxLength={50} pattern="[a-z][a-z0-9_-]{0,49}" onChange={(event) => change("publicationTarget", event.target.value)} /></label>
        <label className="editor-field"><span>種別</span><select value={values.articleType} onChange={(event) => change("articleType", event.target.value as "free" | "paid")}><option value="free">無料</option><option value="paid">有料</option></select></label>
        {values.articleType === "paid" && <label className="editor-field"><span>価格（円）</span><input inputMode="numeric" value={values.price} onChange={(event) => change("price", event.target.value)} /></label>}
        <label className="editor-field"><span>状態</span><select value={values.status} onChange={(event) => change("status", event.target.value as ArticleStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="editor-field"><span>ジャンル</span><input value={values.genre} maxLength={200} onChange={(event) => change("genre", event.target.value)} /></label>
        <label className="editor-field"><span>サブジャンル</span><input value={values.subgenre} maxLength={200} onChange={(event) => change("subgenre", event.target.value)} /></label>
        <label className="editor-field full"><span>タグ（カンマ区切り）</span><input value={values.tags} onChange={(event) => change("tags", event.target.value)} /></label>

        {values.publicationTarget.trim() === "note" && <>
          <label className="choice-card compact full"><input type="checkbox" checked={values.magazineEnabled} onChange={(event) => change("magazineEnabled", event.target.checked)} /><span><strong>noteマガジン用の記事として管理する</strong><small>AAS内の整理用設定です。noteへの自動登録は行いません。</small></span></label>
          {values.magazineEnabled && <>
            <label className="editor-field full"><span>マガジン名</span><input value={values.magazineName} maxLength={200} onChange={(event) => change("magazineName", event.target.value)} placeholder="例：AI副業初心者ロードマップ" /></label>
            <label className="editor-field"><span>マガジン種別</span><select value={values.magazineType} onChange={(event) => change("magazineType", event.target.value as NoteMagazineType)}><option value="free">無料マガジン</option><option value="paid">有料マガジン</option><option value="mixed">無料・有料混在</option></select></label>
            <label className="editor-field"><span>記事の役割</span><select value={values.magazineRole} onChange={(event) => change("magazineRole", event.target.value as NoteMagazineRole)}><option value="intro">導入記事</option><option value="standard">通常記事</option><option value="summary">まとめ記事</option><option value="bonus">特典・補足記事</option></select></label>
            <label className="editor-field"><span>シリーズ名</span><input value={values.seriesName} maxLength={200} onChange={(event) => change("seriesName", event.target.value)} placeholder="任意" /></label>
            <label className="editor-field"><span>マガジン内の順番</span><input inputMode="numeric" value={values.seriesOrder} onChange={(event) => change("seriesOrder", event.target.value)} placeholder="例：1" /></label>
          </>}
        </>}

        <EditorTextArea label="完成本文" value={values.body} onChange={(value) => change("body", value)} />
        <EditorTextArea label="掲載用本文" value={values.publishBody} onChange={(value) => change("publishBody", value)} />
        <EditorTextArea label="元記事" value={values.sourceBody} onChange={(value) => change("sourceBody", value)} />
      </div>
    </form>
  );
}

function EditorTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="editor-field full"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function statusFromArchiveWorkspace(detail: ArticleDetail): ArticleStatus {
  const candidate = detail.workspace.workspaceJson.pwa_archive_previous_status;
  if (candidate === "draft" || candidate === "writing" || candidate === "ready" || candidate === "waiting_publish" || candidate === "published" || candidate === "on_hold") return candidate;
  return "draft";
}

function articlePatchFromDetail(detail: ArticleDetail, status: ArticleStatus): ArticlePatch {
  return {
    title: detail.title,
    publication_target: detail.publicationTarget,
    article_type: detail.articleType,
    genre: detail.genre,
    subgenre: detail.subgenre,
    body: detail.body,
    status,
    price: detail.price,
    tags: detail.tags,
  };
}

export function Phase7Library({
  client,
  ownerId,
  onUnsavedChange,
  onBusyChange,
}: {
  client: SupabaseClient;
  ownerId: string;
  onUnsavedChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageUnsaved, setImageUnsaved] = useState(false);
  const [view, setView] = useState<LibraryView>("list");
  const [articles, setArticles] = useState<ArticleLibraryItem[]>([]);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [desktopDownloads, setDesktopDownloads] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDesktopDownloads(isDesktopBrowser()), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => { onUnsavedChange?.(imageUnsaved); return () => onUnsavedChange?.(false); }, [imageUnsaved, onUnsavedChange]);
  useEffect(() => { onBusyChange?.(imageBusy || busy); return () => onBusyChange?.(false); }, [busy, imageBusy, onBusyChange]);

  const leaveImages = () => !imageBusy && (!imageUnsaved || window.confirm("未保存の画像情報を破棄して移動しますか？"));

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const page = await listArticleLibraryPage(client, ownerId, {
        ...filters,
        limit: PAGE_SIZE,
        offset,
      });
      setArticles((current) => append ? [...current, ...page.items] : page.items);
      setTotalCount(page.totalCount);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(articleLibraryMessage(caught));
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [client, filters, ownerId]);

  const reload = useCallback(async () => { await fetchPage(0, false); }, [fetchPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void reload(), 250);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  const loadedGenres = useMemo(() => [...new Set(articles.map((article) => article.genre).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ja")), [articles]);
  const loadedSubgenres = useMemo(() => [...new Set(articles.map((article) => article.subgenre).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ja")), [articles]);
  const loadedMagazines = useMemo(() => [...new Set(articles.map((article) => article.magazineName).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ja")), [articles]);
  const filtersActive = Object.entries(filters).some(([key, value]) => key === "sort" ? value !== "updated_desc" : Boolean(value));

  const changeFilter = <Key extends keyof LibraryFilters>(key: Key, value: LibraryFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const open = async (articleId: string) => {
    setLoading(true); setError(""); setSuccess("");
    try {
      setDetail(await getCloudArticleDetail(client, ownerId, articleId));
      setView("detail");
    } catch (caught) { setError(articleLibraryMessage(caught)); }
    finally { setLoading(false); }
  };

  const save = async (
    article: ArticlePatch,
    sourceBody: string | null,
    publishBody: string | null,
    magazine: NoteMagazineSettings,
  ) => {
    if (!detail || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const workspacePatch = buildCompatibleWorkspacePatch(detail, article, sourceBody, publishBody);
      workspacePatch.workspace_json = withNoteMagazineWorkspace(workspacePatch.workspace_json, magazine);
      const updated = await updateCloudArticle(client, ownerId, detail.id, detail.revision, article, workspacePatch);
      setDetail(updated);
      setView("detail");
      setSuccess("記事とnoteマガジン設定を保存しました。");
      await reload();
    } catch (caught) {
      setError(articleLibraryMessage(caught));
      if (caught instanceof ArticleLibraryError && caught.category === "conflict") setView("edit");
    } finally { setBusy(false); }
  };

  const duplicate = async () => {
    if (!detail || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const id = await duplicateCloudArticle(client, ownerId, detail);
      setSuccess("記事を複製しました。複製記事は下書きとして作成されています。");
      await reload();
      await open(id);
    } catch (caught) { setError(articleLibraryMessage(caught)); }
    finally { setBusy(false); }
  };

  const archiveToggle = async () => {
    if (!detail || busy) return;
    const nextStatus = detail.status === "archived" ? statusFromArchiveWorkspace(detail) : "archived";
    setBusy(true); setError(""); setSuccess("");
    try {
      const article = articlePatchFromDetail(detail, nextStatus);
      const workspacePatch = buildCompatibleWorkspacePatch(detail, article, detail.workspace.sourceBody, detail.workspace.publishBody);
      workspacePatch.workspace_json = {
        ...workspacePatch.workspace_json,
        pwa_archive_previous_status: detail.status === "archived" ? null : detail.status,
      };
      const updated = await updateCloudArticle(client, ownerId, detail.id, detail.revision, article, workspacePatch);
      setDetail(updated);
      setSuccess(nextStatus === "archived" ? "記事をアーカイブしました。" : "記事をアーカイブから戻しました。");
      await reload();
    } catch (caught) { setError(articleLibraryMessage(caught)); }
    finally { setBusy(false); }
  };

  const downloadCurrent = () => {
    if (!detail || !desktopDownloads) return;
    const blob = new Blob([articleExportMarkdown(detail)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = articleExportFilename(detail);
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setSuccess("記事をPCへMarkdown保存しました。");
  };

  const remove = async () => {
    if (!detail || busy || imageBusy || !leaveImages()) return;
    const confirmed = window.confirm(`「${detail.title || "無題の記事"}」を完全削除しますか？\n\nこの操作は元に戻せません。通常は先にアーカイブすることをおすすめします。`);
    if (!confirmed) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await deleteCloudArticle(client, ownerId, detail.id, detail.revision);
      setDetail(null); setView("list"); setSuccess("記事を完全削除しました。");
      await reload();
    } catch (caught) { setError(articleLibraryMessage(caught)); }
    finally { setBusy(false); }
  };

  const back = () => {
    if (!leaveImages()) return;
    setView("list"); setDetail(null); setError("");
  };

  return (
    <section className="library-page" aria-labelledby="library-title">
      <header className="library-head">
        <div>
          <p className="eyebrow">ARTICLE LIBRARY 2.0</p>
          <h1 id="library-title">記事ライブラリ</h1>
          <p>本文を一覧取得せず、必要な記事だけ開く軽量な管理画面です。noteマガジン管理にも対応しています。</p>
        </div>
        <span className="access-badge">● RLSでユーザー分離</span>
      </header>

      {error && <ErrorNotice message={error} />}
      {success && <SuccessNotice message={success} />}

      {view === "list" && <>
        <div className="editor-card">
          <label className="editor-field full"><span>検索</span><input value={filters.query} onChange={(event) => changeFilter("query", event.target.value)} placeholder="タイトル・ジャンル・タグ・マガジン・シリーズ" /></label>
          <label className="editor-field"><span>状態</span><select value={filters.status} onChange={(event) => changeFilter("status", event.target.value as ArticleStatus | "")}><option value="">すべて</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="editor-field"><span>掲載先</span><select value={filters.publicationTarget} onChange={(event) => changeFilter("publicationTarget", event.target.value)}><option value="">すべて</option><option value="note">note</option><option value="tips">Tips</option><option value="brain">Brain</option><option value="blog">ブログ</option></select></label>
          <label className="editor-field"><span>無料 / 有料</span><select value={filters.articleType} onChange={(event) => changeFilter("articleType", event.target.value as "free" | "paid" | "")}><option value="">すべて</option><option value="free">無料</option><option value="paid">有料</option></select></label>
          <label className="editor-field"><span>ジャンル</span><input list="library-genres" value={filters.genre} onChange={(event) => changeFilter("genre", event.target.value)} placeholder="完全一致 / 空欄ですべて" /><datalist id="library-genres">{loadedGenres.map((value) => <option key={value} value={value} />)}</datalist></label>
          <label className="editor-field"><span>サブジャンル</span><input list="library-subgenres" value={filters.subgenre} onChange={(event) => changeFilter("subgenre", event.target.value)} placeholder="完全一致 / 空欄ですべて" /><datalist id="library-subgenres">{loadedSubgenres.map((value) => <option key={value} value={value} />)}</datalist></label>
          <label className="editor-field"><span>noteマガジン</span><input list="library-magazines" value={filters.magazineName} onChange={(event) => changeFilter("magazineName", event.target.value)} placeholder="マガジン名 / 空欄ですべて" /><datalist id="library-magazines">{loadedMagazines.map((value) => <option key={value} value={value} />)}</datalist></label>
          <label className="editor-field"><span>並び替え</span><select value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value as ArticleLibrarySort)}><option value="updated_desc">更新が新しい順</option><option value="updated_asc">更新が古い順</option><option value="created_desc">作成が新しい順</option><option value="created_asc">作成が古い順</option><option value="title_asc">タイトル順</option><option value="status_asc">状態順</option><option value="genre_asc">ジャンル順</option><option value="subgenre_asc">サブジャンル順</option><option value="magazine_asc">マガジン順</option></select></label>
          <div className="wizard-actions full"><button className="secondary-action" type="button" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={!filtersActive}>条件をリセット</button><button className="secondary-action" type="button" onClick={() => void reload()} disabled={loading}>一覧を更新</button>{desktopDownloads && <a className="secondary-action" href="/export">PC一括保存へ</a>}</div>
        </div>

        <div className="library-toolbar"><span>{articles.length} / {totalCount} 件を表示</span><small>一覧は本文なし・最大{PAGE_SIZE}件ずつ取得</small></div>
        {loading ? (
          <div className="library-loading" role="status"><span className="spinner" />記事を読み込んでいます…</div>
        ) : articles.length === 0 && !error ? (
          <EmptyLibrary reload={reload} filtered={filtersActive} />
        ) : (
          <>
            <ArticleList articles={articles} onOpen={open} />
            {hasMore && <div className="image-save"><span>残り {Math.max(0, totalCount - articles.length)} 件</span><button className="secondary-action" type="button" disabled={loadingMore} onClick={() => void fetchPage(articles.length, true)}>{loadingMore ? "読み込み中…" : `さらに${PAGE_SIZE}件読み込む`}</button></div>}
          </>
        )}
      </>}

      {view === "detail" && detail && (
        <ArticleDetailView
          detail={detail}
          busy={busy || imageBusy}
          desktopDownloads={desktopDownloads}
          onBack={back}
          onEdit={() => { if (leaveImages()) setView("edit"); }}
          onDuplicate={duplicate}
          onArchiveToggle={archiveToggle}
          onDownload={downloadCurrent}
          onDelete={remove}
          images={<Phase8Images key={detail.id} client={client} ownerId={ownerId} articleId={detail.id} revision={detail.revision} onBusyChange={setImageBusy} onUnsavedChange={setImageUnsaved} />}
          aiTools={<ArticleAiTools key={`${detail.id}:${detail.revision}`} client={client} input={{ title: detail.title, publicationTarget: detail.publicationTarget, articleType: detail.articleType, genre: detail.genre, subgenre: detail.subgenre, body: detail.body }} />}
        />
      )}

      {view === "edit" && detail && <Editor key={`${detail.id}:${detail.revision}`} detail={detail} busy={busy} onCancel={() => setView("detail")} onSave={save} />}
    </section>
  );
}
