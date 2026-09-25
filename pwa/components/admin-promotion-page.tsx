"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { ActiveWorkspacePresetBadge } from "@/features/presets/active-workspace-preset-badge";
import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import { WORKSPACE_PRESETS } from "@/features/presets/workspace-presets";
import {
  PromptOutput,
  SelectField,
  SelectWithCustomField,
  SocialLengthSettings,
  TextField,
} from "@/components/admin-promotion/admin-promotion-fields";
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
  type AdminArticlePromotionInput,
  type AdminProductFacts,
  type AdminSocialLengthPlan,
  type AdminSocialPlatform,
} from "@/lib/admin-promotion";
type Mode = "product" | "preview" | "article" | "social" | "campaign";

const MODES: Array<{ key: Mode; label: string; description: string }> = [
  { key: "product", label: "製品情報を整える", description: "宣伝に使う確認済み情報を先に整理" },
  { key: "preview", label: "テスト・公開予告を作る", description: "実運用テスト・開発進捗・公開予定" },
  { key: "article", label: "紹介・販売記事を作る", description: "note / Brain / Tips / ブログ向け" },
  { key: "social", label: "SNS投稿を作る", description: "X・Instagram・Threads・短尺動画向け" },
  { key: "campaign", label: "まとめて販促計画を作る", description: "記事とSNSを14日分まとめて設計" },
];

type QuickPresetKey =
  | ""
  | "prelaunch-test"
  | "development-update"
  | "release-preview"
  | "sales-launch"
  | "product-faq"
  | "sns-quick"
  | "update-campaign";

const QUICK_PRESETS: Array<{ key: QuickPresetKey; label: string; description: string }> = [
  { key: "", label: "現在の設定をそのまま使う", description: "下の項目を自分で選ぶ" },
  { key: "prelaunch-test", label: "実運用テストを共有", description: "note等で試した内容を販売前として発信" },
  { key: "development-update", label: "開発進捗を共有", description: "PWAの改善・開発状況をSNS中心に発信" },
  { key: "release-preview", label: "公開予告を作る", description: "公開予定・ベータ予定を記事とSNSへ展開" },
  { key: "sales-launch", label: "販売開始を告知", description: "販売ページへの送客を含む14日販促" },
  { key: "product-faq", label: "FAQ・不安解消記事", description: "購入前の疑問を整理する長文記事" },
  { key: "sns-quick", label: "X投稿をすぐ作る", description: "短時間でSNS販促案を作る" },
  { key: "update-campaign", label: "アップデート告知", description: "既存ユーザー向け再訴求をまとめて設計" },
];

type SalesProductKey = "aas-pwa" | "pwa-7day" | "pwa-monthly" | "prelaunch";
type SalesChannelKey = "note" | "brain" | "tips" | "direct" | "stripe" | "social";
type PromotionMethodKey = "article" | "social" | "campaign" | "preview";

const SALES_PRODUCT_OPTIONS: Array<{ key: SalesProductKey; label: string; note: string }> = [
  { key: "aas-pwa", label: "AAS PWA版", note: "通常のPWA版紹介・販売向け" },
  { key: "pwa-7day", label: "PWA 7日利用パス（設定時のみ）", note: "販売設定で7日券を有効にする場合の販促向け" },
  { key: "pwa-monthly", label: "PWA 月額プラン（設定時のみ）", note: "販売設定で月額を有効にする場合の販促向け" },
  { key: "prelaunch", label: "販売前・公開予告", note: "まだ販売せず、テスト・開発・公開予定を伝える" },
];

const SALES_CHANNEL_OPTIONS: Array<{ key: SalesChannelKey; label: string; note: string }> = [
  { key: "note", label: "note", note: "記事販売・案内ページへ誘導" },
  { key: "brain", label: "Brain", note: "Brainの商品・案内ページへ誘導" },
  { key: "tips", label: "Tips", note: "Tipsの商品・案内ページへ誘導" },
  { key: "direct", label: "AAS公式ページ・直接案内", note: "公式ページや利用開始導線を使う" },
  { key: "stripe", label: "AAS内Stripe（設定時のみ）", note: "販売設定でStripe受付を有効にした場合だけ利用" },
  { key: "social", label: "SNSから案内", note: "X・Instagram・Threads等から誘導" },
];

const PROMOTION_METHOD_OPTIONS: Array<{ key: PromotionMethodKey; label: string; note: string }> = [
  { key: "article", label: "紹介・販売記事", note: "長文で詳しく説明する" },
  { key: "social", label: "SNS投稿", note: "短時間で複数投稿案を作る" },
  { key: "campaign", label: "14日プロモーション計画", note: "記事とSNSをまとめて設計する" },
  { key: "preview", label: "テスト・公開予告", note: "販売前の進捗・予告を誠実に発信する" },
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

const DEFAULT_SOCIAL_PRESET_IDS: Record<AdminSocialPlatform, string> = {
  x: "x-standard",
  instagram: "instagram-standard",
  threads: "threads-standard",
  tiktok: "tiktok-standard",
  youtube: "youtube-standard",
};

export function AdminPromotionPage() {
  const { state } = useSharedAccessState();
  const { preference: workspacePreference } = useWorkspacePreset();
  const [mode, setMode] = useState<Mode>("preview");
  const [quickPreset, setQuickPreset] = useState<QuickPresetKey>("");
  const [salesProduct, setSalesProduct] = useState<SalesProductKey>("aas-pwa");
  const [salesChannel, setSalesChannel] = useState<SalesChannelKey>("note");
  const [promotionMethod, setPromotionMethod] = useState<PromotionMethodKey>("article");
  const [message, setMessage] = useState("");
  const [facts, setFacts] = useState<AdminProductFacts>(DEFAULT_ADMIN_PRODUCT_FACTS);
  const [socialLengths, setSocialLengths] = useState<AdminSocialLengthPlan>({ ...DEFAULT_SOCIAL_LENGTH_PLAN });
  const [socialPresetIds, setSocialPresetIds] = useState<Record<AdminSocialPlatform, string>>({ ...DEFAULT_SOCIAL_PRESET_IDS });
  const [article, setArticle] = useState<AdminArticlePromotionInput>({
    platform: "note",
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
  const workspacePresetAppliedRef = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(ADMIN_PRODUCT_FACTS_STORAGE_KEY);
        if (saved) {
          const merged = { ...DEFAULT_ADMIN_PRODUCT_FACTS, ...JSON.parse(saved) } as AdminProductFacts;
          if (merged.productName === "AI Article Studio") merged.productName = "AI Action Studio";
          setFacts(merged);
        }
        const requested = new URLSearchParams(window.location.search).get("mode");
        if (requested && MODES.some((item) => item.key === requested)) setMode(requested as Mode);
      } catch {
        // Keep safe defaults when local data is unavailable or malformed.
      }
    });
  }, []);

  useEffect(() => {
    if (workspacePresetAppliedRef.current || !workspacePreference?.applySns) return;
    workspacePresetAppliedRef.current = true;
    const preset = WORKSPACE_PRESETS[workspacePreference.presetKey];
    const nextLengths = { ...preset.social.targetCharacters };
    const nextPresetIds = { ...DEFAULT_SOCIAL_PRESET_IDS };
    for (const platform of Object.keys(nextLengths) as AdminSocialPlatform[]) {
      const match = socialLengthPresetsFor(platform).find((item) => item.targetChars === nextLengths[platform]);
      nextPresetIds[platform] = match?.id ?? "__custom__";
    }
    queueMicrotask(() => {
      setSocialLengths(nextLengths);
      setSocialPresetIds(nextPresetIds);
      if (workspacePreference.presetKey === "aas_official") {
        setMode((current) => current === "product" ? current : "preview");
      }
    });
  }, [workspacePreference]);

  const isAdmin = state.kind === "ready" && state.profile.role === "admin" && state.profile.status === "active";
  const featureOptions = useMemo(() => {
    const confirmed = facts.features
      .split(/\r?\n|、|,/)
      .map((item) => item.trim().replace(/^[-・•]\s*/, ""))
      .filter(Boolean);
    return Array.from(new Set(["製品全体", ...confirmed]));
  }, [facts.features]);

  const articlePrompt = useMemo(() => buildAdminArticlePromotionPrompt(facts, article), [facts, article, workspacePreference]);
  const socialPrompt = useMemo(
    () => buildAdminSocialPromotionPrompt(facts, {
      ...social,
      lengthPresetId: socialPresetIds[social.platform],
      targetChars: socialLengths[social.platform],
    }),
    [facts, social, socialLengths, socialPresetIds, workspacePreference],
  );
  const campaignPrompt = useMemo(
    () => buildAdminCampaignPrompt(facts, { ...campaign, socialLengths }),
    [facts, campaign, socialLengths, workspacePreference],
  );
  const previewPrompt = useMemo(
    () => buildAdminPreviewPromotionPrompt(facts, { ...preview, socialLengths }),
    [facts, preview, socialLengths, workspacePreference],
  );

  const applyThreeStepPromotion = () => {
    setQuickPreset("");

    const productLabel = SALES_PRODUCT_OPTIONS.find((item) => item.key === salesProduct)?.label ?? "AAS PWA版";
    const channelLabel = SALES_CHANNEL_OPTIONS.find((item) => item.key === salesChannel)?.label ?? "note";
    const salesCta = salesChannel === "direct"
      ? "公式ページへ誘導"
      : salesChannel === "social"
        ? "プロフィールへ誘導"
        : "販売URLへ誘導";
    const articlePlatform = salesChannel === "brain"
      ? "brain"
      : salesChannel === "tips"
        ? "tips"
        : "note";
    const campaignChannels = salesChannel === "brain"
      ? "Brain, X"
      : salesChannel === "tips"
        ? "Tips, X"
        : salesChannel === "social"
          ? "X, Instagram, Threads, TikTok, YouTube Shorts"
          : "note, X, Instagram, Threads";
    const sellingConfirmed = facts.releaseStage === "先行販売" || facts.releaseStage === "正式販売";
    const prelaunch = salesProduct === "prelaunch" || promotionMethod === "preview" || !sellingConfirmed;

    setFacts((current) => ({
      ...current,
      productName: "AI Action Studio",
      editions: "PWA版のみ",
      releaseStage: prelaunch ? current.releaseStage || "内部テスト" : current.releaseStage,
    }));

    if (promotionMethod === "article") {
      setMode("article");
      setArticle((current) => ({
        ...current,
        platform: articlePlatform,
        phase: prelaunch ? "公開前予告" : "販売開始後",
        purpose: prelaunch ? "公開前の予告" : "新規紹介・販売",
        audience: current.audience || "副業初心者",
        focus: productLabel,
        cta: prelaunch ? "公開予定を知らせる" : salesCta,
      }));
    } else if (promotionMethod === "social") {
      setMode("social");
      setSocial((current) => ({
        ...current,
        platform: "x",
        phase: prelaunch ? "公開前予告" : "販売開始後",
        purpose: prelaunch ? "公開予定の案内" : "販売開始告知",
        audience: current.audience || "副業初心者",
        focus: productLabel,
        cta: prelaunch ? "フォローして続報を待ってもらう" : salesCta,
        variants: 3,
      }));
    } else if (promotionMethod === "campaign") {
      setMode("campaign");
      setCampaign((current) => ({
        ...current,
        campaignName: productLabel + (prelaunch ? " 公開予告" : " 販促"),
        phase: prelaunch ? "公開前予告" : "販売開始後",
        goal: prelaunch ? "公開前の期待形成" : "販売開始・認知拡大",
        audience: current.audience || "副業初心者",
        channels: campaignChannels,
        offer: prelaunch ? "公開予定のみ・販売未開始" : "通常販売",
        cta: prelaunch ? "公開予定を知らせる" : salesCta,
      }));
    } else {
      setMode("preview");
      setPreview((current) => ({
        ...current,
        updateType: salesProduct === "prelaunch" ? "正式公開予告" : "公開予定の案内",
        testedPlatform: salesChannel === "note" || salesChannel === "brain" || salesChannel === "tips"
          ? channelLabel
          : "PWA版",
        audience: current.audience || "副業初心者",
        channels: campaignChannels,
        cta: "フォローして続報を待ってもらう",
      }));
    }

    const methodLabel = PROMOTION_METHOD_OPTIONS.find((item) => item.key === promotionMethod)?.label ?? "販促";
    setMessage(
      "3ステップ設定を反映しました: " + productLabel + " / " + channelLabel + " / " + methodLabel
      + (prelaunch && salesProduct !== "prelaunch" ? "（販売中の確認がないため販売前表現で設定）" : ""),
    );
  };

  const applyQuickPreset = (presetKey: QuickPresetKey) => {
    setQuickPreset(presetKey);
    switch (presetKey) {
      case "prelaunch-test":
        setMode("preview");
        setPreview((current) => ({
          ...current,
          updateType: "note実運用テスト報告",
          testedPlatform: "note",
          audience: "副業初心者",
          channels: "note, X, Instagram, Threads",
          cta: "フォローして続報を待ってもらう",
        }));
        break;
      case "development-update":
        setMode("preview");
        setPreview((current) => ({
          ...current,
          updateType: "開発進捗の共有",
          testedPlatform: "PWA版",
          audience: "AIをすでに使っている人",
          channels: "X, Instagram, Threads",
          cta: "開発状況を見てもらう",
        }));
        break;
      case "release-preview":
        setMode("preview");
        setPreview((current) => ({
          ...current,
          updateType: "正式公開予告",
          testedPlatform: "PWA版",
          audience: "副業初心者",
          channels: "note, X, Instagram, Threads",
          cta: "公開予定を知らせる",
        }));
        break;
      case "sales-launch":
        setMode("campaign");
        setCampaign((current) => ({
          ...current,
          campaignName: "AAS 販売開始",
          phase: "販売開始後",
          goal: "販売開始・認知拡大",
          audience: "副業初心者",
          channels: "note, X, Instagram, Threads",
          offer: "新規販売開始",
          cta: "販売URLへ誘導",
        }));
        break;
      case "product-faq":
        setMode("article");
        setArticle((current) => ({
          ...current,
          platform: "note",
          phase: "販売開始後",
          purpose: "FAQ・不安解消",
          audience: "副業初心者",
          focus: "製品全体",
          cta: "詳細記事へ誘導",
        }));
        break;
      case "sns-quick":
        setMode("social");
        setSocial((current) => ({
          ...current,
          platform: "x",
          phase: "開発中・進捗共有",
          purpose: "開発進捗の共有",
          audience: "AIをすでに使っている人",
          focus: "製品全体",
          cta: "フォローを促す",
          variants: 3,
        }));
        break;
      case "update-campaign":
        setMode("campaign");
        setCampaign((current) => ({
          ...current,
          campaignName: "AAS アップデート告知",
          phase: "アップデート告知",
          goal: "アップデート周知",
          audience: "AIをすでに使っている人",
          channels: "note, X, Instagram, Threads",
          offer: "アップデート記念",
          cta: "詳細記事へ誘導",
        }));
        break;
      default:
        break;
    }
    if (presetKey) setMessage("おすすめ設定を反映しました。必要な項目だけ下で調整してください。");
  };

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
        {state.kind === "signed_out" && <p className="route-notice">先にログインしてください。</p>}
        {state.kind !== "loading" && state.kind !== "signed_out" && <p className="route-notice error">この機能はactive管理者のみ利用できます。</p>}
        <Link className="route-back" href="/">← ホームへ戻る</Link>
      </section></main>
    );
  }

  return (
    <main className="admin-promo-page">
      <header className="admin-promo-head">
        <div><p className="eyebrow">SALES & PROMOTION</p><h1>販売・プロモーションセンター</h1><p>AI Action Studio（AAS）の販売準備・公開予告・記事・SNS・キャンペーンを、選ぶだけで組み立てられる管理者専用センターです。</p></div>
        <div><Link href="/admin/sales">販売設定</Link><Link href="/admin">管理ダッシュボード</Link><Link href="/">ホーム</Link></div>
      </header>

      <ActiveWorkspacePresetBadge feature="sns" />
      <div className="admin-promo-safety"><strong>確認済み情報を基準に作成</strong><span>販売前は「テスト中・準備中・公開予定」として扱い、未入力の価格・実績・レビュー・公開日をAIに作らせません。製品情報は現在この端末だけに保存されます。</span></div>
      {message && <div className="route-notice">{message}</div>}

      <section className="admin-promo-three-step" aria-label="3ステップかんたん販促">
        <div className="admin-promo-three-step-head">
          <div>
            <p className="eyebrow">3 STEP AUTO SETUP</p>
            <h2>3ステップかんたん販促</h2>
            <p>商品・販売先・宣伝方法を選ぶだけで、下の詳細設定をまとめて自動入力します。</p>
          </div>
          <strong>販売設定そのものは変更しません</strong>
        </div>
        <div className="admin-promo-three-step-grid">
          <label className="admin-promo-field">
            <span>① 販売する商品・プラン</span>
            <select value={salesProduct} onChange={(event) => setSalesProduct(event.target.value as SalesProductKey)}>
              {SALES_PRODUCT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.note}</option>)}
            </select>
          </label>
          <label className="admin-promo-field">
            <span>② 販売先・誘導先</span>
            <select value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as SalesChannelKey)}>
              {SALES_CHANNEL_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.note}</option>)}
            </select>
          </label>
          <label className="admin-promo-field">
            <span>③ 宣伝方法</span>
            <select value={promotionMethod} onChange={(event) => setPromotionMethod(event.target.value as PromotionMethodKey)}>
              {PROMOTION_METHOD_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.note}</option>)}
            </select>
          </label>
        </div>
        <div className="admin-promo-three-step-actions">
          <button type="button" onClick={applyThreeStepPromotion}>この3項目で自動設定</button>
          <small>Stripe・7日券・月額を選んでも販売受付は有効化されません。実際の受付状態は「販売設定」で別途管理します。</small>
        </div>
      </section>

      <section className="admin-promo-quick-start" aria-label="かんたん作成">
        <div className="admin-promo-quick-head">
          <div><p className="eyebrow">QUICK START</p><h2>かんたん作成</h2><p>まず2つ選ぶだけ。細かい設定は必要な場合だけ下で変更できます。</p></div>
          <Link href="/admin/sales">現在の販売設定を確認 →</Link>
        </div>
        <div className="admin-promo-quick-grid">
          <label className="admin-promo-field">
            <span>① 作りたいもの</span>
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as Mode);
                setQuickPreset("");
              }}
            >
              {MODES.map((item) => <option key={item.key} value={item.key}>{item.label} — {item.description}</option>)}
            </select>
          </label>
          <label className="admin-promo-field">
            <span>② おすすめプリセット</span>
            <select value={quickPreset} onChange={(event) => applyQuickPreset(event.target.value as QuickPresetKey)}>
              {QUICK_PRESETS.map((item) => <option key={item.key || "custom"} value={item.key}>{item.label} — {item.description}</option>)}
            </select>
          </label>
        </div>
        <p className="admin-promo-quick-note">自由入力が必要なのは、確認済みのテスト内容・URL・価格など事実情報だけです。その他は基本的にプルダウンから選べます。</p>
      </section>

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
            <SelectWithCustomField label="実運用・テスト状況" value={facts.testingStatus} onChange={(value) => setFacts((current) => ({ ...current, testingStatus: value }))} options={TESTING_STATUS_OPTIONS} customPlaceholder="現在のテスト状況を入力" />
            <TextField label="確認済みテスト内容・観察結果" value={facts.testingNotes} onChange={(value) => setFacts((current) => ({ ...current, testingNotes: value }))} placeholder="実際に試した内容・確認できたことだけを入力。PV・売上・効果など未確認の数値は書かない" multiline />
            <TextField label="公開・販売予定" value={facts.releasePlan} onChange={(value) => setFacts((current) => ({ ...current, releasePlan: value }))} placeholder="例: 2026年10月にPWAテスト版を公開予定。未確定なら「時期未定」" />
            <TextField label="テスト記事・案内URL" value={facts.referenceUrl} onChange={(value) => setFacts((current) => ({ ...current, referenceUrl: value }))} placeholder="note等で公開した確認済みURL。未公開なら空欄" />
          </div>
        </section>
      )}

      {mode === "preview" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">PRE-LAUNCH UPDATE</p><h2>テスト・開発進捗・公開予告</h2></div></div>
          <p className="admin-promo-help">まだ販売していない段階でも使えます。自分でnote等を実運用テストした内容、改善中の点、公開予定を「販売中」と誤解されない形で記事・SNSへ展開します。</p>
          <div className="admin-promo-form-grid compact">
            <SelectWithCustomField label="発信内容" value={preview.updateType} onChange={(value) => setPreview((current) => ({ ...current, updateType: value }))} options={PREVIEW_UPDATE_OPTIONS} customPlaceholder="今回の発信内容を入力" />
            <SelectWithCustomField label="テスト・掲載先" value={preview.testedPlatform} onChange={(value) => setPreview((current) => ({ ...current, testedPlatform: value }))} options={TESTED_PLATFORM_OPTIONS} customPlaceholder="例: note / 自分のブログ" />
            <TextField label="今回共有してよい確認済み内容" value={preview.verifiedUpdate} onChange={(value) => setPreview((current) => ({ ...current, verifiedUpdate: value }))} placeholder="例: AASで作った記事を自分のnoteへ掲載し、作成フローと公開までの操作を確認した。確認していない成果や反応は書かない。" multiline />
            <TextField label="今回伝える公開予定" value={preview.releasePlan} onChange={(value) => setPreview((current) => ({ ...current, releasePlan: value }))} placeholder="未確定なら「時期未定」。確定済みの予定だけ入力" />
            <SelectWithCustomField label="想定読者" value={preview.audience} onChange={(value) => setPreview((current) => ({ ...current, audience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定読者を入力" />
            <SelectWithCustomField label="使用媒体" value={preview.channels} onChange={(value) => setPreview((current) => ({ ...current, channels: value }))} options={CHANNEL_PRESET_OPTIONS} customPlaceholder="例: note, X, Instagram" />
            <SelectWithCustomField label="CTA・誘導先" value={preview.cta} onChange={(value) => setPreview((current) => ({ ...current, cta: value }))} options={CTA_OPTIONS} customPlaceholder="CTA・誘導先を入力" />
          </div>
          <div className="admin-promo-prelaunch-note">
            <strong>販売前モード</strong>
            <span>価格・販売URL・公開日が未確定なら断定しません。実際に確認していないPV、売上、反応、レビュー、感想も作成しません。</span>
          </div>
          <SocialLengthSettings presetIds={socialPresetIds} plan={socialLengths} onChange={updateSocialLength} />
          <PromptOutput prompt={previewPrompt} onCopy={() => void copyPrompt(previewPrompt)} />
        </section>
      )}

      {mode === "article" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">ARTICLE PROMOTION</p><h2>紹介・販売記事作成</h2></div></div>
          <p className="admin-promo-help">販売前のテスト共有・公開予告から販売開始後の記事まで、発信フェーズを選んで作成できます。</p>
          <div className="admin-promo-form-grid compact">
            <label className="admin-promo-field"><span>掲載先</span><select value={article.platform} onChange={(event) => setArticle((current) => ({ ...current, platform: event.target.value as typeof article.platform }))}><option value="note">note</option><option value="brain">Brain</option><option value="tips">Tips</option><option value="blog">ブログ</option></select></label>
            <SelectWithCustomField label="発信フェーズ" value={article.phase} onChange={(value) => setArticle((current) => ({ ...current, phase: value }))} options={PROMOTION_PHASE_OPTIONS} customPlaceholder="現在の発信フェーズを入力" />
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
          <p className="admin-promo-help">販売前のテスト共有・公開予告にも対応します。X Premiumなど契約・媒体ごとの文字数も下で選べます。</p>
          <div className="admin-promo-form-grid compact">
            <label className="admin-promo-field"><span>SNS</span><select value={social.platform} onChange={(event) => setSocial((current) => ({ ...current, platform: event.target.value as typeof social.platform }))}><option value="x">X</option><option value="instagram">Instagram</option><option value="threads">Threads</option><option value="tiktok">TikTok</option><option value="youtube">YouTube Shorts</option></select></label>
            <SelectWithCustomField label="発信フェーズ" value={social.phase} onChange={(value) => setSocial((current) => ({ ...current, phase: value }))} options={PROMOTION_PHASE_OPTIONS} customPlaceholder="現在の発信フェーズを入力" />
            <SelectWithCustomField label="目的" value={social.purpose} onChange={(value) => setSocial((current) => ({ ...current, purpose: value }))} options={PURPOSE_OPTIONS} customPlaceholder="SNS投稿の目的を入力" />
            <SelectWithCustomField label="想定読者" value={social.audience} onChange={(value) => setSocial((current) => ({ ...current, audience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定読者を入力" />
            <SelectWithCustomField label="紹介テーマ" value={social.focus} onChange={(value) => setSocial((current) => ({ ...current, focus: value }))} options={featureOptions} customPlaceholder="紹介テーマを入力" />
            <SelectWithCustomField label="CTA・誘導先" value={social.cta} onChange={(value) => setSocial((current) => ({ ...current, cta: value }))} options={CTA_OPTIONS} customPlaceholder="CTA・誘導先を入力" />
            <SelectField label="作成数" value={String(social.variants)} onChange={(value) => setSocial((current) => ({ ...current, variants: Number(value) || 1 }))} options={["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]} />
          </div>
          <SocialLengthSettings presetIds={socialPresetIds} plan={socialLengths} onChange={updateSocialLength} />
          <PromptOutput prompt={socialPrompt} onCopy={() => void copyPrompt(socialPrompt)} />
        </section>
      )}

      {mode === "campaign" && (
        <section className="admin-promo-panel admin-promo-builder">
          <div className="admin-promo-section-title"><div><p className="eyebrow">CAMPAIGN</p><h2>プロモーションキャンペーン設計</h2></div></div>
          <p className="admin-promo-help">販売前のテスト共有・公開予告から販売開始後まで、記事とSNSをまとめた14日間の発信計画を作れます。</p>
          <div className="admin-promo-form-grid compact">
            <TextField label="キャンペーン名" value={campaign.campaignName} onChange={(value) => setCampaign((current) => ({ ...current, campaignName: value }))} placeholder="例: PWAベータ販売開始" />
            <SelectWithCustomField label="発信フェーズ" value={campaign.phase} onChange={(value) => setCampaign((current) => ({ ...current, phase: value }))} options={PROMOTION_PHASE_OPTIONS} customPlaceholder="現在の発信フェーズを入力" />
            <SelectWithCustomField label="目的" value={campaign.goal} onChange={(value) => setCampaign((current) => ({ ...current, goal: value }))} options={CAMPAIGN_GOAL_OPTIONS} customPlaceholder="キャンペーンの目的を入力" />
            <SelectWithCustomField label="想定読者" value={campaign.audience} onChange={(value) => setCampaign((current) => ({ ...current, audience: value }))} options={AUDIENCE_OPTIONS} customPlaceholder="想定読者を入力" />
            <SelectWithCustomField label="使用媒体" value={campaign.channels} onChange={(value) => setCampaign((current) => ({ ...current, channels: value }))} options={CHANNEL_PRESET_OPTIONS} customPlaceholder="例: note, X, Instagram" />
            <SelectWithCustomField label="販売条件・オファー" value={campaign.offer} onChange={(value) => setCampaign((current) => ({ ...current, offer: value }))} options={OFFER_OPTIONS} customPlaceholder="確認済みの販売条件・オファーを入力" />
            <SelectWithCustomField label="CTA・誘導先" value={campaign.cta} onChange={(value) => setCampaign((current) => ({ ...current, cta: value }))} options={CTA_OPTIONS} customPlaceholder="CTA・誘導先を入力" />
          </div>
          <SocialLengthSettings presetIds={socialPresetIds} plan={socialLengths} onChange={updateSocialLength} />
          <PromptOutput prompt={campaignPrompt} onCopy={() => void copyPrompt(campaignPrompt)} />
        </section>
      )}
    </main>
  );
}
