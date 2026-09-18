"use client";

import { useMemo, useState } from "react";

import {
  MAGAZINE_ARTICLE_COUNT_OPTIONS,
  MAGAZINE_AUDIENCE_OPTIONS,
  MAGAZINE_DIRECTION_OPTIONS,
  MAGAZINE_MONETIZATION_OPTIONS,
  MAGAZINE_ORDER_OPTIONS,
  MAGAZINE_STYLE_OPTIONS,
  applyMagazineSuggestion,
  suggestMagazinePlans,
  type MagazinePlanDraft,
} from "@/lib/magazine-planner";
import {
  GENRE_OPTIONS,
  genreSelectionValue,
  subgenreOptionsFor,
  subgenreSelectionValue,
} from "@/lib/phase18-content-options";
import type { ArticleCreationDraft } from "@/lib/phase11-create";

type Patch = <K extends keyof ArticleCreationDraft>(
  key: K,
  value: ArticleCreationDraft[K],
) => void;

export function MagazinePlannerPanel({
  draft,
  plan,
  patch,
  setGenre,
  setSubgenre,
  onPlanChange,
}: {
  draft: ArticleCreationDraft;
  plan: MagazinePlanDraft;
  patch: Patch;
  setGenre: (value: string) => void;
  setSubgenre: (value: string) => void;
  onPlanChange: (value: MagazinePlanDraft) => void;
}) {
  const [generated, setGenerated] = useState(Boolean(plan.name || plan.articleTitles.length));
  const [tab, setTab] = useState(Math.min(2, Math.max(0, plan.selectedSuggestion)));
  const suggestions = useMemo(() => suggestMagazinePlans(draft, plan), [draft, plan]);
  const genreSelectValue = genreSelectionValue(draft.genre);
  const subgenreSelectValue = subgenreSelectionValue(draft.genre, draft.subgenre);
  const subgenres = subgenreOptionsFor(draft.genre);

  const updatePlan = <K extends keyof MagazinePlanDraft>(key: K, value: MagazinePlanDraft[K]) => {
    onPlanChange({
      ...plan,
      [key]: value,
      name: "",
      articleTitles: [],
    });
    setGenerated(false);
  };

  const generate = () => {
    setTab(0);
    setGenerated(true);
  };

  const useSuggestion = () => {
    const suggestion = suggestions[tab];
    if (!suggestion) return;
    onPlanChange(applyMagazineSuggestion(plan, suggestion));
    patch("title", suggestion.articleTitles[0] ?? draft.title);
    patch("magazineEnabled", true);
  };

  const active = suggestions[tab];

  return (
    <section className="magazine-planner" aria-labelledby="magazine-planner-title">
      <header className="magazine-planner-head">
        <div>
          <span className="magazine-spark" aria-hidden="true">✦</span>
          <div>
            <div className="magazine-title-row">
              <h3 id="magazine-planner-title">マガジン設定</h3>
              <span className="magazine-new-badge">NEW</span>
            </div>
            <p>条件をプルダウンで選ぶと、マガジン名と記事タイトルの構成案をまとめて作れます。</p>
          </div>
        </div>
        <span className="magazine-local-badge">回数消費なし</span>
      </header>

      <div className="magazine-dropdown-grid">
        <label className="reference-field">
          <span>掲載先</span>
          <select value={draft.publicationTarget} onChange={(event) => {
            const value = event.target.value as ArticleCreationDraft["publicationTarget"];
            patch("publicationTarget", value);
            if (value !== "note") patch("magazineEnabled", false);
          }}>
            <option value="note">note</option>
            <option value="tips">Tips（シリーズ用途）</option>
            <option value="brain">Brain（シリーズ用途）</option>
            <option value="blog">ブログ（シリーズ用途）</option>
          </select>
        </label>

        <label className="reference-field">
          <span>ジャンル</span>
          <select value={genreSelectValue} onChange={(event) => setGenre(event.target.value)}>
            {GENRE_OPTIONS.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>テーマ・キーワード</span>
          <input
            value={draft.theme}
            onChange={(event) => patch("theme", event.target.value)}
            placeholder="例：AI副業 初心者 note"
            maxLength={240}
          />
        </label>

        <label className="reference-field">
          <span>サブジャンル</span>
          <select value={subgenreSelectValue} onChange={(event) => setSubgenre(event.target.value)}>
            {subgenres.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>対象読者</span>
          <select value={plan.audience} onChange={(event) => updatePlan("audience", event.target.value as MagazinePlanDraft["audience"])}>
            {MAGAZINE_AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>マガジンの方向性</span>
          <select value={plan.direction} onChange={(event) => updatePlan("direction", event.target.value as MagazinePlanDraft["direction"])}>
            {MAGAZINE_DIRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>記事数（目安）</span>
          <select value={plan.articleCount} onChange={(event) => updatePlan("articleCount", Number(event.target.value) as MagazinePlanDraft["articleCount"])}>
            {MAGAZINE_ARTICLE_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}記事</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>公開スタイル</span>
          <select value={plan.publishingStyle} onChange={(event) => updatePlan("publishingStyle", event.target.value as MagazinePlanDraft["publishingStyle"])}>
            {MAGAZINE_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>収益化レベル</span>
          <select value={plan.monetizationLevel} onChange={(event) => updatePlan("monetizationLevel", event.target.value as MagazinePlanDraft["monetizationLevel"])}>
            {MAGAZINE_MONETIZATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="reference-field">
          <span>記事の並び方</span>
          <select value={plan.orderStrategy} onChange={(event) => updatePlan("orderStrategy", event.target.value as MagazinePlanDraft["orderStrategy"])}>
            {MAGAZINE_ORDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="reference-field magazine-purpose">
          <span>補足・目的（任意）</span>
          <textarea
            value={plan.purpose}
            onChange={(event) => updatePlan("purpose", event.target.value.slice(0, 500))}
            placeholder="例：初心者がAIを使ってnoteで収益化するまでの流れを、やさしく段階的に解説する"
            maxLength={500}
          />
          <small>{plan.purpose.length}/500</small>
        </label>
      </div>

      <button className="magazine-generate-action" type="button" onClick={generate}>
        <span aria-hidden="true">✦</span>
        マガジン名と記事タイトルを生成する
        <b aria-hidden="true">›</b>
      </button>

      {generated && active && (
        <section className="magazine-results" aria-labelledby="magazine-results-title">
          <header>
            <span aria-hidden="true">▤</span>
            <div>
              <h4 id="magazine-results-title">生成結果</h4>
              <p>AASが入力条件から構成案を作成しました。採用後もタイトルは編集できます。</p>
            </div>
          </header>

          <div className="magazine-result-tabs" role="tablist" aria-label="マガジン構成案">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                role="tab"
                aria-selected={tab === index}
                className={tab === index ? "active" : ""}
                onClick={() => setTab(index)}
              >
                提案 {index + 1}
              </button>
            ))}
          </div>

          <article className="magazine-result-card">
            {tab === 0 && <span className="magazine-recommended">✓ おすすめ</span>}
            <h5>{active.name}</h5>
            <p>{active.description}</p>
            <ol>
              {active.articleTitles.map((title, index) => (
                <li key={\`${index}-${title}\`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{title}</strong>
                </li>
              ))}
            </ol>
            <button className="magazine-use-action" type="button" onClick={useSuggestion}>
              このマガジンを使用する <span aria-hidden="true">›</span>
            </button>
            {plan.name === active.name && <p className="magazine-selected-note">✓ この構成を選択中です。最初の記事タイトルを記事作成フローへ引き継ぎました。</p>}
          </article>
        </section>
      )}

      <div className="magazine-info-note">
        <span aria-hidden="true">i</span>
        <p>選んだ構成案は記事と一緒にWorkspaceへ保存します。noteの場合は記事ライブラリのマガジン管理にも引き継がれます。</p>
      </div>
    </section>
  );
}
