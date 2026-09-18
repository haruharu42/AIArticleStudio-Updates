"use client";

import { useMemo, useState } from "react";

import {
  MAGAZINE_ARTICLE_COUNT_OPTIONS,
  MAGAZINE_AUDIENCE_OPTIONS,
  MAGAZINE_DIRECTION_OPTIONS,
  MAGAZINE_MONETIZATION_OPTIONS,
  MAGAZINE_ORDER_OPTIONS,
  MAGAZINE_PURPOSE_OPTIONS,
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
  const [selectionInvalidated, setSelectionInvalidated] = useState(false);
  const [customError, setCustomError] = useState("");
  const suggestions = useMemo(() => suggestMagazinePlans(draft, plan), [draft, plan]);
  const genreSelectValue = genreSelectionValue(draft.genre);
  const subgenreSelectValue = subgenreSelectionValue(draft.genre, draft.subgenre);
  const subgenres = subgenreOptionsFor(draft.genre);
  const baseTopic = draft.subgenre && draft.subgenre !== "AIおまかせ" && draft.subgenre !== "その他"
    ? draft.subgenre
    : draft.genre && draft.genre !== "その他"
      ? draft.genre
      : "テーマ";
  const themeOptions = useMemo(() => [
    { value: "", label: "AIおまかせ" },
    { value: `${baseTopic}の始め方・入門`, label: "始め方・入門" },
    { value: `${baseTopic}の実践・手順`, label: "実践・手順" },
    { value: `${baseTopic}の比較・選び方`, label: "比較・選び方" },
    { value: `${baseTopic}の失敗・注意点`, label: "失敗・注意点" },
    { value: `${baseTopic}の収益化・販売導線`, label: "収益化・販売導線" },
    { value: "other", label: "その他（自由入力）" },
  ], [baseTopic]);
  const themeSelectValue = themeOptions.some((option) => option.value === draft.theme)
    ? draft.theme
    : draft.theme
      ? "other"
      : "";
  const purposeSelectValue = MAGAZINE_PURPOSE_OPTIONS.some((option) => option.value === plan.purpose)
    ? plan.purpose
    : plan.purpose
      ? "other"
      : "";
  const articleCountSelectValue = MAGAZINE_ARTICLE_COUNT_OPTIONS.some((count) => count === plan.articleCount)
    ? String(plan.articleCount)
    : "other";
  const customThemeValue = themeSelectValue === "other" && draft.theme !== "その他" ? draft.theme : "";
  const customGenreValue = genreSelectValue === "その他" && draft.genre !== "その他" ? draft.genre : "";
  const customSubgenreValue = subgenreSelectValue === "その他" && draft.subgenre !== "その他" ? draft.subgenre : "";
  const customPurposeValue = purposeSelectValue === "other" && plan.purpose !== "その他" ? plan.purpose : "";
  const hasIncompleteCustomFields =
    (themeSelectValue === "other" && !customThemeValue.trim())
    || (genreSelectValue === "その他" && !customGenreValue.trim())
    || (subgenreSelectValue === "その他" && !customSubgenreValue.trim())
    || (plan.audience === "other" && !plan.customAudience.trim())
    || (plan.direction === "other" && !plan.customDirection.trim())
    || (plan.publishingStyle === "other" && !plan.customPublishingStyle.trim())
    || (plan.monetizationLevel === "other" && !plan.customMonetizationLevel.trim())
    || (plan.orderStrategy === "other" && !plan.customOrderStrategy.trim())
    || (purposeSelectValue === "other" && !customPurposeValue.trim());

  const updatePlan = <K extends keyof MagazinePlanDraft>(key: K, value: MagazinePlanDraft[K]) => {
    const hadSelectedPlan = Boolean(plan.name.trim() || plan.articleTitles.length);
    onPlanChange({
      ...plan,
      [key]: value,
      name: "",
      articleTitles: [],
    });
    setGenerated(false);
    setCustomError("");
    if (hadSelectedPlan) setSelectionInvalidated(true);
  };

  const invalidateSelectedPlan = () => {
    if (!plan.name && plan.articleTitles.length === 0) return;
    onPlanChange({
      ...plan,
      name: "",
      articleTitles: [],
    });
    setGenerated(false);
    setSelectionInvalidated(true);
  };

  const updateTheme = (value: string) => {
    invalidateSelectedPlan();
    setCustomError("");
    patch("theme", value);
  };

  const updateGenre = (value: string) => {
    invalidateSelectedPlan();
    setCustomError("");
    setGenre(value);
  };

  const updateCustomGenre = (value: string) => {
    invalidateSelectedPlan();
    setCustomError("");
    patch("genre", value.slice(0, 120));
    patch("subgenre", "AIおまかせ");
  };

  const updateSubgenre = (value: string) => {
    invalidateSelectedPlan();
    setCustomError("");
    setSubgenre(value);
  };

  const updateCustomSubgenre = (value: string) => {
    invalidateSelectedPlan();
    setCustomError("");
    patch("subgenre", value.slice(0, 120));
  };

  const generate = () => {
    if (hasIncompleteCustomFields) {
      setCustomError("「その他」を選んだ項目は、表示された入力欄へ内容を入力してください。");
      return;
    }
    setCustomError("");
    setTab(0);
    setGenerated(true);
    setSelectionInvalidated(false);
  };

  const useSuggestion = () => {
    const suggestion = suggestions[tab];
    if (!suggestion) return;
    onPlanChange(applyMagazineSuggestion(plan, suggestion));
    patch("title", suggestion.articleTitles[0] ?? draft.title);
    patch("magazineEnabled", true);
    setSelectionInvalidated(false);
  };

  const active = suggestions[tab];

  return (
    <section className="magazine-planner" aria-labelledby="magazine-planner-title">
      <header className="magazine-planner-head">
        <div>
          <span className="magazine-spark" aria-hidden="true">✦</span>
          <div>
            <div className="magazine-title-row">
              <h3 id="magazine-planner-title">マガジンタイトル一括生成</h3>
              <span className="magazine-new-badge">NEW</span>
            </div>
            <p>テーマや条件から、マガジン名と記事タイトルの構成案を3案まとめて作成します。</p>
          </div>
        </div>
        <span className="magazine-local-badge">回数消費なし</span>
      </header>

      <div className="magazine-dropdown-grid">
        <label className="reference-field">
          <span>掲載先</span>
          <select value="note" onChange={() => patch("publicationTarget", "note")}>
            <option value="note">note</option>
          </select>
        </label>

        <label className="reference-field">
          <span>ジャンル</span>
          <select value={genreSelectValue} onChange={(event) => updateGenre(event.target.value)}>
            {GENRE_OPTIONS.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
          </select>
          {genreSelectValue === "その他" && (
            <input
              value={customGenreValue}
              onChange={(event) => updateCustomGenre(event.target.value)}
              placeholder="ジャンルを入力"
              maxLength={120}
              aria-label="その他のジャンル"
            />
          )}
        </label>

        <label className="reference-field">
          <span>テーマ・キーワード</span>
          <select
            value={themeSelectValue}
            onChange={(event) => updateTheme(event.target.value === "other" ? "その他" : event.target.value)}
          >
            {themeOptions.map((option) => <option key={option.value || "auto"} value={option.value}>{option.label}</option>)}
          </select>
          {themeSelectValue === "other" && (
            <input
              value={customThemeValue}
              onChange={(event) => updateTheme(event.target.value.slice(0, 240))}
              placeholder="テーマ・キーワードを入力"
              maxLength={240}
              aria-label="その他のテーマ・キーワード"
            />
          )}
        </label>

        <label className="reference-field">
          <span>サブジャンル</span>
          <select value={subgenreSelectValue} onChange={(event) => updateSubgenre(event.target.value)}>
            {subgenres.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}
          </select>
          {subgenreSelectValue === "その他" && (
            <input
              value={customSubgenreValue}
              onChange={(event) => updateCustomSubgenre(event.target.value)}
              placeholder="サブジャンルを入力"
              maxLength={120}
              aria-label="その他のサブジャンル"
            />
          )}
        </label>

        <label className="reference-field">
          <span>対象読者</span>
          <select value={plan.audience} onChange={(event) => updatePlan("audience", event.target.value as MagazinePlanDraft["audience"])}>
            {MAGAZINE_AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {plan.audience === "other" && (
            <input
              value={plan.customAudience}
              onChange={(event) => updatePlan("customAudience", event.target.value.slice(0, 120))}
              placeholder="対象読者を入力"
              maxLength={120}
              aria-label="その他の対象読者"
            />
          )}
        </label>

        <label className="reference-field">
          <span>マガジンの方向性</span>
          <select value={plan.direction} onChange={(event) => updatePlan("direction", event.target.value as MagazinePlanDraft["direction"])}>
            {MAGAZINE_DIRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {plan.direction === "other" && (
            <input
              value={plan.customDirection}
              onChange={(event) => updatePlan("customDirection", event.target.value.slice(0, 120))}
              placeholder="方向性を入力"
              maxLength={120}
              aria-label="その他のマガジンの方向性"
            />
          )}
        </label>

        <label className="reference-field">
          <span>記事数（目安）</span>
          <select
            value={articleCountSelectValue}
            onChange={(event) => updatePlan("articleCount", event.target.value === "other" ? 4 : Number(event.target.value))}
          >
            {MAGAZINE_ARTICLE_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}記事</option>)}
            <option value="other">その他（自由入力）</option>
          </select>
          {articleCountSelectValue === "other" && (
            <input
              type="number"
              min={1}
              max={10}
              value={plan.articleCount}
              onChange={(event) => updatePlan("articleCount", Math.min(10, Math.max(1, Number(event.target.value) || 1)))}
              aria-label="その他の記事数"
            />
          )}
        </label>

        <label className="reference-field">
          <span>公開スタイル</span>
          <select value={plan.publishingStyle} onChange={(event) => updatePlan("publishingStyle", event.target.value as MagazinePlanDraft["publishingStyle"])}>
            {MAGAZINE_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {plan.publishingStyle === "other" && (
            <input
              value={plan.customPublishingStyle}
              onChange={(event) => updatePlan("customPublishingStyle", event.target.value.slice(0, 120))}
              placeholder="公開スタイルを入力"
              maxLength={120}
              aria-label="その他の公開スタイル"
            />
          )}
        </label>

        <label className="reference-field">
          <span>収益化レベル</span>
          <select value={plan.monetizationLevel} onChange={(event) => updatePlan("monetizationLevel", event.target.value as MagazinePlanDraft["monetizationLevel"])}>
            {MAGAZINE_MONETIZATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {plan.monetizationLevel === "other" && (
            <input
              value={plan.customMonetizationLevel}
              onChange={(event) => updatePlan("customMonetizationLevel", event.target.value.slice(0, 120))}
              placeholder="収益化の方針を入力"
              maxLength={120}
              aria-label="その他の収益化レベル"
            />
          )}
        </label>

        <label className="reference-field">
          <span>記事の並び方</span>
          <select value={plan.orderStrategy} onChange={(event) => updatePlan("orderStrategy", event.target.value as MagazinePlanDraft["orderStrategy"])}>
            {MAGAZINE_ORDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {plan.orderStrategy === "other" && (
            <input
              value={plan.customOrderStrategy}
              onChange={(event) => updatePlan("customOrderStrategy", event.target.value.slice(0, 120))}
              placeholder="記事の並び方を入力"
              maxLength={120}
              aria-label="その他の記事の並び方"
            />
          )}
        </label>

        <label className="reference-field magazine-purpose">
          <span>補足・目的（任意）</span>
          <select
            value={purposeSelectValue}
            onChange={(event) => updatePlan("purpose", event.target.value === "other" ? "その他" : event.target.value)}
          >
            {MAGAZINE_PURPOSE_OPTIONS.map((option) => <option key={option.value || "auto"} value={option.value}>{option.label}</option>)}
          </select>
          {purposeSelectValue === "other" && (
            <input
              value={customPurposeValue}
              onChange={(event) => updatePlan("purpose", event.target.value.slice(0, 500))}
              placeholder="補足・目的を入力"
              maxLength={500}
              aria-label="その他の補足・目的"
            />
          )}
        </label>
      </div>

      {customError && (
        <div className="route-notice" role="alert">
          {customError}
        </div>
      )}

      {selectionInvalidated && (
        <div className="route-notice" role="alert">
          条件が変更されました。マガジン構成をもう一度生成してください。
        </div>
      )}

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
                <li key={`${index}-${title}`}>
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
