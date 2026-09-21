"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { AI_APP_LINKS, launchAiApp, type AiAppKey } from "@/lib/ai-app-links";
import {
  ADMIN_PRODUCT_FACTS_STORAGE_KEY,
  DEFAULT_ADMIN_PRODUCT_FACTS,
  DEFAULT_SOCIAL_LENGTH_PLAN,
  buildAdminArticlePromotionPrompt,
  buildAdminCampaignPrompt,
  buildAdminPreviewPromotionPrompt,
  buildAdminSocialPromotionPrompt,
  sanitizeSocialTargetChars,
  socialLengthPresetsFor,
  type AdminProductFacts,
  type AdminSocialLengthPlan,
  type AdminSocialPlatform,
} from "@/lib/admin-promotion";
type Mode = "product" | "preview" | "article" | "social" | "campaign";

const MODES: Array<{ key: Mode; label: string; description: string }> = [
  { key: "product", label: "製品情報", description: "宣伝で使う確認済み情報" },
  { key: "preview", label: "テスト・公開予告", description: "実運用テスト・開発進捗・公開予定" },
  { key: "article", label: "紹介・販売記事", description: "販売前〜販売後の長文発信" },
  { key: "social", label: "SNS販促", description: "X・Instagram・動画SNS向け" },
  { key: "campaign", label: "キャンペーン", description: "記事とSNSをまとめて設計" },
];

const PURPOSE_OPTIONS = [
  "実運用テスト状況の共有",
  "note実運用テスト報告",
  "開発進捗の共有",
  "改善内容の共有",
  "公開前の予告",
  "公開予定の案内",
  "ベータ開始予告",
  "新規紹介・販売",
  "販売開始告知",
  "認知拡大",
  "機能紹介",
  "初心者向け解説",
  "利用開始を促す",
  "既存ユーザーへ再訴求",
  "アップデート告知",
  "ベータ参加募集",
  "招待ユーザー募集",
  "比較検討を支援",
  "FAQ・不安解消",
  "無料コンテンツから販売へ誘導",
  "記事・販売ページへの送客",
  "SNSフォロー促進",
  "休眠ユーザーの再活性化",
];

const AUDIENCE_OPTIONS = [
  "AI初心者",
  "副業初心者",
  "note初心者",
  "Tips・Brain初心者",
  "SNS運用初心者",
  "コンテンツ販売初心者",
  "AIをすでに使っている人",
  "記事作成を効率化したい人",
  "SNS投稿を効率化したい人",
  "個人事業主・フリーランス",
  "小規模事業者",
  "ブログ運営者",
  "クリエイター",
  "会社員",
  "主婦・主夫",
  "学生",
  "20代",
  "30代",
  "40代",
  "50代",
  "60代以上",
  "時間が少ない人",
  "PC操作が苦手な人",
  "スマホ中心で作業する人",
];

const CTA_OPTIONS = [
  "フォローして続報を待ってもらう",
  "公開予定を知らせる",
  "テスト記事を読んでもらう",
  "開発状況を見てもらう",
  "先行案内を確認してもらう",
  "販売前なのでCTAなし",
  "販売URLへ誘導",
  "公式ページへ誘導",
  "詳細記事へ誘導",
  "無料記事へ誘導",
  "プロフィールへ誘導",
  "利用開始を促す",
  "ベータ参加を促す",
  "招待申請を促す",
  "問い合わせを促す",
  "DMを促す",
  "フォローを促す",
  "保存を促す",
  "コメントを促す",
  "次の記事へ誘導",
  "CTAなし",
];

const EDITION_OPTIONS = [
  "PWA版 / Windows版",
  "PWA版のみ",
  "Windows版のみ",
  "PWA版 / Windows版（別購入）",
  "PWA版 / Windows版（共通利用）",
  "招待制PWA版",
  "ベータ版",
];

const RELEASE_STAGE_OPTIONS = [
  "未定",
  "開発中",
  "内部テスト",
  "クローズドベータ",
  "オープンベータ",
  "有料ベータ",
  "先行販売",
  "正式販売",
  "販売一時停止",
  "提供終了",
];

const SUPPORT_OPTIONS = [
  "未定",
  "アプリ内案内",
  "FAQ・ヘルプ",
  "メールサポート",
  "問い合わせフォーム",
  "X・SNS経由の問い合わせ",
  "販売ページ経由の問い合わせ",
  "ベータ期間限定サポート",
  "複数チャネルでサポート",
];

const LIMITATION_OPTIONS = [
  "特になし",
  "未確定事項あり",
  "ベータ版のため仕様変更の可能性あり",
  "一部機能は開発中",
  "Windows版とPWA版は別利用権",
  "招待制",
  "利用上限あり",
  "対応環境に制限あり",
  "外部AIサービスの仕様・利用条件に依存",
];

const CAMPAIGN_GOAL_OPTIONS = [
  "実運用テストの共有",
  "開発進捗の認知拡大",
  "公開前の期待形成",
  "公開予定の周知",
  "ベータ開始予告",
  "販売開始・認知拡大",
  "新規ユーザー獲得",
  "ベータ参加者募集",
  "招待ユーザー募集",
  "販売ページへの送客",
  "記事への送客",
  "SNSフォロワー獲得",
  "製品理解の促進",
  "特定機能の認知拡大",
  "アップデート周知",
  "既存ユーザーの再活性化",
  "FAQ・不安解消",
];

const CHANNEL_PRESET_OPTIONS = [
  "note, X, Instagram, Threads, TikTok, YouTube Shorts",
  "note, X",
  "note, X, Instagram",
  "note, X, Threads",
  "note, X, Instagram, Threads",
  "X, Instagram, Threads",
  "Instagram, TikTok, YouTube Shorts",
  "X, TikTok, YouTube Shorts",
  "note, Brain, Tips, X",
  "note, Brain, Tips, X, Instagram, Threads",
  "noteのみ",
  "Xのみ",
  "Instagramのみ",
  "Threadsのみ",
  "TikTokのみ",
  "YouTube Shortsのみ",
];

const OFFER_OPTIONS = [
  "販売前・テスト運用中",
  "公開予定のみ・販売未開始",
  "価格未定・販売前",
  "未定・要確認",
  "通常販売",
  "新規販売開始",
  "ベータ参加募集",
  "招待制募集",
  "無料体験・試用案内",
  "早期利用者向け案内",
  "期間限定キャンペーン",
  "アップデート記念",
  "特典付き販売",
  "割引なし・製品価値を中心に訴求",
];

const PROMOTION_PHASE_OPTIONS = [
  "実運用テスト中（販売前）",
  "開発中・進捗共有",
  "公開前予告",
  "ベータ公開予定",
  "公開日決定・カウントダウン",
  "販売開始前",
  "販売開始後",
  "アップデート告知",
];

const TESTING_STATUS_OPTIONS = [
  "未実施",
  "運営者自身で実運用テスト中",
  "noteで実運用テスト中",
  "Tipsで実運用テスト中",
  "Brainで実運用テスト中",
  "複数媒体で実運用テスト中",
  "テスト完了・改善中",
  "公開準備中",
];

const PREVIEW_UPDATE_OPTIONS = [
  "note実運用テスト報告",
  "Tips実運用テスト報告",
  "Brain実運用テスト報告",
  "開発進捗の共有",
  "改善内容の共有",
  "公開前の予告",
  "公開予定の案内",
  "ベータ開始予告",
  "正式公開予告",
  "公開日決定のお知らせ",
];

const TESTED_PLATFORM_OPTIONS = ["note", "Tips", "Brain", "PWA版", "Windows版", "複数媒体"];

const SOCIAL_PLATFORM_OPTIONS: readonly { key: AdminSocialPlatform; label: string }[] = [
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "threads", label: "Threads" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube Shorts" },
];

const DEFAULT_SOCIAL_PRESET_IDS: Record<AdminSocialPlatform, string> = {
  x: "x-standard",
  instagram: "instagram-standard",
  threads: "threads-standard",
  tiktok: "tiktok-standard",
  youtube: "youtube-standard",
};

function TextField({ label, value, onChange, placeholder = "", multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <label className="admin-promo-field">
      <span>{label}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={5} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "選択してください" }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; placeholder?: string }) {
  return (
    <label className="admin-promo-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SelectWithCustomField({ label, value, onChange, options, placeholder = "選択してください", customPlaceholder = "自由入力してください" }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; placeholder?: string; customPlaceholder?: string }) {
  const isPreset = options.includes(value);
  const [customMode, setCustomMode] = useState(false);
  const showCustom = customMode || (Boolean(value) && !isPreset);

  return (
    <label className="admin-promo-field">
      <span>{label}</span>
      <select
        value={showCustom ? "__custom__" : isPreset ? value : ""}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__custom__") {
            setCustomMode(true);
            if (isPreset) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
        <option value="__custom__">その他・自由入力</option>
      </select>
      {showCustom && <input value={isPreset ? "" : value} onChange={(event) => onChange(event.target.value)} placeholder={customPlaceholder} />}
    </label>
  );
}

function SocialLengthSettings({
  presetIds,
  plan,
  onChange,
}: {
  presetIds: Record<AdminSocialPlatform, string>;
  plan: AdminSocialLengthPlan;
  onChange: (platform: AdminSocialPlatform, presetId: string, targetChars: number) => void;
}) {
  return (
    <section className="admin-promo-length-settings" aria-labelledby="admin-promo-length-title">
      <div className="admin-promo-length-head">
        <div>
          <span>SNS LENGTH</span>
          <h3 id="admin-promo-length-title">SNSごとの文字数設定</h3>
        </div>
        <small>選んだ設定はSNS販促・テスト公開予告・キャンペーンで共通利用します。</small>
      </div>
      <div className="admin-promo-length-grid">
        {SOCIAL_PLATFORM_OPTIONS.map((platform) => {
          const presets = socialLengthPresetsFor(platform.key);
          const presetId = presetIds[platform.key];
          const selected = presets.find((item) => item.id === presetId);
          const custom = presetId === "__custom__";
          return (
            <div className="admin-promo-length-card" key={platform.key}>
              <strong>{platform.label}</strong>
              <select
                value={presetId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId === "__custom__") {
                    onChange(platform.key, nextId, plan[platform.key]);
                    return;
                  }
                  const preset = presets.find((item) => item.id === nextId);
                  if (preset) onChange(platform.key, preset.id, preset.targetChars);
                }}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
                <option value="__custom__">その他・自由入力</option>
              </select>
              {custom && (
                <label>
                  <span>目標文字数</span>
                  <input
                    type="number"
                    min={1}
                    max={25000}
                    inputMode="numeric"
                    value={plan[platform.key]}
                    onChange={(event) => onChange(platform.key, "__custom__", sanitizeSocialTargetChars(Number(event.target.value)))}
                  />
                </label>
              )}
              <small>{selected?.note ?? `カスタム: 約${plan[platform.key]}文字。投稿前に各SNSの最新仕様を確認してください。`}</small>
            </div>
          );
        })}
      </div>
      <p className="admin-promo-length-footnote">Xは標準投稿とPremium長文を分けて選択できます。Threadsは通常投稿500文字と最大10,000文字の添付テキストを分けています。YouTube Shortsはタイトル100文字以内＋概要欄文字数として扱います。</p>
    </section>
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
      <p>プロンプトをコピーしてAIへ渡すと、確認済み情報だけを基準にテスト報告・公開予告・紹介記事・SNS素材を作成できます。</p>
    </section>
  );
}

export function AdminPromotionPage() {
  const { state } = useSharedAccessState();
  const [mode, setMode] = useState<Mode>("preview");
  const [message, setMessage] = useState("");
  const [facts, setFacts] = useState<AdminProductFacts>(DEFAULT_ADMIN_PRODUCT_FACTS);
  const [socialLengths, setSocialLengths] = useState<AdminSocialLengthPlan>({ ...DEFAULT_SOCIAL_LENGTH_PLAN });
  const [socialPresetIds, setSocialPresetIds] = useState<Record<AdminSocialPlatform, string>>({ ...DEFAULT_SOCIAL_PRESET_IDS });
  const [article, setArticle] = useState({
    platform: "note" as const,
    phase: "実運用テスト中（販売前）",
    purpose: "実運用テスト状況の共有",
    audience: "AI初心者",
    focus: "製品全体",
    cta: "フォローして続報を待ってもらう",
  });
  const [social, setSocial] = useState({
    platform: "x" as AdminSocialPlatform,
    phase: "実運用テスト中（販売前）",
    purpose: "実運用テスト状況の共有",
    audience: "AI初心者",
    focus: "製品全体",
    cta: "フォローして続報を待ってもらう",
    variants: 3,
  });
  const [campaign, setCampaign] = useState({
    campaignName: "",
    phase: "実運用テスト中（販売前）",
    goal: "実運用テストの共有",
    audience: "AI初心者",
    channels: "note, X, Instagram, Threads, TikTok, YouTube Shorts",
    offer: "販売前・テスト運用中",
    cta: "フォローして続報を待ってもらう",
  });
  const [preview, setPreview] = useState({
    updateType: "note実運用テスト報告",
    testedPlatform: "note",
    verifiedUpdate: "",
    releasePlan: "",
    audience: "AI初心者",
    channels: "note, X, Instagram, Threads",
    cta: "フォローして続報を待ってもらう",
  });

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
  const featureOptions = useMemo(() => {
    const confirmed = facts.features
      .split(/\r?\n|、|,/)
      .map((item) => item.trim().replace(/^[-・•]\s*/, ""))
      .filter(Boolean);
    return Array.from(new Set(["製品全体", ...confirmed]));
  }, [facts.features]);

  const articlePrompt = useMemo(() => buildAdminArticlePromotionPrompt(facts, article), [facts, article]);
  const socialPrompt = useMemo(
    () => buildAdminSocialPromotionPrompt(facts, {
      ...social,
      lengthPresetId: socialPresetIds[social.platform],
      targetChars: socialLengths[social.platform],
    }),
    [facts, social, socialLengths, socialPresetIds],
  );
  const campaignPrompt = useMemo(
    () => buildAdminCampaignPrompt(facts, { ...campaign, socialLengths }),
    [facts, campaign, socialLengths],
  );
  const previewPrompt = useMemo(
    () => buildAdminPreviewPromotionPrompt(facts, { ...preview, socialLengths }),
    [facts, preview, socialLengths],
  );

  const updateSocialLength = (platform: AdminSocialPlatform, presetId: string, targetChars: number) => {
    setSocialPresetIds((current) => ({ ...current, [platform]: presetId }));
    setSocialLengths((current) => ({ ...current, [platform]: sanitizeSocialTargetChars(targetChars) }));
  };

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
          <p className="admin-promo-help">選べる項目はプルダウンから指定できます。該当するものがない場合だけ「その他・自由入力」を使ってください。価格やURLなど事実確認が必要な内容は、未確定なら空欄のままで構いません。</p>
          <div className="admin-promo-form-grid">
            <TextField label="製品名" value={facts.productName} onChange={(value) => setFacts((current) => ({ ...current, productName: value }))} />
            <SelectWithCustomField label="提供形態" value={facts.editions} onChange={(value) => setFacts((current) => ({ ...current, editions: value }))} options={EDITION_OPTIONS} customPlaceholder="例: PWA版 / Windows版（条件付き提供）" />
            <SelectWithCustomField label="提供状況" value={facts.releaseStage} onChange={(value) => setFacts((current) => ({ ...current, releaseStage: value }))} options={RELEASE_STAGE_OPTIONS} customPlaceholder="提供状況を入力" />
            <SelectWithCustomField label="想定ユーザー" value={facts.targetAudience} onChange={(value) => setFacts((current) => ({ ...current, targetAudience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定ユーザーを入力" />
            <TextField label="確認済み機能" value={facts.features} onChange={(value) => setFacts((current) => ({ ...current, features: value }))} multiline />
            <TextField label="価格・販売条件" value={facts.priceText} onChange={(value) => setFacts((current) => ({ ...current, priceText: value }))} placeholder="未確定なら空欄。確定済みの価格・販売条件だけ入力" multiline />
            <TextField label="販売URL" value={facts.salesUrl} onChange={(value) => setFacts((current) => ({ ...current, salesUrl: value }))} placeholder="未確定なら空欄" />
            <SelectWithCustomField label="サポート" value={facts.support} onChange={(value) => setFacts((current) => ({ ...current, support: value }))} options={SUPPORT_OPTIONS} customPlaceholder="確認済みのサポート方法を入力" />
            <SelectWithCustomField label="制限・注意事項" value={facts.limitations} onChange={(value) => setFacts((current) => ({ ...current, limitations: value }))} options={LIMITATION_OPTIONS} customPlaceholder="確認済みの制限・注意事項を入力" />
          </div>
        </section>
      )}

      {mode === "article" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">SALES ARTICLE</p><h2>販売・宣伝記事作成</h2></div></div>
          <p className="admin-promo-help">基本は選ぶだけで作成できます。想定読者・目的・訴求機能・CTAは候補を多めに用意しています。</p>
          <div className="admin-promo-form-grid compact">
            <label className="admin-promo-field"><span>掲載先</span><select value={article.platform} onChange={(event) => setArticle((current) => ({ ...current, platform: event.target.value as typeof article.platform }))}><option value="note">note</option><option value="brain">Brain</option><option value="tips">Tips</option><option value="blog">ブログ</option></select></label>
            <SelectWithCustomField label="目的" value={article.purpose} onChange={(value) => setArticle((current) => ({ ...current, purpose: value }))} options={PURPOSE_OPTIONS} customPlaceholder="記事の目的を入力" />
            <SelectWithCustomField label="想定読者" value={article.audience} onChange={(value) => setArticle((current) => ({ ...current, audience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定読者を入力" />
            <SelectWithCustomField label="特に紹介したい内容" value={article.focus} onChange={(value) => setArticle((current) => ({ ...current, focus: value }))} options={featureOptions} customPlaceholder="紹介したい内容を入力" />
            <SelectWithCustomField label="CTA・誘導先" value={article.cta} onChange={(value) => setArticle((current) => ({ ...current, cta: value }))} options={CTA_OPTIONS} customPlaceholder="CTA・誘導先を入力" />
          </div>
          <PromptOutput prompt={articlePrompt} onCopy={() => void copyPrompt(articlePrompt)} />
        </section>
      )}

      {mode === "social" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">SOCIAL PROMOTION</p><h2>SNSプロモーション作成</h2></div></div>
          <p className="admin-promo-help">SNSと目的を選び、読者・紹介テーマ・CTAを候補から指定するだけで生成用プロンプトを作れます。</p>
          <div className="admin-promo-form-grid compact">
            <label className="admin-promo-field"><span>SNS</span><select value={social.platform} onChange={(event) => setSocial((current) => ({ ...current, platform: event.target.value as typeof social.platform }))}><option value="x">X</option><option value="instagram">Instagram</option><option value="threads">Threads</option><option value="tiktok">TikTok</option><option value="youtube">YouTube Shorts</option></select></label>
            <SelectWithCustomField label="目的" value={social.purpose} onChange={(value) => setSocial((current) => ({ ...current, purpose: value }))} options={PURPOSE_OPTIONS} customPlaceholder="SNS投稿の目的を入力" />
            <SelectWithCustomField label="想定読者" value={social.audience} onChange={(value) => setSocial((current) => ({ ...current, audience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定読者を入力" />
            <SelectWithCustomField label="紹介テーマ" value={social.focus} onChange={(value) => setSocial((current) => ({ ...current, focus: value }))} options={featureOptions} customPlaceholder="紹介テーマを入力" />
            <SelectWithCustomField label="CTA・誘導先" value={social.cta} onChange={(value) => setSocial((current) => ({ ...current, cta: value }))} options={CTA_OPTIONS} customPlaceholder="CTA・誘導先を入力" />
            <SelectField label="作成数" value={String(social.variants)} onChange={(value) => setSocial((current) => ({ ...current, variants: Number(value) || 1 }))} options={["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]} />
          </div>
          <PromptOutput prompt={socialPrompt} onCopy={() => void copyPrompt(socialPrompt)} />
        </section>
      )}

      {mode === "campaign" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">CAMPAIGN</p><h2>販売キャンペーン設計</h2></div></div>
          <p className="admin-promo-help">キャンペーン名だけ必要に応じて入力し、目的・対象・使用媒体・オファー・CTAは候補から選択できます。</p>
          <div className="admin-promo-form-grid compact">
            <TextField label="キャンペーン名" value={campaign.campaignName} onChange={(value) => setCampaign((current) => ({ ...current, campaignName: value }))} placeholder="例: PWAベータ販売開始" />
            <SelectWithCustomField label="目的" value={campaign.goal} onChange={(value) => setCampaign((current) => ({ ...current, goal: value }))} options={CAMPAIGN_GOAL_OPTIONS} customPlaceholder="キャンペーンの目的を入力" />
            <SelectWithCustomField label="想定読者" value={campaign.audience} onChange={(value) => setCampaign((current) => ({ ...current, audience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定読者を入力" />
            <SelectWithCustomField label="使用媒体" value={campaign.channels} onChange={(value) => setCampaign((current) => ({ ...current, channels: value }))} options={CHANNEL_PRESET_OPTIONS} customPlaceholder="例: note, X, Instagram" />
            <SelectWithCustomField label="販売条件・オファー" value={campaign.offer} onChange={(value) => setCampaign((current) => ({ ...current, offer: value }))} options={OFFER_OPTIONS} customPlaceholder="確認済みの販売条件・オファーを入力" />
            <SelectWithCustomField label="CTA・誘導先" value={campaign.cta} onChange={(value) => setCampaign((current) => ({ ...current, cta: value }))} options={CTA_OPTIONS} customPlaceholder="CTA・誘導先を入力" />
          </div>
          <PromptOutput prompt={campaignPrompt} onCopy={() => void copyPrompt(campaignPrompt)} />
        </section>
      )}
    </main>
  );
}
