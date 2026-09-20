import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDesignPlatform = "note" | "tips" | "brain";
export type AccountDesignGenre = "ai" | "sidejob" | "business" | "lifestyle" | "gadget" | "learning" | "parenting" | "health_beauty" | "money" | "creative" | "entertainment" | "other";
export type AccountDesignStyle = "beginner" | "howto" | "experience" | "essay" | "review" | "trend" | "expert" | "creative" | "community" | "other";
export type AccountDesignAudience = "beginner" | "employee" | "sidejob_beginner" | "student" | "parent" | "senior" | "creator" | "business_owner" | "broad" | "other";
export type AccountDesignTone = "friendly" | "gentle" | "professional" | "casual" | "expert" | "energetic" | "other";
export type AccountDesignMonetization = "free_first" | "free_to_paid" | "paid_expertise" | "digital_product" | "service_lead" | "membership_future" | "no_monetization" | "other";
export type AccountDesignGoal = "habit" | "growth" | "monetize" | "authority" | "portfolio" | "other";
export type AccountDesignTrust = "experience" | "expertise" | "process" | "research" | "curation" | "templates" | "community" | "other";
export type AccountDesignContentFocus = "howto" | "case_study" | "comparison" | "review" | "trend" | "essay" | "templates" | "course" | "creative" | "other";

export type PlatformAccountDesign = {
  userId: string;
  platform: AccountDesignPlatform;
  genrePreset: AccountDesignGenre;
  customGenre: string;
  accountStylePreset: AccountDesignStyle;
  customAccountStyle: string;
  audiencePreset: AccountDesignAudience;
  customAudience: string;
  tonePreset: AccountDesignTone;
  customTone: string;
  monetizationPreset: AccountDesignMonetization;
  customMonetization: string;
  goalPreset: AccountDesignGoal;
  customGoal: string;
  trustPreset: AccountDesignTrust;
  customTrust: string;
  contentFocusPreset: AccountDesignContentFocus;
  customContentFocus: string;
  displayName: string;
  profileDraft: string;
  experienceNote: string;
  mainTopics: string[];
  ready: boolean;
  updatedAt: string | null;
};

export const ACCOUNT_DESIGN_PLATFORMS: readonly { value: AccountDesignPlatform; label: string; description: string }[] = [
  { value: "note", label: "note", description: "無料・有料記事を含む継続発信の設計" },
  { value: "tips", label: "Tips", description: "ノウハウ・教材系コンテンツの設計" },
  { value: "brain", label: "Brain", description: "体系的な知識・教材コンテンツの設計" },
] as const;

export const ACCOUNT_DESIGN_GENRES: readonly { value: AccountDesignGenre; label: string }[] = [
  { value: "ai", label: "AI・ChatGPT・生成AI" },
  { value: "sidejob", label: "副業・働き方" },
  { value: "business", label: "ビジネス・キャリア" },
  { value: "lifestyle", label: "暮らし・ライフスタイル" },
  { value: "gadget", label: "ガジェット・IT" },
  { value: "learning", label: "学習・資格" },
  { value: "parenting", label: "子育て・教育" },
  { value: "health_beauty", label: "健康・美容" },
  { value: "money", label: "お金・家計・投資" },
  { value: "creative", label: "創作・クリエイティブ" },
  { value: "entertainment", label: "趣味・エンタメ" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_STYLES: readonly { value: AccountDesignStyle; label: string }[] = [
  { value: "beginner", label: "初心者向けにやさしく解説" },
  { value: "howto", label: "実践ノウハウ・手順中心" },
  { value: "experience", label: "経験・学び・試行錯誤中心" },
  { value: "essay", label: "日記・エッセイ・考え方中心" },
  { value: "review", label: "レビュー・比較・おすすめ中心" },
  { value: "trend", label: "ニュース・最新トレンド整理" },
  { value: "expert", label: "専門知識・深掘り中心" },
  { value: "creative", label: "作品・創作活動中心" },
  { value: "community", label: "読者と一緒に学ぶ・交流型" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_AUDIENCES: readonly { value: AccountDesignAudience; label: string }[] = [
  { value: "beginner", label: "そのジャンルの完全初心者" },
  { value: "employee", label: "会社員・働く人" },
  { value: "sidejob_beginner", label: "副業を始めたい人" },
  { value: "student", label: "学生・学び直し層" },
  { value: "parent", label: "子育て中の人" },
  { value: "senior", label: "50代・60代以上" },
  { value: "creator", label: "クリエイター・発信者" },
  { value: "business_owner", label: "個人事業主・経営者" },
  { value: "broad", label: "年齢を限定せず幅広く" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_TONES: readonly { value: AccountDesignTone; label: string }[] = [
  { value: "friendly", label: "親しみやすい" },
  { value: "gentle", label: "やさしく丁寧" },
  { value: "professional", label: "落ち着いた・信頼感重視" },
  { value: "casual", label: "カジュアル・会話調" },
  { value: "expert", label: "専門的・簡潔" },
  { value: "energetic", label: "明るく前向き" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_MONETIZATION: readonly { value: AccountDesignMonetization; label: string }[] = [
  { value: "free_first", label: "まず無料発信で読者を増やす" },
  { value: "free_to_paid", label: "無料発信から有料コンテンツへつなぐ" },
  { value: "paid_expertise", label: "専門ノウハウを有料で深掘りする" },
  { value: "digital_product", label: "教材・テンプレート等の販売を中心にする" },
  { value: "service_lead", label: "相談・サービス・仕事の依頼につなげる" },
  { value: "membership_future", label: "将来の継続課金・コミュニティも検討する" },
  { value: "no_monetization", label: "収益化せず発信・記録を優先する" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_GOALS: readonly { value: AccountDesignGoal; label: string }[] = [
  { value: "habit", label: "まず継続したい" },
  { value: "growth", label: "読者・フォロワーを増やしたい" },
  { value: "monetize", label: "収益化を育てたい" },
  { value: "authority", label: "専門性・信頼を高めたい" },
  { value: "portfolio", label: "実績・作品を整理したい" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_TRUST: readonly { value: AccountDesignTrust; label: string }[] = [
  { value: "experience", label: "実体験・試行錯誤を見せる" },
  { value: "expertise", label: "専門知識・資格・職歴を活かす" },
  { value: "process", label: "学習・実践の過程を公開する" },
  { value: "research", label: "調査・一次情報・根拠を重視する" },
  { value: "curation", label: "情報整理・比較・選定で価値を出す" },
  { value: "templates", label: "テンプレート・チェックリストを提供する" },
  { value: "community", label: "読者との交流・継続発信で信頼を作る" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const ACCOUNT_DESIGN_CONTENT_FOCUS: readonly { value: AccountDesignContentFocus; label: string }[] = [
  { value: "howto", label: "手順・やり方" },
  { value: "case_study", label: "事例・実践記録" },
  { value: "comparison", label: "比較・選び方" },
  { value: "review", label: "レビュー・感想" },
  { value: "trend", label: "最新情報・トレンド" },
  { value: "essay", label: "考え方・エッセイ" },
  { value: "templates", label: "テンプレート・チェックリスト" },
  { value: "course", label: "体系的な講座・ロードマップ" },
  { value: "creative", label: "作品・創作物" },
  { value: "other", label: "その他（自由入力）" },
] as const;

function optionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
  custom: string,
): string {
  if (value === "other" && custom.trim()) return custom.trim();
  return options.find((item) => item.value === value)?.label ?? value;
}

export function accountDesignLabels(design: PlatformAccountDesign) {
  return {
    genre: optionLabel(ACCOUNT_DESIGN_GENRES, design.genrePreset, design.customGenre),
    style: optionLabel(ACCOUNT_DESIGN_STYLES, design.accountStylePreset, design.customAccountStyle),
    audience: optionLabel(ACCOUNT_DESIGN_AUDIENCES, design.audiencePreset, design.customAudience),
    tone: optionLabel(ACCOUNT_DESIGN_TONES, design.tonePreset, design.customTone),
    monetization: optionLabel(ACCOUNT_DESIGN_MONETIZATION, design.monetizationPreset, design.customMonetization),
    goal: optionLabel(ACCOUNT_DESIGN_GOALS, design.goalPreset, design.customGoal),
    trust: optionLabel(ACCOUNT_DESIGN_TRUST, design.trustPreset, design.customTrust),
    contentFocus: optionLabel(ACCOUNT_DESIGN_CONTENT_FOCUS, design.contentFocusPreset, design.customContentFocus),
  };
}

export function defaultPlatformAccountDesign(userId: string, platform: AccountDesignPlatform): PlatformAccountDesign {
  const platformDefaults: Record<AccountDesignPlatform, Pick<PlatformAccountDesign, "accountStylePreset" | "monetizationPreset" | "goalPreset" | "contentFocusPreset">> = {
    note: { accountStylePreset: "beginner", monetizationPreset: "free_to_paid", goalPreset: "growth", contentFocusPreset: "howto" },
    tips: { accountStylePreset: "howto", monetizationPreset: "digital_product", goalPreset: "monetize", contentFocusPreset: "templates" },
    brain: { accountStylePreset: "expert", monetizationPreset: "paid_expertise", goalPreset: "monetize", contentFocusPreset: "course" },
  };
  return {
    userId,
    platform,
    genrePreset: "ai",
    customGenre: "",
    accountStylePreset: platformDefaults[platform].accountStylePreset,
    customAccountStyle: "",
    audiencePreset: "beginner",
    customAudience: "",
    tonePreset: "friendly",
    customTone: "",
    monetizationPreset: platformDefaults[platform].monetizationPreset,
    customMonetization: "",
    goalPreset: platformDefaults[platform].goalPreset,
    customGoal: "",
    trustPreset: "experience",
    customTrust: "",
    contentFocusPreset: platformDefaults[platform].contentFocusPreset,
    customContentFocus: "",
    displayName: "",
    profileDraft: "",
    experienceNote: "",
    mainTopics: [],
    ready: false,
    updatedAt: null,
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function parseDesign(row: Record<string, unknown>, userId: string, platform: AccountDesignPlatform): PlatformAccountDesign {
  const fallback = defaultPlatformAccountDesign(userId, platform);
  return {
    userId,
    platform,
    genrePreset: oneOf(row.genre_preset, ACCOUNT_DESIGN_GENRES.map((item) => item.value), fallback.genrePreset),
    customGenre: typeof row.custom_genre === "string" ? row.custom_genre : "",
    accountStylePreset: oneOf(row.account_style_preset, ACCOUNT_DESIGN_STYLES.map((item) => item.value), fallback.accountStylePreset),
    customAccountStyle: typeof row.custom_account_style === "string" ? row.custom_account_style : "",
    audiencePreset: oneOf(row.audience_preset, ACCOUNT_DESIGN_AUDIENCES.map((item) => item.value), fallback.audiencePreset),
    customAudience: typeof row.custom_audience === "string" ? row.custom_audience : "",
    tonePreset: oneOf(row.tone_preset, ACCOUNT_DESIGN_TONES.map((item) => item.value), fallback.tonePreset),
    customTone: typeof row.custom_tone === "string" ? row.custom_tone : "",
    monetizationPreset: oneOf(row.monetization_preset, ACCOUNT_DESIGN_MONETIZATION.map((item) => item.value), fallback.monetizationPreset),
    customMonetization: typeof row.custom_monetization === "string" ? row.custom_monetization : "",
    goalPreset: oneOf(row.goal_preset, ACCOUNT_DESIGN_GOALS.map((item) => item.value), fallback.goalPreset),
    customGoal: typeof row.custom_goal === "string" ? row.custom_goal : "",
    trustPreset: oneOf(row.trust_preset, ACCOUNT_DESIGN_TRUST.map((item) => item.value), fallback.trustPreset),
    customTrust: typeof row.custom_trust === "string" ? row.custom_trust : "",
    contentFocusPreset: oneOf(row.content_focus_preset, ACCOUNT_DESIGN_CONTENT_FOCUS.map((item) => item.value), fallback.contentFocusPreset),
    customContentFocus: typeof row.custom_content_focus === "string" ? row.custom_content_focus : "",
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    profileDraft: typeof row.profile_draft === "string" ? row.profile_draft : "",
    experienceNote: typeof row.experience_note === "string" ? row.experience_note : "",
    mainTopics: Array.isArray(row.main_topics) ? row.main_topics.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
    ready: row.ready === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function loadPlatformAccountDesigns(
  client: SupabaseClient,
  userId: string,
): Promise<Record<AccountDesignPlatform, PlatformAccountDesign>> {
  const result: Record<AccountDesignPlatform, PlatformAccountDesign> = {
    note: defaultPlatformAccountDesign(userId, "note"),
    tips: defaultPlatformAccountDesign(userId, "tips"),
    brain: defaultPlatformAccountDesign(userId, "brain"),
  };
  const { data, error } = await client
    .from("platform_account_designs")
    .select("user_id,platform,genre_preset,custom_genre,account_style_preset,custom_account_style,audience_preset,custom_audience,tone_preset,custom_tone,monetization_preset,custom_monetization,goal_preset,custom_goal,trust_preset,custom_trust,content_focus_preset,custom_content_focus,display_name,profile_draft,experience_note,main_topics,ready,updated_at")
    .eq("user_id", userId);
  if (error) throw new Error("アカウント設計を読み込めませんでした。");

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    if (row.platform !== "note" && row.platform !== "tips" && row.platform !== "brain") continue;
    result[row.platform] = parseDesign(row, userId, row.platform);
  }
  return result;
}

export async function savePlatformAccountDesign(
  client: SupabaseClient,
  design: PlatformAccountDesign,
): Promise<PlatformAccountDesign> {
  const payload = {
    user_id: design.userId,
    platform: design.platform,
    genre_preset: design.genrePreset,
    custom_genre: design.customGenre.trim().slice(0, 120),
    account_style_preset: design.accountStylePreset,
    custom_account_style: design.customAccountStyle.trim().slice(0, 180),
    audience_preset: design.audiencePreset,
    custom_audience: design.customAudience.trim().slice(0, 300),
    tone_preset: design.tonePreset,
    custom_tone: design.customTone.trim().slice(0, 120),
    monetization_preset: design.monetizationPreset,
    custom_monetization: design.customMonetization.trim().slice(0, 180),
    goal_preset: design.goalPreset,
    custom_goal: design.customGoal.trim().slice(0, 180),
    trust_preset: design.trustPreset,
    custom_trust: design.customTrust.trim().slice(0, 180),
    content_focus_preset: design.contentFocusPreset,
    custom_content_focus: design.customContentFocus.trim().slice(0, 180),
    display_name: design.displayName.trim().slice(0, 120),
    profile_draft: design.profileDraft.trim().slice(0, 1200),
    experience_note: design.experienceNote.trim().slice(0, 1200),
    main_topics: [...new Set(design.mainTopics.map((item) => item.trim()).filter(Boolean))].slice(0, 12),
    ready: design.ready,
  };

  const { data, error } = await client
    .from("platform_account_designs")
    .upsert(payload, { onConflict: "user_id,platform" })
    .select("user_id,platform,genre_preset,custom_genre,account_style_preset,custom_account_style,audience_preset,custom_audience,tone_preset,custom_tone,monetization_preset,custom_monetization,goal_preset,custom_goal,trust_preset,custom_trust,content_focus_preset,custom_content_focus,display_name,profile_draft,experience_note,main_topics,ready,updated_at")
    .single();

  if (error || !data) throw new Error("アカウント設計を保存できませんでした。");
  return parseDesign(data as Record<string, unknown>, design.userId, design.platform);
}

export function buildPlatformProfileDraft(design: PlatformAccountDesign): string {
  const labels = accountDesignLabels(design);
  const platformName = ACCOUNT_DESIGN_PLATFORMS.find((item) => item.value === design.platform)?.label ?? design.platform;
  const parts = [
    `${labels.genre}を中心に発信する${platformName}アカウントです。`,
    `${labels.audience}に向けて、${labels.style}の形で、${labels.tone}な文章を届けます。`,
    `主な内容は${labels.contentFocus}。目的は「${labels.goal}」です。`,
    `信頼は「${labels.trust}」を大切に積み上げます。`,
  ];
  if (design.mainTopics.length) parts.push(`主なテーマ: ${design.mainTopics.slice(0, 5).join(" / ")}。`);
  return parts.join("\n");
}
