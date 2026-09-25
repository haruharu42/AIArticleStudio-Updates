import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlatformAccountPromptContext } from "@/features/account-design";
import { buildWorkspacePresetPromptContext, getRuntimeWorkspacePresetDefinition, getRuntimeWorkspacePresetPreference } from "@/features/presets/workspace-presets";
import type { AiProvider } from "@/lib/user-personalization";
import { extractNoteAiScheduleJson } from "@/lib/note-ai-schedule-json";
import type {
  NoteAiResearchSource,
  NoteAiSchedulePlan,
  NoteArticleOutputSnapshot,
  NoteScheduleImport,
  NoteScheduleItem,
  NoteScheduleItemType,
  NoteSchedulePerformanceBreakdown,
  NoteSchedulePerformanceSnapshot,
  NoteScheduleSource,
  NoteScheduleStatus,
} from "@/lib/note-schedule-types";
import {
  AAS_ADMIN_NOTE_PROFILE_PRESET,
  NOTE_ACCOUNT_GENRES,
  NOTE_ACCOUNT_STYLES,
  NOTE_AUDIENCE_PRESETS,
  NOTE_MONETIZATION_STYLES,
  NOTE_OPERATION_GOALS,
  NOTE_TONE_PRESETS,
  applyAasAdminNoteProfilePreset,
  defaultNoteOperationProfile,
  noteProfileSelectionLabels,
  type NoteAccountGenre,
  type NoteAccountStyle,
  type NoteAudiencePreset,
  type NoteMonetizationStyle,
  type NoteOperationGoal,
  type NoteOperationProfile,
  type NoteTonePreset,
} from "@/lib/note-operation-profile";

export {
  AAS_ADMIN_NOTE_PROFILE_PRESET,
  NOTE_ACCOUNT_GENRES,
  NOTE_ACCOUNT_STYLES,
  NOTE_AUDIENCE_PRESETS,
  NOTE_MONETIZATION_STYLES,
  NOTE_OPERATION_GOALS,
  NOTE_TONE_PRESETS,
  applyAasAdminNoteProfilePreset,
  defaultNoteOperationProfile,
  noteProfileSelectionLabels,
} from "@/lib/note-operation-profile";
export type {
  NoteAccountGenre,
  NoteAccountStyle,
  NoteAudiencePreset,
  NoteMonetizationStyle,
  NoteOperationGoal,
  NoteOperationProfile,
  NoteTonePreset,
} from "@/lib/note-operation-profile";

export type {
  NoteAiResearchSource,
  NoteAiSchedulePlan,
  NoteAiScheduleRecommendation,
  NoteArticleOutputSnapshot,
  NoteScheduleImport,
  NoteScheduleItem,
  NoteScheduleItemType,
  NoteSchedulePerformanceBreakdown,
  NoteSchedulePerformanceSnapshot,
  NoteScheduleSource,
  NoteScheduleStatus,
} from "@/lib/note-schedule-types";

export { extractNoteAiScheduleJson } from "@/lib/note-ai-schedule-json";

export function currentJstMonth(date = new Date()): string {
  return todayJstDateKey(date).slice(0, 7);
}

export function noteMonthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("対象月の形式を確認できませんでした。");
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("対象月の形式を確認できませんでした。");
  const start = `${month}-01`;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function previousJstMonth(month: string): string {
  noteMonthBounds(month);
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
}

function nextJstMonth(month: string): string {
  noteMonthBounds(month);
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
}

export async function loadNoteArticleOutputSnapshot(
  client: SupabaseClient,
  userId: string,
  targetMonth: string,
): Promise<NoteArticleOutputSnapshot | null> {
  noteMonthBounds(targetMonth);
  const nextMonth = nextJstMonth(targetMonth);
  const startIso = `${targetMonth}-01T00:00:00+09:00`;
  const endIso = `${nextMonth}-01T00:00:00+09:00`;
  const countRows = async (articleType?: "free" | "paid", status?: string): Promise<number> => {
    let query = client
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("publication_target", "note")
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    if (articleType) query = query.eq("article_type", articleType);
    if (status) query = query.eq("status", status);
    const { count, error } = await query;
    if (error) throw new Error("AASの記事作成実績を読み込めませんでした。");
    return count ?? 0;
  };

  const statuses = ["draft", "writing", "ready", "waiting_publish", "published", "on_hold", "archived"] as const;
  const [createdPosts, freeCreated, paidCreated, ...statusValues] = await Promise.all([
    countRows(),
    countRows("free"),
    countRows("paid"),
    ...statuses.map((status) => countRows(undefined, status)),
  ]);
  if (!createdPosts) return null;

  const statusCounts: Record<string, number> = {};
  statuses.forEach((status, index) => {
    const count = statusValues[index] ?? 0;
    if (count > 0) statusCounts[status] = count;
  });
  const published = statusCounts.published ?? 0;
  const readyLike = (statusCounts.ready ?? 0) + (statusCounts.waiting_publish ?? 0) + published;
  const draftLike = createdPosts - readyLike;

  return {
    targetMonth,
    createdPosts,
    freeCreated,
    paidCreated,
    draftLike,
    readyLike,
    published,
    statusCounts,
  };
}

function aiProviderName(provider: AiProvider): string {
  return provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : "ChatGPT";
}

function providerSearchInstruction(provider: AiProvider): string {
  if (provider === "gemini") return "Google検索/グラウンディング等、現在利用できるWeb検索機能を必ず使う";
  return "Web検索機能が利用できる場合は必ず使う";
}

export const NOTE_SCHEDULE_TYPE_LABELS: Record<NoteScheduleItemType, string> = {
  free_note: "無料note作成",
  paid_note: "有料note作成",
  review: "振り返り",
  profile_setup: "初期設定",
  sns_share: "SNS告知",
};

export function isNoteArticleScheduleItem(item: NoteScheduleItem): boolean {
  return item.itemType === "free_note" || item.itemType === "paid_note";
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


export function applyRuntimeWorkspacePresetToNoteProfile(profile: NoteOperationProfile): NoteOperationProfile {
  const preference = getRuntimeWorkspacePresetPreference();
  if (!preference?.applyNote) return profile;
  if (preference.presetKey === "aas_official") return applyAasAdminNoteProfilePreset(profile);

  const preset = getRuntimeWorkspacePresetDefinition();
  const note = preset.note;
  const topics = [...new Set([
    ...profile.mainTopics,
    ...(note.topics ?? preset.article.tags ?? []),
  ])].slice(0, 30);

  return {
    ...profile,
    mainTopics: topics,
    accountGenre: note.genre ? "other" : profile.accountGenre,
    customGenre: note.genre ?? profile.customGenre,
    accountStyle: note.style ? "other" : profile.accountStyle,
    customAccountStyle: note.style ?? profile.customAccountStyle,
    audiencePreset: note.audience ? "other" : profile.audiencePreset,
    customAudience: note.audience ?? profile.customAudience,
    tonePreset: note.tone ? "other" : profile.tonePreset,
    customTone: note.tone ?? profile.customTone,
    monetizationStyle: note.monetization ? "other" : profile.monetizationStyle,
    customMonetizationStyle: note.monetization ?? profile.customMonetizationStyle,
    operationGoal: note.goal?.includes("読者") ? "growth" : profile.operationGoal,
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

const NOTE_PERFORMANCE_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function performanceBreakdown(
  posts: NoteScheduleItem[],
  keyOf: (item: NoteScheduleItem) => string,
  orderedKeys?: readonly string[],
): NoteSchedulePerformanceBreakdown[] {
  const buckets = new Map<string, NoteSchedulePerformanceBreakdown>();
  for (const item of posts) {
    const key = keyOf(item);
    const bucket = buckets.get(key) ?? { key, scheduled: 0, done: 0, skipped: 0, remainingPlanned: 0 };
    bucket.scheduled += 1;
    if (item.status === "done") bucket.done += 1;
    else if (item.status === "skipped") bucket.skipped += 1;
    else bucket.remainingPlanned += 1;
    buckets.set(key, bucket);
  }
  const order = new Map<string, number>();
  (orderedKeys ?? []).forEach((key, index) => order.set(key, index));
  return [...buckets.values()].sort((a, b) => {
    const aOrder = order.get(a.key);
    const bOrder = order.get(b.key);
    if (aOrder !== undefined || bOrder !== undefined) {
      return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return a.key.localeCompare(b.key);
  });
}

export function summarizeNoteSchedulePerformance(
  items: NoteScheduleItem[],
  targetMonth: string,
): NoteSchedulePerformanceSnapshot | null {
  noteMonthBounds(targetMonth);
  const posts = items.filter(
    (item) =>
      item.scheduledDate.startsWith(`${targetMonth}-`) &&
      (item.itemType === "free_note" || item.itemType === "paid_note"),
  );
  if (!posts.length) return null;

  const donePosts = posts.filter((item) => item.status === "done").length;
  const skippedPosts = posts.filter((item) => item.status === "skipped").length;
  const remainingPlannedPosts = posts.length - donePosts - skippedPosts;
  const freePosts = posts.filter((item) => item.itemType === "free_note");
  const paidPosts = posts.filter((item) => item.itemType === "paid_note");
  const weekdays = performanceBreakdown(posts, (item) => {
    const [year, month, day] = item.scheduledDate.split("-").map(Number);
    return NOTE_PERFORMANCE_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  }, ["月", "火", "水", "木", "金", "土", "日"]);
  const times = performanceBreakdown(posts, (item) => normalizeTime(item.scheduledTime, "20:00"));

  return {
    targetMonth,
    scheduledPosts: posts.length,
    donePosts,
    skippedPosts,
    remainingPlannedPosts,
    freeScheduled: freePosts.length,
    paidScheduled: paidPosts.length,
    freeDone: freePosts.filter((item) => item.status === "done").length,
    paidDone: paidPosts.filter((item) => item.status === "done").length,
    adherenceRate: posts.length ? Math.round((donePosts / posts.length) * 1000) / 10 : 0,
    weekdays,
    times,
  };
}

function formatSchedulePerformanceForPrompt(performance: NoteSchedulePerformanceSnapshot | null, expectedMonth: string): string {
  if (!performance || performance.targetMonth !== expectedMonth) {
    return `- ${expectedMonth}のfree_note / paid_note実績はAAS内にありません。一般論だけで頻度を増やさず、初心者が継続できる保守的な仮説から始める。`;
  }
  const weekdays = performance.weekdays
    .map((item) => `${item.key}曜: 予定${item.scheduled}/完了${item.done}/スキップ${item.skipped}/未完了${item.remainingPlanned}`)
    .join("、");
  const times = performance.times
    .map((item) => `${item.key}: 予定${item.scheduled}/完了${item.done}/スキップ${item.skipped}/未完了${item.remainingPlanned}`)
    .join("、");
  return [
    `- 対象月: ${performance.targetMonth}`,
    `- 記事予定: ${performance.scheduledPosts}件（無料 ${performance.freeScheduled} / 有料 ${performance.paidScheduled}）`,
    `- 完了: ${performance.donePosts}件 / スキップ: ${performance.skippedPosts}件 / 未完了: ${performance.remainingPlannedPosts}件`,
    `- 無料note完了: ${performance.freeDone}件 / 有料note完了: ${performance.paidDone}件`,
    `- 投稿予定に対する完了率: ${performance.adherenceRate}%`,
    `- 曜日別: ${weekdays || "データなし"}`,
    `- 時刻別: ${times || "データなし"}`,
  ].join("\n");
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

function formatArticleOutputForPrompt(output: NoteArticleOutputSnapshot | null, expectedMonth: string): string {
  if (!output || output.targetMonth !== expectedMonth) {
    return `- ${expectedMonth}にAASで作成したnote記事は確認できません。作成本数を推測しない。`;
  }
  const statuses = Object.entries(output.statusCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status}=${count}`)
    .join("、");
  return [
    `- 対象月: ${output.targetMonth}`,
    `- AASで作成したnote記事: ${output.createdPosts}本（無料 ${output.freeCreated} / 有料 ${output.paidCreated}）`,
    `- 公開済み: ${output.published}本 / 公開準備段階を含むready系: ${output.readyLike}本 / draft・writing等: ${output.draftLike}本`,
    `- status内訳: ${statuses || "データなし"}`,
  ].join("\n");
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

export function buildNoteProfileDraft(profile: NoteOperationProfile): string {
  const name = profile.noteDisplayName.trim();
  const readerExtra = profile.targetReader.trim();
  const topics = profile.mainTopics.map((item) => item.trim()).filter(Boolean);
  const selected = noteProfileSelectionLabels(profile);
  const lines: string[] = [];
  if (name) lines.push(`${name}です。`);
  lines.push(`${topics.length ? topics.join("・") : selected.genre}を中心に、${selected.style}の発信をしています。`);
  lines.push(`${readerExtra || selected.audience}に向けて、${selected.tone}な文章で分かりやすくまとめます。`);
  if (profile.experienceNote.trim()) lines.push(profile.experienceNote.trim());
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
  const workspacePresetContext = buildWorkspacePresetPromptContext("note");
  const accountPresetContext = buildPlatformAccountPromptContext("note");

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

${workspacePresetContext ? `${workspacePresetContext}

` : ""}${accountPresetContext ? `${accountPresetContext}

` : ""}【絶対ルール】
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

export function buildNoteScheduleResearchPrompt(
  profile: NoteOperationProfile,
  aiProvider: AiProvider,
  targetMonth: string,
  currentDate = todayJstDateKey(),
  referencePerformance?: NoteSchedulePerformanceSnapshot | null,
  articleOutput?: NoteArticleOutputSnapshot | null,
): string {
  const { start, end } = noteMonthBounds(targetMonth);
  const selected = noteProfileSelectionLabels(profile);
  const workspacePresetContext = buildWorkspacePresetPromptContext("note");
  const accountPresetContext = buildPlatformAccountPromptContext("note");
  const providerName = aiProviderName(aiProvider);
  const topics = profile.mainTopics.length ? profile.mainTopics.join(" / ") : "未指定（最新調査から候補を決める）";
  const readerExtra = profile.targetReader.trim() || "なし";
  const factualBackground = profile.experienceNote.trim() || "未入力。経歴・実績・資格を推測して追加しない";
  const currentMonth = currentDate.slice(0, 7);
  const firstAllowedDate = targetMonth === currentMonth ? currentDate : start;
  const previousMonth = previousJstMonth(targetMonth);
  const performanceMonth = referencePerformance?.targetMonth ?? previousMonth;
  const articleOutputMonth = articleOutput?.targetMonth ?? (targetMonth === currentMonth ? targetMonth : previousMonth);
  const performanceSection = referencePerformance === undefined
    ? ""
    : `
【AAS運用スケジュール実績（構造化データのみ）】
${formatSchedulePerformanceForPrompt(referencePerformance, performanceMonth)}
- この実績は「回数を増やす/減らす」の機械的な命令ではない。完了しやすかった曜日・時刻・実際に継続できた頻度を参考に、今後の負荷を調整する。
- 未完了分やスキップ分を「借金」のように残り期間へ詰め込まない。スケジュール通りに運用できなかったこと自体を失敗扱いしない。
- 完了率が低い場合は、まず継続可能な頻度へ落とすことを優先する。
- 完了率が高くても自動的に投稿数を増やさず、最新リサーチと品質維持の余力を合わせて判断する。
- AASから渡していない本文、PV、売上、購入率、フォロワー増減、読者属性、成功要因を推測して実績として扱わない。
- 記事タイトルや本文そのものは実績として渡していない。ここでは予定種別・状態・曜日・時刻の集計だけを使う。
`;
  const articleOutputSection = articleOutput === undefined
    ? ""
    : `
【AASで実際に作成したnote記事数】
${formatArticleOutputForPrompt(articleOutput, articleOutputMonth)}
- これはAAS内のarticlesで対象期間に作成されたnote記事数であり、PV・売上・購入数ではない。
- 無料/有料の実際の制作ペースとして使う。たとえば無料30本・有料20本を作成済みなら、その50本を制作能力の実績として考慮する。
- ただし作成数と公開成果は同義ではない。draft・writing等も含むため、作成本数だけを理由に投稿数を機械的に増やさない。
- 対象月の途中で再計画する場合、ここまでに作った本数を既存実績として扱い、残り期間だけを現実的に再設計する。
`;

  return `あなたは日本のnote運営に詳しい編集者・コンテンツ戦略担当です。
目的は、ユーザーに投稿回数を手入力させるのではなく、${targetMonth}の1か月について、最新情報を調査したうえで「無理なく継続でき、無料noteと有料noteの役割が分かれた運用スケジュール」を設計し、AASが読み込めるJSONで返すことです。

【対象期間】
- 基準日: ${currentDate}（日本時間）
- 対象月: ${targetMonth}
- スケジュール可能期間: ${firstAllowedDate} 〜 ${end}
- 対象月が今月の場合、基準日より前には新しい投稿予定を置かない。
- 対象月が未来の場合、その月全体を使ってよい。

【必須リサーチ】
- ${providerName}の${providerSearchInstruction(aiProvider)}。
- 回答作成前に最新情報を調査する。Web検索できない場合は、research.summaryに「最新情報を確認できない」と明記し、未確認情報を最新事実として作らない。
- note公式（note.com/info、公式ヘルプ等）を最優先し、現在の機能、カテゴリ/おすすめの仕組み、創作カレンダー、開催中・直近の企画/お題、予約投稿や販売関連の現行仕様を確認する。
- 選択ジャンルについて、直近30日、直近90日、直近12か月の3つの時間軸で調べる。
- 季節性、検索需要、note内企画、長期的な読者課題を分けて考える。
- 投稿頻度、1日の投稿回数、無料/有料の比率、曜日、時間帯は固定の常識で決めず、調査内容・アカウントの新しさ・制作負荷・品質維持を踏まえて決める。
- 「毎日投稿すれば伸びる」「20時が正解」などの断定は禁止。時間帯は検証用の仮説として扱う。
- 有料noteは数を増やすことを目的にせず、無料記事で信頼や入口を作れるか、選択ジャンルで深掘り価値を出せるかを考えて頻度を決める。
- 新規/初心者アカウントでは、制作負荷と継続性を特に重視する。
- 根拠にした情報源は内部判断に使うが、最終回答には出典一覧や説明文を出さない。

【アカウント条件】
- 主ジャンル: ${selected.genre}
- 運営スタイル: ${selected.style}
- 想定読者: ${selected.audience}
- 読者補足: ${readerExtra}
- 文章の雰囲気: ${selected.tone}
- 収益化方針: ${selected.monetization}
- 運営目的: ${NOTE_OPERATION_GOALS.find((item) => item.value === profile.operationGoal)?.label ?? profile.operationGoal}
- 補足テーマ: ${topics}
- アカウント作成済み: ${profile.accountReady ? "はい" : "いいえ"}
- プロフィール準備済み: ${profile.profileReady ? "はい" : "いいえ"}
- ユーザーが事実として入力した経験・資格・背景: ${factualBackground}
${performanceSection}
${articleOutputSection}
${workspacePresetContext ? `${workspacePresetContext}
` : ""}${accountPresetContext ? `${accountPresetContext}
` : ""}【スケジュール設計】
- あなた自身が、平均の週投稿数・有料noteの週平均・1日の最大投稿数・無料/有料の本数を決定する。
- scheduleに入れてよいtypeは free_note と paid_note の2種類だけ。review / sns_share / profile_setup は出力しない。
- free_note / paid_note には、実際に記事作成へ進める具体的なテーマとタイトルを入れる。
- カレンダーは「無料note作成」「有料note作成」の制作予定として使う。SNS告知、振り返り、初期設定などの記事制作以外の予定は入れない。
- 同じ日・同じ時間に記事作成予定を重複させない。
- 1日に2回以上投稿する日を作る場合は、投稿回数と同じ数だけ行を分け、各行に異なる投稿時刻を必ず入れる。
- 例：1日2回なら2行・2時刻、1日3回なら3行・3時刻。複数投稿を1行にまとめたり、時刻を省略したりしない。
- 複数投稿の時刻は調査結果と読者像を踏まえて決め、同日の時刻同士は原則3時間以上空ける。
- 休む日も含めて、初心者が現実的に続けられる計画にする。
- トレンド記事だけで埋めず、対象月の旬の記事と半年後も読まれる記事を混ぜる。
- 有料noteを置く場合、その前後に関連する無料noteがあるなど読者導線を考える。
- 投稿時間は検証案として扱い、最終表では各投稿の時刻だけを明示する。
- 投稿頻度・無料/有料比率・投稿時刻の理由は内部判断に使い、最終回答へ説明文として追加しない。
- 対象月が今月の場合、予定表は「今日から月末までに新しく行う分」だけを表す。すでに作成済み・完了済みの記事を本数へ二重計上しない。
- 月途中の再計画では、今日より前の履歴は変更対象にせず、今日以降だけを新しい計画にする。
- ユーザーはスケジュール通りに完璧に運用する必要はない。予定より多く作れた場合も少なかった場合も、その実績から次回再計画できる柔軟な案にする。

【絶対ルール】
- ユーザーが入力していない経歴、職業、年齢、収入、実績、資格、購入経験、利用経験、成功体験を作らない。
- 成果保証、過度な煽り、架空の権威付けをしない。
- 競合クリエイターの文章・プロフィールをコピーまたは近似模倣しない。
- 調査で確認できない数値やトレンドを事実として断定しない。

【出力形式】
最終回答は、AASへそのままコピー＆ペーストする次のMarkdown表だけを返す。
前文、挨拶、説明、要約、理由、注意書き、出典一覧、コードフェンス、表の後の文章は一切出力しない。

| 日付 | 時刻 | 種別 | 記事タイトル | テーマ |
|---|---|---|---|---|
| ${firstAllowedDate} | 20:00 | 無料note作成 | 具体的な記事タイトル | 記事テーマ |

- 種別は「無料note作成」または「有料note作成」の2種類だけ。
- 日付はYYYY-MM-DD形式。
- 時刻はHH:MM形式。
- 対象月が今月の場合、今日より前の日付は入れない。
- 1日2回以上なら投稿回数と同じ行数を作り、各行に異なる時刻を書く。
- 表には記事作成予定だけを入れ、振り返り・SNS告知・初期設定は入れない。
- 表以外の文字は出力しない。`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 1200) : "";
  } catch {
    return "";
  }
}

function normalizeAiArticleScheduleType(value: unknown): "free_note" | "paid_note" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["free_note", "free", "free_article", "無料note", "無料ノート", "無料記事", "無料note作成"].includes(normalized)) return "free_note";
  if (["paid_note", "paid", "paid_article", "有料note", "有料ノート", "有料記事", "有料note作成"].includes(normalized)) return "paid_note";
  return null;
}

function fallbackDailyPostingTimes(count: number): string[] {
  if (count <= 1) return ["20:00"];
  const presets: Record<number, string[]> = {
    2: ["12:00", "20:00"],
    3: ["09:00", "14:00", "20:00"],
    4: ["08:00", "12:00", "16:00", "20:00"],
  };
  if (presets[count]) return presets[count];

  const startMinutes = 8 * 60;
  const endMinutes = 21 * 60;
  const step = (endMinutes - startMinutes) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => {
    const total = Math.round(startMinutes + step * index);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  });
}

function ensureDistinctDailyPostingTimes(items: NoteScheduleItem[]): NoteScheduleItem[] {
  const result = items.map((item) => ({ ...item }));
  const indexesByDate = new Map<string, number[]>();

  result.forEach((item, index) => {
    const indexes = indexesByDate.get(item.scheduledDate) ?? [];
    indexes.push(index);
    indexesByDate.set(item.scheduledDate, indexes);
  });

  for (const indexes of indexesByDate.values()) {
    if (indexes.length <= 1) continue;
    const uniqueTimes = new Set(indexes.map((index) => result[index].scheduledTime));
    if (uniqueTimes.size === indexes.length) continue;

    const fallbackTimes = fallbackDailyPostingTimes(indexes.length);
    indexes
      .sort((left, right) => result[left].scheduledTime.localeCompare(result[right].scheduledTime))
      .forEach((index, order) => {
        result[index] = { ...result[index], scheduledTime: fallbackTimes[order] };
      });
  }

  return result;
}

function parseSimpleAiArticleSchedule(text: string, expectedMonth: string): NoteScheduleItem[] {
  const { start, end } = noteMonthBounds(expectedMonth);
  const [targetYear, targetMonthNumber] = expectedMonth.split("-").map(Number);
  const items: NoteScheduleItem[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s*/, "").trim();
    if (!line) continue;

    const type = /有料(?:note|ノート|記事)(?:作成)?/i.test(line) || /\bpaid(?:_note|_article)?\b/i.test(line)
      ? "paid_note"
      : /無料(?:note|ノート|記事)(?:作成)?/i.test(line) || /\bfree(?:_note|_article)?\b/i.test(line)
        ? "free_note"
        : null;
    if (!type) continue;

    let date = "";
    const fullDate = line.match(/\b(20\d{2})[-\/.年](\d{1,2})[-\/.月](\d{1,2})(?:日)?\b/);
    if (fullDate) {
      date = fullDate[1] + "-" + String(Number(fullDate[2])).padStart(2, "0") + "-" + String(Number(fullDate[3])).padStart(2, "0");
    } else {
      const monthDay = line.match(/(?:^|[|\s])(\d{1,2})[\/.月](\d{1,2})(?:日)?(?:[|\s]|$)/);
      if (monthDay && Number(monthDay[1]) === targetMonthNumber) {
        date = String(targetYear) + "-" + String(Number(monthDay[1])).padStart(2, "0") + "-" + String(Number(monthDay[2])).padStart(2, "0");
      }
    }
    if (!date || date < start || date > end) continue;

    const timeMatch = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const time = timeMatch ? String(Number(timeMatch[1])).padStart(2, "0") + ":" + timeMatch[2] : "20:00";

    const cells = line.split("|").map((value) => value.trim()).filter(Boolean);
    const typeIndex = cells.findIndex((value) =>
      /(?:無料|有料)(?:note|ノート|記事)(?:作成)?/i.test(value) ||
      /\b(?:free|paid)(?:_note|_article)?\b/i.test(value),
    );

    let title = "";
    let theme = "";
    if (typeIndex >= 0) {
      title = cells[typeIndex + 1] ?? "";
      theme = cells[typeIndex + 2] ?? "";
    }
    if (!title) {
      title = line
        .replace(/\|/g, " ")
        .replace(/\b20\d{2}[-\/.年]\d{1,2}[-\/.月]\d{1,2}(?:日)?\b/g, " ")
        .replace(/\b\d{1,2}[\/.月]\d{1,2}(?:日)?\b/g, " ")
        .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, " ")
        .replace(/(?:無料|有料)(?:note|ノート|記事)(?:作成)?/gi, " ")
        .replace(/\b(?:free|paid)(?:_note|_article)?\b/gi, " ")
        .replace(/\s+/g, " ")
        .replace(/^[:：\-–—\s]+|[:：\-–—\s]+$/g, "")
        .trim();
    }
    const fallbackTitle = type === "paid_note" ? "有料noteを作成" : "無料noteを作成";
    const finalTitle = (title || fallbackTitle).slice(0, 240);
    const key = date + "|" + time + "|" + type + "|" + finalTitle;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      scheduledDate: date,
      scheduledTime: time,
      itemType: type,
      title: finalTitle,
      theme: theme.slice(0, 500),
      status: "planned",
      source: "imported",
      notes: "",
    });
  }

  return ensureDistinctDailyPostingTimes(items)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime));
}
function parseAiScheduleItem(raw: Record<string, unknown>): NoteScheduleItem | null {
  const date = typeof raw.date === "string"
    ? raw.date
    : typeof raw.scheduled_date === "string"
      ? raw.scheduled_date
      : typeof raw.day === "string"
        ? raw.day
        : "";
  const type = normalizeAiArticleScheduleType(raw.type ?? raw.item_type ?? raw.article_type);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !type) return null;

  const theme = typeof raw.theme === "string"
    ? raw.theme.trim().slice(0, 500)
    : typeof raw.topic === "string"
      ? raw.topic.trim().slice(0, 500)
      : "";
  const rawTitle = typeof raw.title === "string"
    ? raw.title.trim()
    : typeof raw.article_title === "string"
      ? raw.article_title.trim()
      : typeof raw.name === "string"
        ? raw.name.trim()
        : "";
  const fallbackTitle = theme || (type === "paid_note" ? "有料noteを作成" : "無料noteを作成");

  return {
    scheduledDate: date,
    scheduledTime: normalizeTime(
      typeof raw.time === "string"
        ? raw.time
        : typeof raw.scheduled_time === "string"
          ? raw.scheduled_time
          : "20:00",
      "20:00",
    ),
    itemType: type,
    title: (rawTitle || fallbackTitle).slice(0, 240),
    theme,
    status: "planned",
    source: "imported",
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 1200) : "",
  };
}

export function parseNoteAiSchedulePlan(
  text: string,
  expectedMonth: string,
  currentDate = todayJstDateKey(),
): NoteAiSchedulePlan {
  const bounds = noteMonthBounds(expectedMonth);
  let root: Record<string, unknown>;
  try {
    root = extractNoteAiScheduleJson(text);
  } catch {
    const parsed = parseSimpleAiArticleSchedule(text, expectedMonth);
    const simpleSchedule = expectedMonth === currentDate.slice(0, 7)
      ? parsed.filter((item) => item.scheduledDate >= currentDate)
      : parsed;
    if (!simpleSchedule.length) {
      throw new Error("AI回答から無料note・有料noteの作成予定を見つけられませんでした。回答全文をそのまま貼り付けてください。");
    }
    const freePosts = simpleSchedule.filter((item) => item.itemType === "free_note").length;
    const paidPosts = simpleSchedule.filter((item) => item.itemType === "paid_note").length;
    const perDay = new Map<string, number>();
    for (const item of simpleSchedule) perDay.set(item.scheduledDate, (perDay.get(item.scheduledDate) ?? 0) + 1);
    const startForRate = expectedMonth === currentDate.slice(0, 7) ? currentDate : bounds.start;
    const spanDays = Math.max(1, Math.floor((Date.parse(bounds.end + "T00:00:00Z") - Date.parse(startForRate + "T00:00:00Z")) / 86400000) + 1);
    const planningWeeks = Math.max(1, spanDays / 7);
    return {
      schema: "aas-note-schedule-v2",
      targetMonth: expectedMonth,
      generatedForJst: currentDate,
      provider: "chatgpt",
      researchSummary: "",
      strategySummary: "",
      assumptions: [],
      sources: [],
      recommendation: {
        postsPerWeek: Math.round((simpleSchedule.length / planningWeeks) * 10) / 10,
        paidPostsPerWeek: Math.round((paidPosts / planningWeeks) * 10) / 10,
        maxPostsPerDay: Math.max(0, ...perDay.values()),
        totalPosts: simpleSchedule.length,
        freePosts,
        paidPosts,
        reason: "AI回答内の無料note・有料note作成予定をAASが直接読み取りました。",
      },
      schedule: simpleSchedule,
      warnings: ["JSONではなくAI回答内の予定表・文章から読み取りました。"],
    };
  }
  const responseTargetMonth = typeof root.target_month === "string"
    ? root.target_month
    : typeof root.targetMonth === "string"
      ? root.targetMonth
      : "";
  if (responseTargetMonth !== expectedMonth) throw new Error(`AIの対象月（${responseTargetMonth}）とAASで選択した対象月（${expectedMonth}）が一致しません。`);

  const providerRaw = typeof root.provider === "string" ? root.provider.toLowerCase() : "";
  const provider = providerRaw.includes("gemini") ? "gemini" : providerRaw.includes("claude") ? "claude" : "chatgpt";
  const generatedForJst = typeof root.generated_for_jst === "string" && /^\d{4}-\d{2}-\d{2}$/.test(root.generated_for_jst)
    ? root.generated_for_jst
    : currentDate;
  const research = asObject(root.research);
  const recommendationRaw = asObject(root.recommendation);
  const scheduleRaw = Array.isArray(root.schedule)
    ? root.schedule
    : Array.isArray(root.calendar)
      ? root.calendar
      : Array.isArray(root.items)
        ? root.items
        : [];
  const { start, end } = bounds;
  const schedule = ensureDistinctDailyPostingTimes(
    scheduleRaw
      .map((item) => item && typeof item === "object" && !Array.isArray(item) ? parseAiScheduleItem(item as Record<string, unknown>) : null)
      .filter((item): item is NoteScheduleItem => Boolean(item)),
  );

  if (!schedule.length) throw new Error("無料note作成・有料note作成の予定を読み込めませんでした。AIの回答に日付と無料/有料noteの予定が含まれているか確認してください。");
  const outside = schedule.filter((item) => item.scheduledDate < start || item.scheduledDate > end);
  if (outside.length) throw new Error("対象月の外にある予定が含まれています。AIに対象月だけで再作成してもらってください。");
  if (schedule.length > 200) throw new Error("1か月の予定が多すぎます。200件以下にしてください。");

  const articleItems = schedule;
  const actualFree = articleItems.filter((item) => item.itemType === "free_note").length;
  const actualPaid = articleItems.filter((item) => item.itemType === "paid_note").length;
  const perDay = new Map<string, number>();
  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();
  for (const item of articleItems) {
    const key = `${item.scheduledDate}|${item.scheduledTime}`;
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);
    perDay.set(item.scheduledDate, (perDay.get(item.scheduledDate) ?? 0) + 1);
  }
  const actualMaxPerDay = Math.max(0, ...perDay.values());
  const warnings: string[] = [];
  if (duplicateKeys.size) warnings.push(`同じ日時に記事投稿が重複しています（${duplicateKeys.size}件）。`);
  if (actualMaxPerDay >= 3) warnings.push(`1日に最大${actualMaxPerDay}本の記事投稿があります。制作負荷を確認してください。`);
  if (!Array.isArray(research.sources) || research.sources.length === 0) warnings.push("調査元URLがありません。最新情報の根拠をAIに再確認することをおすすめします。");
  if (expectedMonth === currentDate.slice(0, 7)) {
    const pastCount = articleItems.filter((item) => item.scheduledDate < currentDate).length;
    if (pastCount) warnings.push(`今日より前の投稿予定が${pastCount}件あります。必要なら削除してから反映してください。`);
  }

  const sources: NoteAiResearchSource[] = (Array.isArray(research.sources) ? research.sources : [])
    .map((value) => {
      const source = asObject(value);
      const url = safeHttpUrl(source.url);
      if (!url) return null;
      return {
        title: typeof source.title === "string" ? source.title.trim().slice(0, 300) : "",
        url,
        publishedAt: typeof source.published_at === "string" ? source.published_at.trim().slice(0, 40) : "",
        whyUsed: typeof source.why_used === "string" ? source.why_used.trim().slice(0, 800) : "",
      };
    })
    .filter((value): value is NoteAiResearchSource => Boolean(value))
    .slice(0, 30);

  if (sources.length > 0 && !sources.some((source) => {
    try {
      const url = new URL(source.url);
      return url.hostname === "note.com" && url.pathname.startsWith("/info/");
    } catch {
      return false;
    }
  })) {
    warnings.push("note公式（note.com/info）の出典が確認できません。note現行仕様や企画の根拠を再確認してください。");
  }

  const generatedDate = new Date(generatedForJst + "T00:00:00Z");
  const recentSourceCutoff = new Date(generatedDate);
  recentSourceCutoff.setUTCDate(recentSourceCutoff.getUTCDate() - 180);
  const datedSources = sources
    .map((source) => /^\d{4}-\d{2}-\d{2}/.test(source.publishedAt) ? new Date(source.publishedAt.slice(0, 10) + "T00:00:00Z") : null)
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  if (sources.length > 0 && datedSources.length === 0) {
    warnings.push("出典の公開・更新日を確認できません。最新トレンドの根拠日付をAIに再確認してください。");
  } else if (datedSources.length > 0 && !datedSources.some((date) => date >= recentSourceCutoff && date <= generatedDate)) {
    warnings.push("直近180日以内の出典が確認できません。最新トレンド部分は再調査をおすすめします。");
  }

  const declaredTotal = Math.max(0, Math.round(finiteNumber(recommendationRaw.total_posts, articleItems.length)));
  const declaredFree = Math.max(0, Math.round(finiteNumber(recommendationRaw.free_posts, actualFree)));
  const declaredPaid = Math.max(0, Math.round(finiteNumber(recommendationRaw.paid_posts, actualPaid)));
  if (declaredTotal !== articleItems.length || declaredFree !== actualFree || declaredPaid !== actualPaid) {
    warnings.push("AIのrecommendation本数と実際のschedule件数が一致しないため、AASは実際の予定件数を採用します。");
  }

  return {
    schema: "aas-note-schedule-v2",
    targetMonth: expectedMonth,
    generatedForJst,
    provider,
    researchSummary: typeof research.summary === "string" ? research.summary.trim().slice(0, 6000) : "",
    strategySummary: typeof research.strategy_summary === "string" ? research.strategy_summary.trim().slice(0, 6000) : "",
    assumptions: Array.isArray(research.assumptions)
      ? research.assumptions.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 500)).filter(Boolean).slice(0, 30)
      : [],
    sources,
    recommendation: {
      postsPerWeek: Math.max(0, Math.min(21, finiteNumber(recommendationRaw.posts_per_week))),
      paidPostsPerWeek: Math.max(0, Math.min(14, finiteNumber(recommendationRaw.paid_posts_per_week))),
      maxPostsPerDay: actualMaxPerDay,
      totalPosts: articleItems.length,
      freePosts: actualFree,
      paidPosts: actualPaid,
      reason: typeof recommendationRaw.recommendation_reason === "string" ? recommendationRaw.recommendation_reason.trim().slice(0, 6000) : "",
    },
    schedule: schedule.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime)),
    warnings,
  };
}

export async function replaceNoteScheduleMonth(
  client: SupabaseClient,
  userId: string,
  targetMonth: string,
  items: NoteScheduleItem[],
  currentDate = todayJstDateKey(),
): Promise<NoteScheduleItem[]> {
  const { start, end } = noteMonthBounds(targetMonth);
  const replacementStart = targetMonth === currentDate.slice(0, 7) ? currentDate : start;
  const previous = await listNoteSchedule(client, userId, start, end);
  const preserved = previous.filter(
    (item) => item.scheduledDate < replacementStart || item.status !== "planned" || !isNoteArticleScheduleItem(item),
  );
  const preservedKeys = new Set(
    preserved.map((item) => `${item.scheduledDate}|${item.scheduledTime}|${item.itemType}`),
  );
  const clean = items
    .filter((item) => isNoteArticleScheduleItem(item))
    .filter((item) => item.scheduledDate >= replacementStart && item.scheduledDate <= end && item.title.trim())
    .filter((item) => !preservedKeys.has(`${item.scheduledDate}|${item.scheduledTime}|${item.itemType}`))
    .slice(0, 200)
    .map((item) => ({ ...item, id: undefined, source: "imported" as NoteScheduleSource }));
  const previousReplaceable = previous.filter(
    (item) => item.scheduledDate >= replacementStart && item.status === "planned" && isNoteArticleScheduleItem(item),
  );

  const deleteQuery = client
    .from("note_operation_schedule_items")
    .delete()
    .eq("user_id", userId)
    .gte("scheduled_date", replacementStart)
    .lte("scheduled_date", end)
    .eq("status", "planned")
    .in("item_type", ["free_note", "paid_note"]);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error("対象月の既存スケジュールを更新できませんでした。");

  if (clean.length) {
    const { error: insertError } = await client
      .from("note_operation_schedule_items")
      .insert(clean.map((item) => dbScheduleRow(userId, item)));
    if (insertError) {
      if (previousReplaceable.length) {
        await client.from("note_operation_schedule_items").insert(previousReplaceable.map((item) => dbScheduleRow(userId, item)));
      }
      throw new Error("AIの月間スケジュールを保存できませんでした。");
    }
  }
  return listNoteSchedule(client, userId);
}

export async function saveNoteAiSchedulePlan(
  client: SupabaseClient,
  userId: string,
  plan: NoteAiSchedulePlan,
): Promise<void> {
  const { error } = await client.from("note_operation_schedule_plans").upsert({
    user_id: userId,
    target_month: plan.targetMonth + "-01",
    ai_provider: plan.provider,
    generated_for_date: plan.generatedForJst,
    research_summary: plan.researchSummary,
    strategy_summary: plan.strategySummary,
    assumptions: plan.assumptions,
    research_sources: plan.sources.map((source) => ({
      title: source.title,
      url: source.url,
      published_at: source.publishedAt,
      why_used: source.whyUsed,
    })),
    recommended_posts_per_week: plan.recommendation.postsPerWeek,
    recommended_paid_posts_per_week: plan.recommendation.paidPostsPerWeek,
    recommended_max_posts_per_day: plan.recommendation.maxPostsPerDay,
    total_posts: plan.recommendation.totalPosts,
    free_posts: plan.recommendation.freePosts,
    paid_posts: plan.recommendation.paidPosts,
    recommendation_reason: plan.recommendation.reason,
    applied_at: new Date().toISOString(),
  }, { onConflict: "user_id,target_month" });
  if (error) throw new Error("AIの調査結果を保存できませんでした。");
}

export async function loadNoteAiSchedulePlan(
  client: SupabaseClient,
  userId: string,
  targetMonth: string,
): Promise<NoteAiSchedulePlan | null> {
  const { data, error } = await client
    .from("note_operation_schedule_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("target_month", targetMonth + "-01")
    .maybeSingle();
  if (error) throw new Error("AI運用プランを読み込めませんでした。");
  if (!data) return null;
  const sourcesRaw = Array.isArray(data.research_sources) ? data.research_sources : [];
  const sources: NoteAiResearchSource[] = sourcesRaw.map((value: unknown) => {
    const source = asObject(value);
    return {
      title: typeof source.title === "string" ? source.title : "",
      url: safeHttpUrl(source.url),
      publishedAt: typeof source.published_at === "string" ? source.published_at : "",
      whyUsed: typeof source.why_used === "string" ? source.why_used : "",
    };
  }).filter((source: NoteAiResearchSource) => source.url);
  const monthSchedule = (await listNoteSchedule(client, userId, targetMonth + "-01", noteMonthBounds(targetMonth).end))
    .filter((item) => isNoteArticleScheduleItem(item));
  return {
    schema: "aas-note-schedule-v2",
    targetMonth,
    generatedForJst: typeof data.generated_for_date === "string" ? data.generated_for_date : todayJstDateKey(),
    provider: data.ai_provider === "gemini" || data.ai_provider === "claude" ? data.ai_provider : "chatgpt",
    researchSummary: typeof data.research_summary === "string" ? data.research_summary : "",
    strategySummary: typeof data.strategy_summary === "string" ? data.strategy_summary : "",
    assumptions: Array.isArray(data.assumptions) ? data.assumptions.filter((item: unknown): item is string => typeof item === "string") : [],
    sources,
    recommendation: {
      postsPerWeek: finiteNumber(data.recommended_posts_per_week),
      paidPostsPerWeek: finiteNumber(data.recommended_paid_posts_per_week),
      maxPostsPerDay: Math.round(finiteNumber(data.recommended_max_posts_per_day)),
      totalPosts: Math.round(finiteNumber(data.total_posts)),
      freePosts: Math.round(finiteNumber(data.free_posts)),
      paidPosts: Math.round(finiteNumber(data.paid_posts)),
      reason: typeof data.recommendation_reason === "string" ? data.recommendation_reason : "",
    },
    schedule: monthSchedule,
    warnings: [],
  };
}


export function exportNoteAiSchedulePlanJson(plan: NoteAiSchedulePlan): string {
  return JSON.stringify({
    schema: "aas-note-schedule-v2",
    target_month: plan.targetMonth,
    generated_for_jst: plan.generatedForJst,
    provider: plan.provider,
    research: {
      summary: plan.researchSummary,
      strategy_summary: plan.strategySummary,
      assumptions: plan.assumptions,
      sources: plan.sources.map((source) => ({
        title: source.title,
        url: source.url,
        published_at: source.publishedAt,
        why_used: source.whyUsed,
      })),
    },
    recommendation: {
      posts_per_week: plan.recommendation.postsPerWeek,
      paid_posts_per_week: plan.recommendation.paidPostsPerWeek,
      max_posts_per_day: plan.recommendation.maxPostsPerDay,
      total_posts: plan.recommendation.totalPosts,
      free_posts: plan.recommendation.freePosts,
      paid_posts: plan.recommendation.paidPosts,
      recommendation_reason: plan.recommendation.reason,
    },
    schedule: plan.schedule.map((item) => ({
      date: item.scheduledDate,
      time: item.scheduledTime,
      type: item.itemType,
      title: item.title,
      theme: item.theme,
      notes: item.notes,
    })),
  }, null, 2);
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
