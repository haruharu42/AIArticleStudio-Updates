"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import type { NoteMagazineRole, NoteMagazineSettings, NoteMagazineType } from "@/lib/article-library-v2";
import type { ArticleDetail, ArticlePatch, ArticleStatus } from "@/lib/phase7-articles";
import {
  ARTICLE_STATUS_LABELS,
  articleLibraryEditValuesFromDetail,
  buildArticleLibrarySavePayload,
  type ArticleLibraryEditValues,
} from "@/lib/article-library-view";

export function ArticleLibraryEditor({
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
  const [values, setValues] = useState<ArticleLibraryEditValues>(() => articleLibraryEditValuesFromDetail(detail));
  const [validation, setValidation] = useState("");

  const change = <Key extends keyof ArticleLibraryEditValues>(key: Key, value: ArticleLibraryEditValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidation("");
    const parsed = buildArticleLibrarySavePayload(values);
    if (!parsed.ok) {
      setValidation(parsed.message);
      return;
    }
    await onSave(
      parsed.value.article,
      parsed.value.sourceBody,
      parsed.value.publishBody,
      parsed.value.magazine,
    );
  };

  return (
    <form className="article-editor" onSubmit={submit}>
      <div className="library-toolbar detail-toolbar">
        <button className="back-action" type="button" onClick={onCancel} disabled={busy}>← 編集をやめる</button>
        <button className="primary-action" type="submit" disabled={busy}>{busy ? "保存中…" : "変更を保存"}</button>
      </div>
      {validation && <EditorErrorNotice message={validation} />}
      <div className="editor-card">
        <label className="editor-field full">
          <span>タイトル</span>
          <input value={values.title} maxLength={500} onChange={(event) => change("title", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>掲載先</span>
          <input
            value={values.publicationTarget}
            maxLength={50}
            pattern="[a-z][a-z0-9_-]{0,49}"
            required
            onChange={(event) => change("publicationTarget", event.target.value)}
          />
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
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={values.price}
              onChange={(event) => change("price", event.target.value)}
            />
          </label>
        )}
        <label className="editor-field">
          <span>状態</span>
          <select value={values.status} onChange={(event) => change("status", event.target.value as ArticleStatus)}>
            {Object.entries(ARTICLE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
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

        {values.publicationTarget.trim() === "note" && (
          <>
            <label className="choice-card compact full">
              <input
                type="checkbox"
                checked={values.magazineEnabled}
                onChange={(event) => change("magazineEnabled", event.target.checked)}
              />
              <span>
                <strong>noteマガジン用の記事として管理する</strong>
                <small>AAS内の整理用設定です。noteへの自動登録は行いません。</small>
              </span>
            </label>
            {values.magazineEnabled && (
              <>
                <label className="editor-field full">
                  <span>マガジン名</span>
                  <input
                    value={values.magazineName}
                    maxLength={200}
                    onChange={(event) => change("magazineName", event.target.value)}
                    placeholder="例：AI副業初心者ロードマップ"
                  />
                </label>
                <label className="editor-field">
                  <span>マガジン種別</span>
                  <select value={values.magazineType} onChange={(event) => change("magazineType", event.target.value as NoteMagazineType)}>
                    <option value="free">無料マガジン</option>
                    <option value="paid">有料マガジン</option>
                    <option value="mixed">無料・有料混在</option>
                  </select>
                </label>
                <label className="editor-field">
                  <span>記事の役割</span>
                  <select value={values.magazineRole} onChange={(event) => change("magazineRole", event.target.value as NoteMagazineRole)}>
                    <option value="intro">導入記事</option>
                    <option value="standard">通常記事</option>
                    <option value="summary">まとめ記事</option>
                    <option value="bonus">特典・補足記事</option>
                  </select>
                </label>
                <label className="editor-field">
                  <span>シリーズ名</span>
                  <input
                    value={values.seriesName}
                    maxLength={200}
                    onChange={(event) => change("seriesName", event.target.value)}
                    placeholder="任意"
                  />
                </label>
                <label className="editor-field">
                  <span>マガジン内の順番</span>
                  <input
                    inputMode="numeric"
                    value={values.seriesOrder}
                    onChange={(event) => change("seriesOrder", event.target.value)}
                    placeholder="例：1"
                  />
                </label>
              </>
            )}
          </>
        )}

        <EditorTextArea label="完成本文" value={values.body} onChange={(value) => change("body", value)} />
        <EditorTextArea label="掲載用本文" value={values.publishBody} onChange={(value) => change("publishBody", value)} />
        <EditorTextArea label="元記事" value={values.sourceBody} onChange={(value) => change("sourceBody", value)} />
      </div>
    </form>
  );
}

function EditorTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="editor-field full">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EditorErrorNotice({ message }: { message: string }) {
  return (
    <div className="library-notice error" role="alert">
      <strong>処理を完了できませんでした</strong>
      <span>{message}</span>
    </div>
  );
}
