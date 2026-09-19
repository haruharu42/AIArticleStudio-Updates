"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  articlePresetFromDraft,
  createArticlePreset,
  deleteArticlePreset,
  loadArticlePresets,
  setDefaultArticlePreset,
  updateArticlePreset,
  type ArticlePreset,
} from "@/lib/article-presets";
import { parseArticleTags } from "@/lib/article-create-draft";
import type { ArticleCreationDraft } from "@/lib/phase11-create";
import { getSupabaseClient } from "@/lib/supabase";

export function ArticlePresetPanel({
  ownerId,
  draft,
  tagsText,
  activePresetId,
  autoApplyDefault,
  onApply,
  onActivePresetChange,
  setMessage,
}: {
  ownerId: string;
  draft: ArticleCreationDraft;
  tagsText: string;
  activePresetId: string | null;
  autoApplyDefault: boolean;
  onApply: (preset: ArticlePreset) => void;
  onActivePresetChange: (presetId: string | null) => void;
  setMessage: (value: string) => void;
}) {
  const [presets, setPresets] = useState<ArticlePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const autoAppliedRef = useRef(false);

  const activePreset = useMemo(
    () => presets.find((preset) => preset.id === activePresetId) ?? null,
    [presets, activePresetId],
  );

  const reload = async () => {
    const next = await loadArticlePresets(getSupabaseClient(), ownerId);
    setPresets(next);
    return next;
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const next = await loadArticlePresets(getSupabaseClient(), ownerId);
        if (!active) return;
        setPresets(next);
        setLoaded(true);
        if (autoApplyDefault && !autoAppliedRef.current) {
          const defaultPreset = next.find((preset) => preset.isDefault);
          if (defaultPreset) {
            autoAppliedRef.current = true;
            onApply(defaultPreset);
            onActivePresetChange(defaultPreset.id);
            setMessage(`既定プリセット「${defaultPreset.name}」を適用しました。`);
          }
        }
      } catch (error) {
        if (active) {
          setLoaded(true);
          setMessage(error instanceof Error ? error.message : "記事プリセットを読み込めませんでした。");
        }
      }
    };
    void boot();
    return () => { active = false; };
  }, [ownerId, autoApplyDefault, onApply, onActivePresetChange, setMessage]);

  const apply = (preset: ArticlePreset) => {
    onApply(preset);
    onActivePresetChange(preset.id);
    setMessage(`プリセット「${preset.name}」を適用しました。`);
  };

  const saveNew = async () => {
    const cleanName = presetName.trim();
    if (!cleanName) {
      setMessage("プリセット名を入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await createArticlePreset(
        getSupabaseClient(),
        ownerId,
        articlePresetFromDraft(
          cleanName,
          draft,
          parseArticleTags(tagsText),
          saveAsDefault,
        ),
      );
      const next = await reload();
      setPresetName("");
      setSaveAsDefault(false);
      onActivePresetChange(created.id);
      setMessage(`プリセット「${created.name}」を保存しました。現在 ${next.length}件です。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事プリセットを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const overwrite = async () => {
    if (!activePreset) return;
    setBusy(true);
    setMessage("");
    try {
      await updateArticlePreset(
        getSupabaseClient(),
        ownerId,
        activePreset.id,
        articlePresetFromDraft(
          activePreset.name,
          draft,
          parseArticleTags(tagsText),
          activePreset.isDefault,
        ),
      );
      await reload();
      setMessage(`プリセット「${activePreset.name}」を現在の設定で更新しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事プリセットを更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (preset: ArticlePreset) => {
    setBusy(true);
    setMessage("");
    try {
      await setDefaultArticlePreset(getSupabaseClient(), ownerId, preset.id);
      await reload();
      setMessage(`「${preset.name}」を新規記事の既定プリセットにしました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "既定プリセットを変更できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (preset: ArticlePreset) => {
    if (!window.confirm(`プリセット「${preset.name}」を削除しますか？`)) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteArticlePreset(getSupabaseClient(), ownerId, preset.id);
      await reload();
      if (activePresetId === preset.id) onActivePresetChange(null);
      setMessage(`プリセット「${preset.name}」を削除しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "記事プリセットを削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="article-preset-panel" aria-label="記事プリセット">
      <div className="article-preset-head">
        <div>
          <p className="eyebrow">MY PRESETS</p>
          <h2>いつものnote設定</h2>
          <p>ジャンル・読者・文字数・画像・タグなどをまとめて呼び出せます。</p>
        </div>
        <span className="article-preset-count">{loaded ? `${presets.length}/30` : "読込中…"}</span>
      </div>

      {presets.length > 0 ? (
        <div className="article-preset-list">
          {presets.map((preset) => (
            <article key={preset.id} className={activePresetId === preset.id ? "active" : ""}>
              <button type="button" className="article-preset-main" disabled={busy} onClick={() => apply(preset)}>
                <span>
                  {preset.isDefault && <em>既定</em>}
                  {preset.usageCount > 0 && <em>使用 {preset.usageCount}回</em>}
                </span>
                <strong>{preset.name}</strong>
                <small>
                  {preset.publicationTarget} / {preset.genre} / {preset.subgenre} / {preset.articleType === "paid" ? "有料" : "無料"} / 約{preset.targetLength.toLocaleString("ja-JP")}文字
                </small>
              </button>
              <div className="article-preset-item-actions">
                {!preset.isDefault && (
                  <button type="button" disabled={busy} onClick={() => void makeDefault(preset)}>既定にする</button>
                )}
                <button type="button" disabled={busy} onClick={() => void remove(preset)}>削除</button>
              </div>
            </article>
          ))}
        </div>
      ) : loaded ? (
        <p className="article-preset-empty">まだプリセットはありません。下の「現在の設定を保存」から作成できます。</p>
      ) : null}

      <div className="article-preset-save">
        <label>
          <span>プリセット名</span>
          <input
            value={presetName}
            onChange={(event) => setPresetName(event.target.value.slice(0, 60))}
            placeholder="例：AI副業・30代初心者向け"
          />
        </label>
        <label className="article-preset-default">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(event) => setSaveAsDefault(event.target.checked)}
          />
          <span>新規記事の既定にする</span>
        </label>
        <div className="article-preset-save-actions">
          <button type="button" disabled={busy || !presetName.trim()} onClick={() => void saveNew()}>
            現在の設定を保存
          </button>
          {activePreset && (
            <button type="button" disabled={busy} onClick={() => void overwrite()}>
              「{activePreset.name}」を上書き
            </button>
          )}
        </div>
      </div>

      <p className="article-preset-learning-note">
        あなた向け最適化がONの場合、保存した記事の掲載先・ジャンル・サブジャンル・読者層・文字数・プリセット利用傾向を集計し、次回のプロンプト最適化に使います。記事本文やAI回答全文は学習用プロフィールには保存しません。
      </p>
    </section>
  );
}
