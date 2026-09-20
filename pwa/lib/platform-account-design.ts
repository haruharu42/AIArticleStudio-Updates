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

const ACCOUNT_DESIGN_SELECT_COLUMNS = "user_id,platform,genre_preset,custom_genre,account_style_preset,custom_account_style,audience_preset,custom_audience,tone_preset,custom_tone,monetization_preset,custom_monetization,goal_preset,custom_goal,trust_preset,custom_trust,content_focus_preset,custom_content_focus,display_name,profile_draft,experience_note,main_topics,ready,updated_at";

let runtimePlatformAccountDesigns: Partial<Record<AccountDesignPlatform, PlatformAccountDesign>> = {};

export function validatePlatformAccountDesign(design: PlatformAccountDesign): PlatformAccountDesign {
  const missing: string[] = [];
  if (design.genrePreset === "other" && !design.customGenre.trim()) missing.push("ジャンル");
  if (design.accountStylePreset === "other" && !design.customAccountStyle.trim()) missing.push("アカウント型");
  if (design.audiencePreset === "other" && !design.customAudience.trim()) missing.push("読者");
  if (design.tonePreset === "other" && !design.customTone.trim()) missing.push("文章・発信の雰囲気");
  if (design.monetizationPreset === "other" && !design.customMonetization.trim()) missing.push("収益化方針");
  if (design.goalPreset === "other" && !design.customGoal.trim()) missing.push("運営目的");
  if (design.trustPreset === "other" && !design.customTrust.trim()) missing.push("信頼の作り方");
  if (design.contentFocusPreset === "other" && !design.customContentFocus.trim()) missing.push("コンテンツの中心");
  if (missing.length) {
    throw new Error(`「その他」を選んだ項目を入力してください: ${missing.join(" / ")}`);
  }
  return {
    ...design,
    customGenre: design.customGenre.trim().slice(0, 120),
    customAccountStyle: design.customAccountStyle.trim().slice(0, 180),
    customAudience: design.customAudience.trim().slice(0, 300),
    customTone: design.customTone.trim().slice(0, 120),
    customMonetization: design.customMonetization.trim().slice(0, 180),
    customGoal: design.customGoal.trim().slice(0, 180),
    customTrust: design.customTrust.trim().slice(0, 180),
    customContentFocus: design.customContentFocus.trim().slice(0, 180),
    displayName: design.displayName.trim().slice(0, 120),
    profileDraft: design.profileDraft.trim().slice(0, 1200),
    experienceNote: design.experienceNote.trim().slice(0, 1200),
    mainTopics: [...new Set(design.mainTopics.map((item) => item.trim()).filter(Boolean))].slice(0, 12),
  };
}

export function setRuntimePlatformAccountDesigns(
  designs: Record<AccountDesignPlatform, PlatformAccountDesign> | null,
): void {
  runtimePlatformAccountDesigns = designs ? { ...designs } : {};
}

export function getRuntimePlatformAccountDesign(platform: string): PlatformAccountDesign | null {
  if (platform !== "note" && platform !== "tips" && platform !== "brain") return null;
  const design = runtimePlatformAccountDesigns[platform] ?? null;
  return design?.ready ? design : null;
}

export function buildPlatformAccountPromptContext(platform: string): string {
  const design = getRuntimePlatformAccountDesign(platform);
  if (!design) return "";
  const labels = accountDesignLabels(design);
  const topics = design.mainTopics.length ? design.mainTopics.slice(0, 8).join(" / ") : "未指定";
  const experience = design.experienceNote.trim() || "未指定";
  return `\n\n【ACCOUNT DESIGN】\nこの掲載先の保存済みアカウント設計を記事の方向性として反映する。記事テーマやユーザーが今回指定した条件と衝突する場合は、今回の明示条件を優先する。\nアカウント型: ${labels.style}\n想定読者: ${labels.audience}\n発信トーン: ${labels.tone}\n収益化方針: ${labels.monetization}\n運営目的: ${labels.goal}\n信頼の作り方: ${labels.trust}\nコンテンツの中心: ${labels.contentFocus}\n主なテーマ: ${topics}\nユーザーが事実として入力した経験・背景: ${experience}\n経験・資格・実績は上記に書かれた範囲だけを事実として扱い、補完・誇張・創作しない。`;
}

export function serializePlatformAccountDesignDraft(design: PlatformAccountDesign): string {
  return JSON.stringify({
    version: 1,
    baseUpdatedAt: design.updatedAt,
    draft: design,
  });
}

export function restorePlatformAccountDesignDraft(
  raw: string | null,
  cloud: PlatformAccountDesign,
): PlatformAccountDesign | null {
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as { version?: unknown; baseUpdatedAt?: unknown; draft?: unknown };
    if (envelope.version !== 1 || envelope.baseUpdatedAt !== cloud.updatedAt || !envelope.draft || typeof envelope.draft !== "object" || Array.isArray(envelope.draft)) {
      return null;
    }
    const draft = envelope.draft as Record<string, unknown>;
    const candidate: PlatformAccountDesign = {
      ...cloud,
      genrePreset: oneOf(draft.genrePreset, ACCOUNT_DESIGN_GENRES.map((item) => item.value), cloud.genrePreset),
      customGenre: typeof draft.customGenre === "string" ? draft.customGenre : cloud.customGenre,
      accountStylePreset: oneOf(draft.accountStylePreset, ACCOUNT_DESIGN_STYLES.map((item) => item.value), cloud.accountStylePreset),
      customAccountStyle: typeof draft.customAccountStyle === "string" ? draft.customAccountStyle : cloud.customAccountStyle,
      audiencePreset: oneOf(draft.audiencePreset, ACCOUNT_DESIGN_AUDIENCES.map((item) => item.value), cloud.audiencePreset),
      customAudience: typeof draft.customAudience === "string" ? draft.customAudience : cloud.customAudience,
      tonePreset: oneOf(draft.tonePreset, ACCOUNT_DESIGN_TONES.map((item) => item.value), cloud.tonePreset),
      customTone: typeof draft.customTone === "string" ? draft.customTone : cloud.customTone,
      monetizationPreset: oneOf(draft.monetizationPreset, ACCOUNT_DESIGN_MONETIZATION.map((item) => item.value), cloud.monetizationPreset),
      customMonetization: typeof draft.customMonetization === "string" ? draft.customMonetization : cloud.customMonetization,
      goalPreset: oneOf(draft.goalPreset, ACCOUNT_DESIGN_GOALS.map((item) => item.value), cloud.goalPreset),
      customGoal: typeof draft.customGoal === "string" ? draft.customGoal : cloud.customGoal,
      trustPreset: oneOf(draft.trustPreset, ACCOUNT_DESIGN_TRUST.map((item) => item.value), cloud.trustPreset),
      customTrust: typeof draft.customTrust === "string" ? draft.customTrust : cloud.customTrust,
      contentFocusPreset: oneOf(draft.contentFocusPreset, ACCOUNT_DESIGN_CONTENT_FOCUS.map((item) => item.value), cloud.contentFocusPreset),
      customContentFocus: typeof draft.customContentFocus === "string" ? draft.customContentFocus : cloud.customContentFocus,
      displayName: typeof draft.displayName === "string" ? draft.displayName : cloud.displayName,
      profileDraft: typeof draft.profileDraft === "string" ? draft.profileDraft : cloud.profileDraft,
      experienceNote: typeof draft.experienceNote === "string" ? draft.experienceNote : cloud.experienceNote,
      mainTopics: Array.isArray(draft.mainTopics) ? draft.mainTopics.filter((item): item is string => typeof item === "string").slice(0, 12) : cloud.mainTopics,
      ready: typeof draft.ready === "boolean" ? draft.ready : cloud.ready,
      userId: cloud.userId,
      platform: cloud.platform,
      updatedAt: cloud.updatedAt,
    };
    return candidate;
  } catch {
    return null;
  }
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
.select(ACCOUNT_DESIGN_SELECT_COLUMNS)
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
  const normalized = validatePlatformAccountDesign(design);
  const fields = {
    genre_preset: normalized.genrePreset,
    custom_genre: normalized.customGenre,
    account_style_preset: normalized.accountStylePreset,
    custom_account_style: normalized.customAccountStyle,
    audience_preset: normalized.audiencePreset,
    custom_audience: normalized.customAudience,
    tone_preset: normalized.tonePreset,
    custom_tone: normalized.customTone,
    monetization_preset: normalized.monetizationPreset,
    custom_monetization: normalized.customMonetization,
    goal_preset: normalized.goalPreset,
    custom_goal: normalized.customGoal,
    trust_preset: normalized.trustPreset,
    custom_trust: normalized.customTrust,
    content_focus_preset: normalized.contentFocusPreset,
    custom_content_focus: normalized.customContentFocus,
    display_name: normalized.displayName,
    profile_draft: normalized.profileDraft,
    experience_note: normalized.experienceNote,
    main_topics: normalized.mainTopics,
    ready: normalized.ready,
  };

  if (normalized.updatedAt) {
    const { data, error } = await client
      .from("platform_account_designs")
      .update(fields)
      .eq("user_id", normalized.userId)
      .eq("platform", normalized.platform)
      .eq("updated_at", normalized.updatedAt)
      .select(ACCOUNT_DESIGN_SELECT_COLUMNS)
      .maybeSingle();

    if (error) throw new Error("アカウント設計を保存できませんでした。");
    if (data) return parseDesign(data as Record<string, unknown>, normalized.userId, normalized.platform);

    const { data: latest, error: latestError } = await client
      .from("platform_account_designs")
      .select("updated_at")
      .eq("user_id", normalized.userId)
      .eq("platform", normalized.platform)
      .maybeSingle();
    if (latestError) throw new Error("アカウント設計の最新状態を確認できませんでした。");
    if (latest) {
      throw new Error("別の画面または端末でこのアカウント設計が更新されています。再読み込みして最新内容を確認してから保存してください。");
    }
  }

  const { data, error } = await client
    .from("platform_account_designs")
    .insert({
      user_id: normalized.userId,
      platform: normalized.platform,
      ...fields,
    })
    .select(ACCOUNT_DESIGN_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "23505") {
      throw new Error("別の画面または端末でこのアカウント設計が先に保存されました。再読み込みして最新内容を確認してください。");
    }
    throw new Error("アカウント設計を保存できませんでした。");
  }
  return parseDesign(data as Record<string, unknown>, normalized.userId, normalized.platform);
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
