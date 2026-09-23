"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { AI_APP_LINKS, launchAiApp, type AiAppKey } from "@/lib/ai-app-links";
import {
  ACTION_PROMPT_TEMPLATES,
  buildActionPrompt,
  type ActionPromptTemplate,
} from "@/lib/action-prompt-catalog";
import { loadActionPromptCatalog } from "@/lib/action-prompt-service";

const FAVORITES_KEY = "aas-action-prompt-favorites";
const RECENT_KEY = "aas-action-prompt-recent";

function scopedKey(base: string, userId: string): string {
  return userId ? `${base}:${userId}` : base;
}

function readIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function initialValues(template: ActionPromptTemplate): Record<string, string> {
  return Object.fromEntries(template.fields.map((field) => [field.key, ""]));
}

export function ActionPromptLibraryPage() {
  const { state, client } = useSharedAccessState();
  const userId = state.kind === "ready" ? state.profile.id : "";
  const [templates, setTemplates] = useState<ActionPromptTemplate[]>(() => [...ACTION_PROMPT_TEMPLATES]);
  const [category, setCategory] = useState("すべて");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(ACTION_PROMPT_TEMPLATES[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const [values, setValues] = useState<Record<string, string>>(
    () => ACTION_PROMPT_TEMPLATES[0] ? initialValues(ACTION_PROMPT_TEMPLATES[0]) : {},
  );
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId) return;
    const favoriteKey = scopedKey(FAVORITES_KEY, userId);
    const recentKey = scopedKey(RECENT_KEY, userId);
    queueMicrotask(() => {
      setFavorites(readIds(favoriteKey));
      setRecent(readIds(recentKey));
    });
  }, [userId]);

  useEffect(() => {
    if (!client || !userId) return;
    let active = true;

    void loadActionPromptCatalog(client).then(
      (catalog) => {
        if (!active) return;
        const cloudTemplates = catalog.templates.filter((template) => template.status === "active");
        if (!cloudTemplates.length) return;

        setTemplates(cloudTemplates);
        setCategory("すべて");
        setSelectedId(cloudTemplates[0].id);
        setValues(initialValues(cloudTemplates[0]));
      },
      () => {
        // The built-in catalog remains available if cloud retrieval is temporarily unavailable.
      },
    );

    return () => {
      active = false;
    };
  }, [client, userId]);

  const categories = useMemo(
    () => ["すべて", ...Array.from(new Set(templates.map((template) => template.category)))],
    [templates],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (category !== "すべて" && template.category !== category) return false;
      if (favoritesOnly && !favorites.includes(template.id)) return false;
      if (!needle) return true;
      return [template.title, template.category, template.sideHustle, template.description]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [category, favorites, favoritesOnly, query, templates]);

  const prompt = useMemo(
    () => selected ? buildActionPrompt(selected, values) : "",
    [selected, values],
  );

  const selectTemplate = (template: ActionPromptTemplate) => {
    setSelectedId(template.id);
    setValues(initialValues(template));
    setMessage("");
  };

  const persistFavorite = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [...favorites, id];
    setFavorites(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(scopedKey(FAVORITES_KEY, userId), JSON.stringify(next));
    }
  };

  const markRecent = (id: string) => {
    const next = [id, ...recent.filter((item) => item !== id)].slice(0, 5);
    setRecent(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(scopedKey(RECENT_KEY, userId), JSON.stringify(next));
    }
  };

  const copyPrompt = async (openAi?: AiAppKey) => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage(openAi
        ? `プロンプトをコピーして${AI_APP_LINKS[openAi].name}を開きます。`
        : "プロンプトをコピーしました。");
    } catch {
      setMessage("自動コピーできません。下のプロンプト欄からコピーしてください。");
    }
    markRecent(selected.id);
    if (openAi) launchAiApp(openAi);
  };

  if (!selected) return null;

  const recentTemplates = recent
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is ActionPromptTemplate => Boolean(template));

  return (
    <main className="creator-page action-prompt-page">
      <header className="creator-head">
        <div>
          <p className="eyebrow">AI ACTION STUDIO</p>
          <h1>副業プロンプトライブラリ</h1>
          <p>やりたいことを選び、必要な情報だけ入力。完成したプロンプトをコピーしてChatGPT・Claude・Geminiで使えます。</p>
        </div>
        <Link className="route-back" href="/">← ホーム</Link>
      </header>

      <section className="action-prompt-toolbar" aria-label="プロンプト検索">
        <label>
          <span>検索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：note、SNS、YouTube、物販" />
        </label>
        <label>
          <span>用途</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button className={favoritesOnly ? "active" : ""} type="button" onClick={() => setFavoritesOnly((value) => !value)}>
          ★ お気に入り{favoritesOnly ? "のみ" : ""}
        </button>
      </section>

      {recentTemplates.length > 0 && (
        <section className="action-prompt-recent" aria-label="最近使ったプロンプト">
          <strong>最近使ったもの</strong>
          <div>
            {recentTemplates.map((template) => (
              <button key={template.id} type="button" onClick={() => selectTemplate(template)}>{template.title}</button>
            ))}
          </div>
        </section>
      )}

      <div className="action-prompt-layout">
        <section className="action-prompt-list" aria-label="プロンプト一覧">
          <div className="action-prompt-list-head">
            <strong>{filtered.length}件</strong>
            <small>プロンプト本文は入力内容から自動で完成します。</small>
          </div>
          {filtered.map((template) => (
            <button
              key={template.id}
              className={template.id === selected.id ? "action-prompt-item active" : "action-prompt-item"}
              type="button"
              onClick={() => selectTemplate(template)}
            >
              <span>{template.category}</span>
              <strong>{template.title}</strong>
              <p>{template.description}</p>
              <small>{template.sideHustle} · 推奨 {template.recommendedAi}</small>
            </button>
          ))}
          {!filtered.length && <p className="route-notice">条件に一致するプロンプトがありません。</p>}
        </section>

        <section className="creator-card action-prompt-editor" aria-labelledby="selected-prompt-title">
          <div className="action-prompt-editor-head">
            <div>
              <span>{selected.category}</span>
              <h2 id="selected-prompt-title">{selected.title}</h2>
              <p>{selected.description}</p>
            </div>
            <button type="button" onClick={() => persistFavorite(selected.id)} aria-pressed={favorites.includes(selected.id)}>
              {favorites.includes(selected.id) ? "★ お気に入り済み" : "☆ お気に入り"}
            </button>
          </div>

          <div className="action-prompt-fields">
            {selected.fields.map((field) => (
              <label className={field.multiline ? "full" : ""} key={field.key}>
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea
                    value={values[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                ) : (
                  <input
                    value={values[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>

          <label className="action-prompt-output">
            <span>完成プロンプト</span>
            <textarea readOnly value={prompt} />
          </label>

          <div className="action-prompt-actions">
            <button className="primary-action" type="button" onClick={() => void copyPrompt()}>プロンプトをコピー</button>
            {(["chatgpt", "claude", "gemini"] as const).map((key) => (
              <button key={key} type="button" onClick={() => void copyPrompt(key)}>
                コピーして{AI_APP_LINKS[key].name}を開く
              </button>
            ))}
          </div>
          {message && <div className="route-notice" role="status">{message}</div>}
          <p className="panel-muted">AASはプロンプトを準備して外部AIを開きます。ブラウザへAIサービスのAPIキーや秘密鍵は保存しません。</p>
        </section>
      </div>
    </main>
  );
}
