import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiProvider } from "@/lib/user-personalization";

export type NoteOperationGoal = "habit" | "growth" | "monetize" | "portfolio";
export type NoteAccountGenre = "ai" | "sidejob" | "business" | "lifestyle" | "gadget" | "learning" | "parenting" | "health_beauty" | "money" | "creative" | "entertainment" | "other";
export type NoteAccountStyle = "beginner" | "howto" | "experience" | "essay" | "review" | "trend" | "expert" | "creative" | "other";
export type NoteAudiencePreset = "beginner" | "employee" | "sidejob_beginner" | "student" | "parent" | "senior" | "creator" | "business_owner" | "broad" | "other";
export type NoteTonePreset = "friendly" | "gentle" | "professional" | "casual" | "expert" | "energetic" | "other";
export type NoteMonetizationStyle = "free_first" | "free_to_paid" | "paid_expertise" | "membership_future" | "no_monetization" | "other";
export type NoteScheduleItemType = "free_note" | "paid_note" | "review" | "profile_setup" | "sns_share";
export type NoteScheduleStatus = "planned" | "done" | "skipped";
export type NoteScheduleSource = "generated" | "imported" | "manual";

export type NoteOperationProfile = {
  userId: string;
  noteDisplayName: string;
  bioDraft: string;
  targetReader: string;
  mainTopics: string[];
  experienceNote: string;
  accountGenre: NoteAccountGenre;
  customGenre: string;
  accountStyle: NoteAccountStyle;
  customAccountStyle: string;
  audiencePreset: NoteAudiencePreset;
  customAudience: string;
  tonePreset: NoteTonePreset;
  customTone: string;
  monetizationStyle: NoteMonetizationStyle;
  customMonetizationStyle: string;
  operationGoal: NoteOperationGoal;
  weeklyPostCount: number;
  paidPostsPerMonth: number;
  preferredTime: string;
  secondaryTime: string;
  timezone: string;
  scheduleWeeks: number;
  accountReady: boolean;
  profileReady: boolean;
};

export type NoteScheduleItem = {
  id?: string;
  userId?: string;
  scheduledDate: string;
  scheduledTime: string;
  itemType: NoteScheduleItemType;
  title: string;
  theme: string;
  status: NoteScheduleStatus;
  source: NoteScheduleSource;
  notes: string;
};

export type NoteScheduleImport = {
  profile: Partial<NoteOperationProfile> | null;
  schedule: NoteScheduleItem[];
};

export const NOTE_OPERATION_GOALS: readonly { value: NoteOperationGoal; label: string; description: string }[] = [
  { value: "habit", label: "まず継続したい", description: "無理のない頻度で投稿習慣を作る" },
  { value: "growth", label: "読者を増やしたい", description: "無料記事を軸に継続して発信する" },
  { value: "monetize", label: "収益化も育てたい", description: "無料記事と有料記事を組み合わせる" },
  { value: "portfolio", label: "実績・作品を整理したい", description: "専門性や制作物を分かりやすく蓄積する" },
] as const;


export const NOTE_ACCOUNT_GENRES: readonly { value: NoteAccountGenre; label: string }[] = [
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

export const NOTE_ACCOUNT_STYLES: readonly { value: NoteAccountStyle; label: string }[] = [
  { value: "beginner", label: "初心者向けにやさしく解説" },
  { value: "howto", label: "実践ノウハウ・手順中心" },
  { value: "experience", label: "経験・学び・試行錯誤中心" },
  { value: "essay", label: "日記・エッセイ・考え方中心" },
  { value: "review", label: "レビュー・比較・おすすめ中心" },
  { value: "trend", label: "ニュース・最新トレンド整理" },
  { value: "expert", label: "専門知識・深掘り中心" },
  { value: "creative", label: "作品・創作活動中心" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const NOTE_AUDIENCE_PRESETS: readonly { value: NoteAudiencePreset; label: string }[] = [
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

export const NOTE_TONE_PRESETS: readonly { value: NoteTonePreset; label: string }[] = [
  { value: "friendly", label: "親しみやすい" },
  { value: "gentle", label: "やさしく丁寧" },
  { value: "professional", label: "落ち着いた・信頼感重視" },
  { value: "casual", label: "カジュアル・会話調" },
  { value: "expert", label: "専門的・簡潔" },
  { value: "energetic", label: "明るく前向き" },
  { value: "other", label: "その他（自由入力）" },
] as const;

export const NOTE_MONETIZATION_STYLES: readonly { value: NoteMonetizationStyle; label: string }[] = [
  { value: "free_first", label: "無料note中心で読者を増やす" },
  { value: "free_to_paid", label: "無料noteから有料noteへ自然につなぐ" },
  { value: "paid_expertise", label: "専門ノウハウを有料noteで深掘り" },
  { value: "membership_future", label: "将来メンバーシップも検討" },
  { value: "no_monetization", label: "収益化せず発信・記録を優先" },
  { value: "other", label: "その他（自由入力）" },
] as const;

function optionLabel<T extends string>(options: readonly { value: T; label: string }[], value: T, custom: string): string {
  if (value === "other" && custom.trim()) return custom.trim();
  return options.find((item) => item.value === value)?.label ?? value;
}

export function noteProfileSelectionLabels(profile: NoteOperationProfile) {
  return {
    genre: optionLabel(NOTE_ACCOUNT_GENRES, profile.accountGenre, profile.customGenre),
    style: optionLabel(NOTE_ACCOUNT_STYLES, profile.accountStyle, profile.customAccountStyle),
    audience: optionLabel(NOTE_AUDIENCE_PRESETS, profile.audiencePreset, profile.customAudience),
    tone: optionLabel(NOTE_TONE_PRESETS, profile.tonePreset, profile.customTone),
    monetization: optionLabel(NOTE_MONETIZATION_STYLES, profile.monetizationStyle, profile.customMonetizationStyle),
  };
}

export const NOTE_SCHEDULE_TYPE_LABELS: Record<NoteScheduleItemType, string> = {
  free_note: "無料note",
  paid_note: "有料note",
  review: "振り返り",
  profile_setup: "初期設定",
  sns_share: "SNS告知",
};

export function defaultNoteOperationProfile(userId: string): NoteOperationProfile {
  return {
    userId,
    noteDisplayName: "",
    bioDraft: "",
    targetReader: "",
    mainTopics: [],
    experienceNote: "",
    accountGenre: "ai",
    customGenre: "",
    accountStyle: "beginner",
    customAccountStyle: "",
    audiencePreset: "beginner",
    customAudience: "",
    tonePreset: "friendly",
    customTone: "",
    monetizationStyle: "free_to_paid",
    customMonetizationStyle: "",
    operationGoal: "habit",
    weeklyPostCount: 3,
    paidPostsPerMonth: 2,
    preferredTime: "20:00",
    secondaryTime: "12:00",
    timezone: "Asia/Tokyo",
    scheduleWeeks: 4,
    accountReady: false,
    profileReady: false,
  };
}

function parseProfileRow(row: Record<string, unknown>, userId: string): NoteOperationProfile {
  return {
    userId,
    noteDisplayName: typeof row.note_display_name === "string" ? row.note_display_name : "",
    bioDraft: typeof row.bio_draft === "string" ? row.bio_draft : "",
    targetReader: typeof row.target_reader === "string" ? row.target_reader : "",
    mainTopics: Array.isArray(row.main_topics) ? row.main_topics.filter((v): v is string => typeof v === "string").slice(0, 12) : [],
    experienceNote: typeof row.experience_note === "string" ? row.experience_note : "",
    accountGenre: ["ai","sidejob","business","lifestyle","gadget","learning","parenting","health_beauty","money","creative","entertainment","other"].includes(String(row.account_genre)) ? row.account_genre as NoteAccountGenre : "ai",
    customGenre: typeof row.custom_genre === "string" ? row.custom_genre : "",
    accountStyle: ["beginner","howto","experience","essay","review","trend","expert","creative","other"].includes(String(row.account_style)) ? row.account_style as NoteAccountStyle : "beginner",
    customAccountStyle: typeof row.custom_account_style === "string" ? row.custom_account_style : "",
    audiencePreset: ["beginner","employee","sidejob_beginner","student","parent","senior","creator","business_owner","broad","other"].includes(String(row.audience_preset)) ? row.audience_preset as NoteAudiencePreset : "beginner",
    customAudience: typeof row.custom_audience === "string" ? row.custom_audience : "",
    tonePreset: ["friendly","gentle","professional","casual","expert","energetic","other"].includes(String(row.tone_preset)) ? row.tone_preset as NoteTonePreset : "friendly",
    customTone: typeof row.custom_tone === "string" ? row.custom_tone : "",
    monetizationStyle: ["free_first","free_to_paid","paid_expertise","membership_future","no_monetization","other"].includes(String(row.monetization_style)) ? row.monetization_style as NoteMonetizationStyle : "free_to_paid",
    customMonetizationStyle: typeof row.custom_monetization_style === "string" ? row.custom_monetization_style : "",
    operationGoal: row.operation_goal === "growth" || row.operation_goal === "monetize" || row.operation_goal === "portfolio" ? row.operation_goal : "habit",
    weeklyPostCount: Math.max(1, Math.min(14, Number(row.weekly_post_count ?? 3) || 3)),
    paidPostsPerMonth: Math.max(0, Math.min(14, Number(row.paid_posts_per_month ?? 2) || 0)),
    preferredTime: typeof row.preferred_time === "string" ? row.preferred_time.slice(0, 5) : "20:00",
    secondaryTime: typeof row.secondary_time === "string" ? row.secondary_time.slice(0, 5) : "12:00",
    timezone: typeof row.timezone === "string" ? row.timezone : "Asia/Tokyo",
    scheduleWeeks: Math.max(1, Math.min(12, Number(row.schedule_weeks ?? 4) || 4)),
    accountReady: row.account_ready === true,
    profileReady: row.profile_ready === true,
  };
}

function parseScheduleRow(row: Record<string, unknown>): NoteScheduleItem {
  const type = row.item_type;
  const status = row.status;
  const source = row.source;
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    userId: typeof row.user_id === "string" ? row.user_id : undefined,
    scheduledDate: typeof row.scheduled_date === "string" ? row.scheduled_date : "",
    scheduledTime: typeof row.scheduled_time === "string" ? row.scheduled_time.slice(0, 5) : "20:00",
    itemType: type === "paid_note" || type === "review" || type === "profile_setup" || type === "sns_share" ? type : "free_note",
    title: typeof row.title === "string" ? row.title : "",
    theme: typeof row.theme === "string" ? row.theme : "",
    status: status === "done" || status === "skipped" ? status : "planned",
    source: source === "generated" || source === "imported" ? source : "manual",
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export async function loadNoteOperationProfile(client: SupabaseClient, userId: string): Promise<NoteOperationProfile> {
  const { data, error } = await client
    .from("note_operation_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("note運営設定を読み込めませんでした。");
  return data ? parseProfileRow(data as Record<string, unknown>, userId) : defaultNoteOperationProfile(userId);
}

export async function saveNoteOperationProfile(client: SupabaseClient, profile: NoteOperationProfile): Promise<void> {
  const { error } = await client.from("note_operation_profiles").upsert({
    user_id: profile.userId,
    note_display_name: profile.noteDisplayName.trim().slice(0, 120),
    bio_draft: profile.bioDraft.trim().slice(0, 1200),
    target_reader: profile.targetReader.trim().slice(0, 600),
    main_topics: [...new Set(profile.mainTopics.map((item) => item.trim()).filter(Boolean))].slice(0, 12),
    experience_note: profile.experienceNote.trim().slice(0, 1200),
    account_genre: profile.accountGenre,
    custom_genre: profile.customGenre.trim().slice(0, 120),
    account_style: profile.accountStyle,
    custom_account_style: profile.customAccountStyle.trim().slice(0, 180),
    audience_preset: profile.audiencePreset,
    custom_audience: profile.customAudience.trim().slice(0, 300),
    tone_preset: profile.tonePreset,
    custom_tone: profile.customTone.trim().slice(0, 120),
    monetization_style: profile.monetizationStyle,
    custom_monetization_style: profile.customMonetizationStyle.trim().slice(0, 180),
    operation_goal: profile.operationGoal,
    weekly_post_count: Math.max(1, Math.min(14, Math.trunc(profile.weeklyPostCount))),
    paid_posts_per_month: Math.max(0, Math.min(14, Math.trunc(profile.paidPostsPerMonth))),
    preferred_time: normalizeTime(profile.preferredTime, "20:00"),
    secondary_time: normalizeTime(profile.secondaryTime, "12:00"),
    timezone: "Asia/Tokyo",
    schedule_weeks: Math.max(1, Math.min(12, Math.trunc(profile.scheduleWeeks))),
    account_ready: profile.accountReady,
    profile_ready: profile.profileReady,
  }, { onConflict: "user_id" });
  if (error) throw new Error("note運営設定を保存できませんでした。");
}

export async function listNoteSchedule(
  client: SupabaseClient,
  userId: string,
  startDate?: string,
  endDate?: string,
): Promise<NoteScheduleItem[]> {
  let query = client
    .from("note_operation_schedule_items")
    .select("*")
    .eq("user_id", userId)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (startDate) query = query.gte("scheduled_date", startDate);
  if (endDate) query = query.lte("scheduled_date", endDate);
  const { data, error } = await query.limit(500);
  if (error) throw new Error("note運営スケジュールを読み込めませんでした。");
  return (data ?? []).map((row) => parseScheduleRow(row as Record<string, unknown>));
}

function dbScheduleRow(userId: string, item: NoteScheduleItem) {
  return {
    id: item.id,
    user_id: userId,
    scheduled_date: item.scheduledDate,
    scheduled_time: normalizeTime(item.scheduledTime, "20:00"),
    item_type: item.itemType,
    title: item.title.trim().slice(0, 240),
    theme: item.theme.trim().slice(0, 500),
    status: item.status,
    source: item.source,
    notes: item.notes.trim().slice(0, 1200),
  };
}

export async function replaceNoteSchedule(
  client: SupabaseClient,
  userId: string,
  items: NoteScheduleItem[],
): Promise<NoteScheduleItem[]> {
  const clean = items
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate) && item.title.trim())
    .slice(0, 500)
    .map((item) => ({ ...item, id: undefined }));

  const previous = await listNoteSchedule(client, userId);
  const { error: deleteError } = await client
    .from("note_operation_schedule_items")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error("既存スケジュールを更新できませんでした。");

  if (clean.length) {
    const { error: insertError } = await client
      .from("note_operation_schedule_items")
      .insert(clean.map((item) => dbScheduleRow(userId, item)));
    if (insertError) {
      if (previous.length) {
        await client.from("note_operation_schedule_items").insert(previous.map((item) => dbScheduleRow(userId, item)));
      }
      throw new Error("新しいスケジュールを保存できませんでした。");
    }
  }
  return listNoteSchedule(client, userId);
}

export async function setNoteScheduleStatus(
  client: SupabaseClient,
  userId: string,
  itemId: string,
  status: NoteScheduleStatus,
): Promise<void> {
  const { error } = await client
    .from("note_operation_schedule_items")
    .update({ status })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error("予定の状態を更新できませんでした。");
}

export function todayJstDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function normalizeTime(value: string, fallback: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weekdayMondayZero(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const sundayZero = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayZero + 6) % 7;
}

function primaryDays(count: number): number[] {
  const sets: Record<number, number[]> = {
    1: [6],
    2: [2, 6],
    3: [1, 3, 6],
    4: [1, 3, 5, 6],
    5: [1, 2, 4, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return sets[Math.max(1, Math.min(7, count))];
}

function paidIndexes(total: number, paidCount: number): Set<number> {
  const result = new Set<number>();
  if (paidCount <= 0 || total <= 0) return result;
  const target = Math.min(total, paidCount);
  for (let i = 0; i < target; i += 1) {
    result.add(Math.min(total - 1, Math.floor(((i + 0.5) * total) / target)));
  }
  return result;
}

export function generateNoteSchedule(
  profile: NoteOperationProfile,
  startDate = todayJstDateKey(),
): NoteScheduleItem[] {
  const weeks = Math.max(1, Math.min(12, Math.trunc(profile.scheduleWeeks)));
  const perWeek = Math.max(1, Math.min(14, Math.trunc(profile.weeklyPostCount)));
  const days = primaryDays(Math.min(7, perWeek));
  const secondaryPosts = Math.max(0, perWeek - 7);
  const postingSlots: Array<{ date: string; time: string }> = [];

  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const date = addDays(startDate, offset);
    const weekday = weekdayMondayZero(date);
    if (days.includes(weekday)) {
      postingSlots.push({ date, time: normalizeTime(profile.preferredTime, "20:00") });
    }
    if (secondaryPosts > 0 && weekday < secondaryPosts) {
      postingSlots.push({ date, time: normalizeTime(profile.secondaryTime, "12:00") });
    }
  }

  postingSlots.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const targetPaid = Math.round((profile.paidPostsPerMonth * weeks) / 4);
  const paid = paidIndexes(postingSlots.length, targetPaid);
  const topics = profile.mainTopics.length ? profile.mainTopics : ["メインテーマを決める"];
  const items: NoteScheduleItem[] = [];

  if (!profile.accountReady) {
    items.push({
      scheduledDate: startDate,
      scheduledTime: "10:00",
      itemType: "profile_setup",
      title: "noteアカウントを作成・基本設定を確認",
      theme: "",
      status: "planned",
      source: "generated",
      notes: "AASはnoteのパスワードやCookieを保存しません。",
    });
  }
  if (!profile.profileReady) {
    items.push({
      scheduledDate: addDays(startDate, profile.accountReady ? 0 : 1),
      scheduledTime: "10:00",
      itemType: "profile_setup",
      title: "プロフィール文と自己紹介記事を整える",
      theme: topics[0],
      status: "planned",
      source: "generated",
      notes: "入力した事実だけを使ってプロフィールを作成します。",
    });
  }

  postingSlots.forEach((slot, index) => {
    const isPaid = paid.has(index);
    const theme = topics[index % topics.length];
    items.push({
      scheduledDate: slot.date,
      scheduledTime: slot.time,
      itemType: isPaid ? "paid_note" : "free_note",
      title: isPaid ? "有料note：深掘り・実践記事を投稿" : "無料note：入口・役立ち記事を投稿",
      theme,
      status: "planned",
      source: "generated",
      notes: isPaid
        ? "無料記事から自然につながるテーマか確認してから投稿。"
        : "読者の悩みを1つに絞り、次に読みたい内容へつなげる。",
    });
  });

  for (let week = 0; week < weeks; week += 1) {
    items.push({
      scheduledDate: addDays(startDate, week * 7 + 6),
      scheduledTime: "21:30",
      itemType: "review",
      title: "今週のnote運営を振り返る",
      theme: "",
      status: "planned",
      source: "generated",
      notes: "閲覧・反応・続けやすさを確認し、次週の頻度やテーマを調整する。",
    });
  }

  return items
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime))
    .slice(0, 500);
}

export function buildNoteProfileDraft(profile: Pick<NoteOperationProfile, "noteDisplayName" | "targetReader" | "mainTopics" | "experienceNote">): string {
  const name = profile.noteDisplayName.trim();
  const reader = profile.targetReader.trim();
  const topics = profile.mainTopics.map((item) => item.trim()).filter(Boolean);
  const lines: string[] = [];
  if (name) lines.push(`${name}です。`);
  if (topics.length) lines.push(`${topics.join("・")}を中心に発信しています。`);
  if (reader) lines.push(`${reader}に向けて、分かりやすく実践しやすい形でまとめます。`);
  if (profile.experienceNote.trim()) lines.push(profile.experienceNote.trim());
  if (!lines.length) lines.push("発信テーマ・届けたい読者・事実として書ける経験を入力すると、プロフィール案を作成できます。");
  return lines.join("\n");
}


export function buildNoteAccountResearchPrompt(profile: NoteOperationProfile, aiProvider: AiProvider, currentDate = todayJstDateKey()): string {
  const selected = noteProfileSelectionLabels(profile);
  const providerName = aiProvider === "gemini" ? "Gemini" : aiProvider === "claude" ? "Claude" : "ChatGPT";
  const providerSearch = aiProvider === "gemini"
    ? "Google検索/グラウンディング等、現在利用できるWeb検索機能を使う"
    : aiProvider === "claude"
      ? "Web検索機能が利用できる場合は必ず使う"
      : "Web検索機能が利用できる場合は必ず使う";
  const topics = profile.mainTopics.length ? profile.mainTopics.join(" / ") : "未指定（調査結果から候補を出す）";
  const factualBackground = profile.experienceNote.trim() || "未入力。経歴・実績・資格を推測して追加しない";
  const readerExtra = profile.targetReader.trim() || "なし";
  const displayName = profile.noteDisplayName.trim() || "未定";

  return `あなたは日本のnote運営に詳しい編集者・コンテンツ戦略担当です。
目的は、初心者でも継続しやすい「noteアカウント構成案」を、最新情報と直近トレンドを調査したうえで3案作ることです。

【重要：最新情報の確認】
- 基準日: ${currentDate}（日本時間）
- ${providerName}の${providerSearch}。
- 回答を作る前に必ずWeb検索を行う。検索できない場合は「最新情報を確認できないため、トレンド部分は確定できません」と明記し、未確認情報を最新事実として作らない。
- note公式（note.com/info、公式ヘルプ等）を最優先し、現在の機能・カテゴリ・おすすめの仕組み・創作カレンダー・開催中/直近の企画やお題・プロフィール関連の変更を確認する。
- 選択ジャンルについて、直近90日と直近12か月の両方を調べる。検索需要、季節性、話題、継続して読まれやすい悩みを分ける。
- SNSの一時的なバズだけで決めず、note内の文脈、公式企画、検索需要、長期的な読者課題を分けて評価する。
- 根拠として使った情報は、出典名・URL・公開/更新日を最後に一覧化する。
- 推測や分析は「分析」と明記し、公式事実と混同しない。

【ユーザーが選んだ条件】
- 主ジャンル: ${selected.genre}
- 運営スタイル: ${selected.style}
- 想定読者: ${selected.audience}
- 読者の補足: ${readerExtra}
- 文章の雰囲気: ${selected.tone}
- 収益化方針: ${selected.monetization}
- 運営目的: ${NOTE_OPERATION_GOALS.find((item) => item.value === profile.operationGoal)?.label ?? profile.operationGoal}
- 補足テーマ: ${topics}
- 希望表示名: ${displayName}
- ユーザーが事実として入力した経験・資格・背景: ${factualBackground}

【絶対ルール】
- ユーザーが入力していない経歴、年齢、職業、収入、実績、資格、利用経験、成功体験を作らない。
- 「稼げる」「伸びる」「この時間が正解」など成果を保証しない。
- 有料noteを提案する場合も、無料部分で十分な価値を提供し、誇張や不安煽りを使わない。
- 現在のnote仕様やトレンドは検索結果で確認できた範囲だけを事実として扱う。
- アカウントID/ユーザー名候補は「空き状況未確認」と明記する。
- 競合クリエイターの文章・プロフィールをコピーまたは近似模倣しない。

【出力してほしい内容】
最初に「今回確認した最新動向」を5〜10項目で要約し、そのあとアカウント構成を3案出してください。

各案は次の順番で出力:
1. アカウントのコンセプト（1文）
2. この案が向く理由（最新動向との関係を含む）
3. 表示名候補 5個
4. アカウントID候補 5個（空き状況未確認と明記）
5. プロフィール文候補 3個
6. 自己紹介noteのタイトル候補と構成
7. 発信の柱 3〜5本
8. 無料noteで扱う内容
9. 有料noteで扱う内容（収益化しない設定なら省略）
10. 最初の10記事のタイトル案
11. 「今のトレンドを狙う記事」と「半年後も読める記事」を分ける
12. 初月4週間の運営案（投稿回数・曜日・時間はテスト案として提示）
13. 使うハッシュタグ/キーワード候補と、その根拠
14. 注意点・避けるべきこと
15. この案を選ぶ判断基準

最後に:
- 3案の比較表
- 初心者が選びやすい判断フロー
- 参照した情報源一覧（URL・日付）
- 「今後1か月で再確認したいトレンド項目」

日本語で、初心者がそのまま実行できる具体性で出力してください。`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function exportNoteScheduleCsv(items: NoteScheduleItem[]): string {
  const header = ["date","time","type","title","theme","status","notes"].join(",");
  const rows = items.map((item) => [
    item.scheduledDate,
    item.scheduledTime,
    item.itemType,
    item.title,
    item.theme,
    item.status,
    item.notes,
  ].map((value) => csvCell(value)).join(","));
  return "\uFEFF" + [header, ...rows].join("\r\n");
}

export function exportNoteOperationsJson(profile: NoteOperationProfile, items: NoteScheduleItem[]): string {
  return JSON.stringify({
    schema: "aas-note-operations-v1",
    exported_at: new Date().toISOString(),
    timezone: "Asia/Tokyo",
    profile: {
      note_display_name: profile.noteDisplayName,
      bio_draft: profile.bioDraft,
      target_reader: profile.targetReader,
      main_topics: profile.mainTopics,
      experience_note: profile.experienceNote,
      account_genre: profile.accountGenre,
      custom_genre: profile.customGenre,
      account_style: profile.accountStyle,
      custom_account_style: profile.customAccountStyle,
      audience_preset: profile.audiencePreset,
      custom_audience: profile.customAudience,
      tone_preset: profile.tonePreset,
      custom_tone: profile.customTone,
      monetization_style: profile.monetizationStyle,
      custom_monetization_style: profile.customMonetizationStyle,
      operation_goal: profile.operationGoal,
      weekly_post_count: profile.weeklyPostCount,
      paid_posts_per_month: profile.paidPostsPerMonth,
      preferred_time: profile.preferredTime,
      secondary_time: profile.secondaryTime,
      schedule_weeks: profile.scheduleWeeks,
      account_ready: profile.accountReady,
      profile_ready: profile.profileReady,
    },
    schedule: items.map((item) => ({
      date: item.scheduledDate,
      time: item.scheduledTime,
      type: item.itemType,
      title: item.title,
      theme: item.theme,
      status: item.status,
      notes: item.notes,
    })),
  }, null, 2);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function importedType(value: unknown): NoteScheduleItemType {
  return value === "paid_note" || value === "review" || value === "profile_setup" || value === "sns_share" ? value : "free_note";
}

function importedStatus(value: unknown): NoteScheduleStatus {
  return value === "done" || value === "skipped" ? value : "planned";
}

function importedScheduleItem(raw: Record<string, unknown>): NoteScheduleItem | null {
  const date = typeof raw.date === "string" ? raw.date : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return null;
  return {
    scheduledDate: date,
    scheduledTime: normalizeTime(typeof raw.time === "string" ? raw.time : "20:00", "20:00"),
    itemType: importedType(raw.type),
    title: title.slice(0, 240),
    theme: typeof raw.theme === "string" ? raw.theme.slice(0, 500) : "",
    status: importedStatus(raw.status),
    source: "imported",
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1200) : "",
  };
}

export function parseNoteOperationsImport(text: string, filename: string): NoteScheduleImport {
  if (filename.toLowerCase().endsWith(".json") || text.trim().startsWith("{")) {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("JSON形式を確認できませんでした。");
    const value = raw as Record<string, unknown>;
    if (value.schema !== "aas-note-operations-v1") throw new Error("AAS note運営データの形式ではありません。");
    const rawSchedule = Array.isArray(value.schedule) ? value.schedule : [];
    const schedule = rawSchedule
      .map((item) => item && typeof item === "object" && !Array.isArray(item) ? importedScheduleItem(item as Record<string, unknown>) : null)
      .filter((item): item is NoteScheduleItem => Boolean(item))
      .slice(0, 500);
    const p = value.profile && typeof value.profile === "object" && !Array.isArray(value.profile)
      ? value.profile as Record<string, unknown>
      : null;
    const profile: Partial<NoteOperationProfile> | null = p ? {
      noteDisplayName: typeof p.note_display_name === "string" ? p.note_display_name.slice(0, 120) : "",
      bioDraft: typeof p.bio_draft === "string" ? p.bio_draft.slice(0, 1200) : "",
      targetReader: typeof p.target_reader === "string" ? p.target_reader.slice(0, 600) : "",
      mainTopics: Array.isArray(p.main_topics) ? p.main_topics.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
      experienceNote: typeof p.experience_note === "string" ? p.experience_note.slice(0, 1200) : "",
      accountGenre: ["ai","sidejob","business","lifestyle","gadget","learning","parenting","health_beauty","money","creative","entertainment","other"].includes(String(p.account_genre)) ? p.account_genre as NoteAccountGenre : "ai",
      customGenre: typeof p.custom_genre === "string" ? p.custom_genre.slice(0, 120) : "",
      accountStyle: ["beginner","howto","experience","essay","review","trend","expert","creative","other"].includes(String(p.account_style)) ? p.account_style as NoteAccountStyle : "beginner",
      customAccountStyle: typeof p.custom_account_style === "string" ? p.custom_account_style.slice(0, 180) : "",
      audiencePreset: ["beginner","employee","sidejob_beginner","student","parent","senior","creator","business_owner","broad","other"].includes(String(p.audience_preset)) ? p.audience_preset as NoteAudiencePreset : "beginner",
      customAudience: typeof p.custom_audience === "string" ? p.custom_audience.slice(0, 300) : "",
      tonePreset: ["friendly","gentle","professional","casual","expert","energetic","other"].includes(String(p.tone_preset)) ? p.tone_preset as NoteTonePreset : "friendly",
      customTone: typeof p.custom_tone === "string" ? p.custom_tone.slice(0, 120) : "",
      monetizationStyle: ["free_first","free_to_paid","paid_expertise","membership_future","no_monetization","other"].includes(String(p.monetization_style)) ? p.monetization_style as NoteMonetizationStyle : "free_to_paid",
      customMonetizationStyle: typeof p.custom_monetization_style === "string" ? p.custom_monetization_style.slice(0, 180) : "",
      operationGoal: p.operation_goal === "growth" || p.operation_goal === "monetize" || p.operation_goal === "portfolio" ? p.operation_goal : "habit",
      weeklyPostCount: Math.max(1, Math.min(14, Number(p.weekly_post_count ?? 3) || 3)),
      paidPostsPerMonth: Math.max(0, Math.min(14, Number(p.paid_posts_per_month ?? 2) || 0)),
      preferredTime: normalizeTime(typeof p.preferred_time === "string" ? p.preferred_time : "20:00", "20:00"),
      secondaryTime: normalizeTime(typeof p.secondary_time === "string" ? p.secondary_time : "12:00", "12:00"),
      scheduleWeeks: Math.max(1, Math.min(12, Number(p.schedule_weeks ?? 4) || 4)),
      accountReady: p.account_ready === true,
      profileReady: p.profile_ready === true,
    } : null;
    return { profile, schedule };
  }

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSVに予定がありません。");
  const headers = parseCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  const schedule = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return importedScheduleItem(row);
  }).filter((item): item is NoteScheduleItem => Boolean(item)).slice(0, 500);
  return { profile: null, schedule };
}
