import type { SupabaseClient } from "@supabase/supabase-js";

export type NoteOperationGoal = "habit" | "growth" | "monetize" | "portfolio";
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
