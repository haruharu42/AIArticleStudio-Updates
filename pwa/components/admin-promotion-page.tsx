"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AI_APP_LINKS, launchAiApp, type AiAppKey } from "@/lib/ai-app-links";
import {
  ADMIN_PRODUCT_FACTS_STORAGE_KEY,
  DEFAULT_ADMIN_PRODUCT_FACTS,
  buildAdminArticlePromotionPrompt,
  buildAdminCampaignPrompt,
  buildAdminSocialPromotionPrompt,
  type AdminProductFacts,
} from "@/lib/admin-promotion";
import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type State = AccessState | { kind: "loading" } | { kind: "unavailable" };
type Mode = "product" | "article" | "social" | "campaign";

const MODES: Array<{ key: Mode; label: string; description: string }> = [
  { key: "product", label: "製品情報", description: "宣伝で使う確認済み情報" },
  { key: "article", label: "販売記事", description: "note・Brain・Tips向け" },
  { key: "social", label: "SNS販促", description: "X・Instagram・動画SNS向け" },
  { key: "campaign", label: "キャンペーン", description: "記事とSNSをまとめて設計" },
];

function TextField({ label, value, onChange, placeholder = "", multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <label className="admin-promo-field">
      <span>{label}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={5} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}
    </label>
  );
}

function PromptOutput({ prompt, onCopy }: { prompt: string; onCopy: () => void }) {
  return (
    <section className="admin-promo-output" aria-label="生成用プロンプト">
      <div className="admin-promo-output-head"><div><span>AI PROMPT</span><h3>生成用プロンプト</h3></div><button type="button" onClick={onCopy}>コピー</button></div>
      <pre>{prompt}</pre>
      <div className="admin-promo-ai-actions">
        {(Object.keys(AI_APP_LINKS) as AiAppKey[]).map((key) => <button key={key} type="button" onClick={() => launchAiApp(key)}>{AI_APP_LINKS[key].name}を開く</button>)}
      </div>
      <p>プロンプトをコピーしてAIへ渡すと、確認済み製品情報を基準に販売記事・SNS素材を作成できます。</p>
    </section>
  );
}

export function AdminPromotionPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [mode, setMode] = useState<Mode>("article");
  const [message, setMessage] = useState("");
  const [facts, setFacts] = useState<AdminProductFacts>(DEFAULT_ADMIN_PRODUCT_FACTS);
  const [article, setArticle] = useState({ platform: "note" as const, purpose: "新規紹介・販売", audience: "", focus: "", cta: "" });
  const [social, setSocial] = useState({ platform: "x" as const, purpose: "新規紹介・販売", audience: "", focus: "", cta: "", variants: 3 });
  const [campaign, setCampaign] = useState({ campaignName: "", goal: "販売開始・認知拡大", audience: "", channels: "note, X, Instagram, Threads, TikTok, YouTube Shorts", offer: "", cta: "" });

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const value = await loadAccessState(getSupabaseClient());
        if (active) setState(value);
      } catch {
        if (active) setState({ kind: "unavailable" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(ADMIN_PRODUCT_FACTS_STORAGE_KEY);
        if (saved) setFacts({ ...DEFAULT_ADMIN_PRODUCT_FACTS, ...JSON.parse(saved) });
        const requested = new URLSearchParams(window.location.search).get("mode");
        if (requested && MODES.some((item) => item.key === requested)) setMode(requested as Mode);
      } catch {
        // Keep safe defaults when local data is unavailable or malformed.
      }
    });
  }, []);

  const isAdmin = state.kind === "ready" && state.profile.role === "admin" && state.profile.status === "active";

  const articlePrompt = useMemo(() => buildAdminArticlePromotionPrompt(facts, article), [facts, article]);
  const socialPrompt = useMemo(() => buildAdminSocialPromotionPrompt(facts, social), [facts, social]);
  const campaignPrompt = useMemo(() => buildAdminCampaignPrompt(facts, campaign), [facts, campaign]);

  const saveFacts = () => {
    try {
      window.localStorage.setItem(ADMIN_PRODUCT_FACTS_STORAGE_KEY, JSON.stringify(facts));
      setMessage("確認済み製品情報をこの端末に保存しました。");
    } catch {
      setMessage("製品情報を保存できませんでした。");
    }
  };

  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("生成用プロンプトをコピーしました。");
    } catch {
      setMessage("自動コピーできませんでした。プロンプトを長押ししてコピーしてください。");
    }
  };

  if (!isAdmin) {
    return (
      <main className="standalone-page"><section className="standalone-card">
        <p className="eyebrow">ADMIN ONLY</p><h1>販売・プロモーション</h1>
        {state.kind === "loading" && <p className="route-notice">管理者権限を確認しています…</p>}
        {state.kind === "signed_out" && <p className="route-notice">先にログインしてください。</p>}
        {state.kind !== "loading" && state.kind !== "signed_out" && <p className="route-notice error">この機能はactive管理者のみ利用できます。</p>}
        <Link className="route-back" href="/">← ホームへ戻る</Link>
      </section></main>
    );
  }

  return (
    <main className="admin-promo-page">
      <header className="admin-promo-head">
        <div><p className="eyebrow">ADMIN MARKETING</p><h1>販売・プロモーションセンター</h1><p>AI Article Studioの紹介記事、SNS投稿、販売キャンペーンを管理者専用で作成します。</p></div>
        <div><Link href="/admin">管理ダッシュボード</Link><Link href="/">ホーム</Link></div>
      </header>

      <div className="admin-promo-safety"><strong>確認済み情報を基準に作成</strong><span>未入力の価格・実績・レビュー・キャンペーンをAIに作らせない設計です。製品情報は現在この端末だけに保存されます。</span></div>
      {message && <div className="route-notice">{message}</div>}

      <nav className="admin-promo-tabs" aria-label="管理者プロモーション機能">
        {MODES.map((item) => <button key={item.key} className={mode === item.key ? "active" : ""} type="button" onClick={() => setMode(item.key)}><strong>{item.label}</strong><small>{item.description}</small></button>)}
      </nav>

      {mode === "product" && (
        <section className="admin-promo-panel">
          <div className="admin-promo-section-title"><div><p className="eyebrow">PRODUCT FACTS</p><h2>製品情報管理</h2></div><button type="button" onClick={saveFacts}>この端末に保存</button></div>
          <p className="admin-promo-help">販売記事・SNS投稿の事実ソースです。価格やURLが未確定なら空欄のままにしてください。</p>
          <div className="admin-promo-form-grid">
            <TextField label="製品名" value={facts.productName} onChange={(value) => setFacts((current) => ({ ...current, productName: value }))} />
            <TextField label="提供形態" value={facts.editions} onChange={(value) => setFacts((current) => ({ ...current, editions: value }))} />
            <TextField label="提供状況" value={facts.releaseStage} onChange={(value) => setFacts((current) => ({ ...current, releaseStage: value }))} placeholder="例: ベータ版 / 正式版" />
            <TextField label="想定ユーザー" value={facts.targetAudience} onChange={(value) => setFacts((current) => ({ ...current, targetAudience: value }))} />
            <TextField label="確認済み機能" value={facts.features} onChange={(value) => setFacts((current) => ({ ...current, features: value }))} multiline />
            <TextField label="価格・販売条件" value={facts.priceText} onChange={(value) => setFacts((current) => ({ ...current, priceText: value }))} multiline />
            <TextField label="販売URL" value={facts.salesUrl} onChange={(value) => setFacts((current) => ({ ...current, salesUrl: value }))} />
            <TextField label="サポート" value={facts.support} onChange={(value) => setFacts((current) => ({ ...current, support: value }))} multiline />
            <TextField label="制限・注意事項" value={facts.limitations} onChange={(value) => setFacts((current) => ({ ...current, limitations: value }))} multiline />
          </div>
        </section>
      )}

      {mode === "article" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">SALES ARTICLE</p><h2>販売・宣伝記事作成</h2></div></div>
          <div className="admin-promo-form-grid compact">
            <label className="admin-promo-field"><span>掲載先</span><select value={article.platform} onChange={(event) => setArticle((current) => ({ ...current, platform: event.target.value as typeof article.platform }))}><option value="note">note</option><option value="brain">Brain</option><option value="tips">Tips</option><option value="blog">ブログ</option></select></label>
            <TextField label="目的" value={article.purpose} onChange={(value) => setArticle((current) => ({ ...current, purpose: value }))} />
            <TextField label="想定読者" value={article.audience} onChange={(value) => setArticle((current) => ({ ...current, audience: value }))} />
            <TextField label="特に紹介したい内容" value={article.focus} onChange={(value) => setArticle((current) => ({ ...current, focus: value }))} multiline />
            <TextField label="CTA・誘導先" value={article.cta} onChange={(value) => setArticle((current) => ({ ...current, cta: value }))} />
          </div>
          <PromptOutput prompt={articlePrompt} onCopy={() => void copyPrompt(articlePrompt)} />
        </section>
      )}

      {mode === "social" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">SOCIAL PROMOTION</p><h2>SNSプロモーション作成</h2></div></div>
          <div className="admin-promo-form-grid compact">
            <label className="admin-promo-field"><span>SNS</span><select value={social.platform} onChange={(event) => setSocial((current) => ({ ...current, platform: event.target.value as typeof social.platform }))}><option value="x">X</option><option value="instagram">Instagram</option><option value="threads">Threads</option><option value="tiktok">TikTok</option><option value="youtube">YouTube Shorts</option></select></label>
            <TextField label="目的" value={social.purpose} onChange={(value) => setSocial((current) => ({ ...current, purpose: value }))} />
            <TextField label="想定読者" value={social.audience} onChange={(value) => setSocial((current) => ({ ...current, audience: value }))} />
            <TextField label="紹介テーマ" value={social.focus} onChange={(value) => setSocial((current) => ({ ...current, focus: value }))} multiline />
            <TextField label="CTA・誘導先" value={social.cta} onChange={(value) => setSocial((current) => ({ ...current, cta: value }))} />
            <label className="admin-promo-field"><span>作成数</span><input type="number" min={1} max={10} value={social.variants} onChange={(event) => setSocial((current) => ({ ...current, variants: Math.max(1, Math.min(10, Number(event.target.value) || 1)) }))} /></label>
          </div>
          <PromptOutput prompt={socialPrompt} onCopy={() => void copyPrompt(socialPrompt)} />
        </section>
      )}

      {mode === "campaign" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">CAMPAIGN</p><h2>販売キャンペーン設計</h2></div></div>
          <div className="admin-promo-form-grid compact">
            <TextField label="キャンペーン名" value={campaign.campaignName} onChange={(value) => setCampaign((current) => ({ ...current, campaignName: value }))} />
            <TextField label="目的" value={campaign.goal} onChange={(value) => setCampaign((current) => ({ ...current, goal: value }))} />
            <TextField label="想定読者" value={campaign.audience} onChange={(value) => setCampaign((current) => ({ ...current, audience: value }))} />
            <TextField label="使用媒体" value={campaign.channels} onChange={(value) => setCampaign((current) => ({ ...current, channels: value }))} multiline />
            <TextField label="販売条件・オファー" value={campaign.offer} onChange={(value) => setCampaign((current) => ({ ...current, offer: value }))} multiline />
            <TextField label="CTA・誘導先" value={campaign.cta} onChange={(value) => setCampaign((current) => ({ ...current, cta: value }))} />
          </div>
          <PromptOutput prompt={campaignPrompt} onCopy={() => void copyPrompt(campaignPrompt)} />
        </section>
      )}
    </main>
  );
}
