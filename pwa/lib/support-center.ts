import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportCategory =
  | "feature_request"
  | "bug"
  | "how_to"
  | "account_access"
  | "billing"
  | "other";

export type SupportStatus = "new" | "reviewing" | "waiting_user" | "resolved" | "closed";
export type SupportPriority = "normal" | "high" | "urgent";

export const SUPPORT_CATEGORY_OPTIONS: readonly { value: SupportCategory; label: string }[] = [
  { value: "feature_request", label: "追加機能要望" },
  { value: "bug", label: "不具合・エラー" },
  { value: "how_to", label: "使い方・質問" },
  { value: "account_access", label: "アカウント・利用権" },
  { value: "billing", label: "購入・支払い" },
  { value: "other", label: "その他" },
] as const;

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "新規",
  reviewing: "確認中",
  waiting_user: "ユーザー回答待ち",
  resolved: "解決済み",
  closed: "終了",
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  normal: "通常",
  high: "高",
  urgent: "緊急",
};

export type SupportRequest = {
  id: string;
  userId: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  priority: SupportPriority;
  adminSeenAt: string | null;
  userSeenAt: string | null;
  lastUserMessageAt: string;
  lastAdminMessageAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  requestId: string;
  senderUserId: string;
  senderRole: "user" | "admin";
  body: string;
  createdAt: string;
};

export type SupportUserSummary = {
  id: string;
  aasUserId: string;
  displayName: string;
};

export type SupportNotificationSummary = {
  unreadCount: number;
  openCount: number;
};

const REQUEST_COLUMNS = [
  "id",
  "user_id",
  "category",
  "subject",
  "status",
  "priority",
  "admin_seen_at",
  "user_seen_at",
  "last_user_message_at",
  "last_admin_message_at",
  "resolved_at",
  "created_at",
  "updated_at",
].join(",");

const MESSAGE_COLUMNS = "id,request_id,sender_user_id,sender_role,body,created_at";

function supportError(error: unknown, fallback: string): Error {
  const value = error as { message?: string; details?: string } | null;
  const message = value?.message ?? "";
  if (/daily limit exceeded/i.test(message)) {
    return new Error("短時間に多くの問い合わせが送信されています。時間を空けてからお試しください。");
  }
  if (/closed support request/i.test(message)) {
    return new Error("終了済みの問い合わせには追記できません。必要な場合は新しい問い合わせを作成してください。");
  }
  return new Error(fallback);
}

function requestFromRow(row: Record<string, unknown>): SupportRequest {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    category: row.category as SupportCategory,
    subject: typeof row.subject === "string" ? row.subject : "",
    status: row.status as SupportStatus,
    priority: row.priority as SupportPriority,
    adminSeenAt: typeof row.admin_seen_at === "string" ? row.admin_seen_at : null,
    userSeenAt: typeof row.user_seen_at === "string" ? row.user_seen_at : null,
    lastUserMessageAt: String(row.last_user_message_at ?? ""),
    lastAdminMessageAt: typeof row.last_admin_message_at === "string" ? row.last_admin_message_at : null,
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function messageFromRow(row: Record<string, unknown>): SupportMessage {
  return {
    id: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    senderUserId: String(row.sender_user_id ?? ""),
    senderRole: row.sender_role === "admin" ? "admin" : "user",
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function supportCategoryLabel(category: SupportCategory): string {
  return SUPPORT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "その他";
}

export function supportTicketCode(id: string): string {
  return id ? id.replace(/-/g, "").slice(0, 10).toUpperCase() : "----------";
}

export function hasUnreadAdminReply(request: SupportRequest): boolean {
  if (!request.lastAdminMessageAt) return false;
  if (!request.userSeenAt) return true;
  return new Date(request.lastAdminMessageAt).getTime() > new Date(request.userSeenAt).getTime();
}

export function hasUnreadUserMessage(request: SupportRequest): boolean {
  if (!request.adminSeenAt) return true;
  return new Date(request.lastUserMessageAt).getTime() > new Date(request.adminSeenAt).getTime();
}

export async function createSupportRequest(
  client: SupabaseClient,
  input: { category: SupportCategory; subject?: string; message: string },
): Promise<string> {
  const message = input.message.trim();
  if (message.length < 5) throw new Error("問い合わせ内容を5文字以上入力してください。");
  if (message.length > 5000) throw new Error("問い合わせ内容は5000文字以内で入力してください。");
  const subject = input.subject?.trim() ?? "";
  if (subject.length > 120) throw new Error("件名は120文字以内で入力してください。");

  const { data, error } = await client.rpc("create_support_request", {
    p_category: input.category,
    p_subject: subject || null,
    p_message: message,
  });
  if (error || typeof data !== "string") throw supportError(error, "問い合わせを送信できませんでした。");
  return data;
}

export async function listMySupportRequests(client: SupabaseClient, userId: string): Promise<SupportRequest[]> {
  const { data, error } = await client
    .from("support_requests")
    .select(REQUEST_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("問い合わせ履歴を読み込めませんでした。");
  return (data ?? []).map((row) => requestFromRow(row as Record<string, unknown>));
}

export async function listAdminSupportRequests(client: SupabaseClient): Promise<SupportRequest[]> {
  const { data, error } = await client
    .from("support_requests")
    .select(REQUEST_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("問い合わせ一覧を読み込めませんでした。");
  return (data ?? []).map((row) => requestFromRow(row as Record<string, unknown>));
}

export async function listSupportMessages(client: SupabaseClient, requestId: string): Promise<SupportMessage[]> {
  const { data, error } = await client
    .from("support_request_messages")
    .select(MESSAGE_COLUMNS)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("問い合わせの会話履歴を読み込めませんでした。");
  return (data ?? []).map((row) => messageFromRow(row as Record<string, unknown>));
}

export async function replySupportRequest(client: SupabaseClient, requestId: string, message: string): Promise<void> {
  const body = message.trim();
  if (!body) throw new Error("返信内容を入力してください。");
  if (body.length > 5000) throw new Error("返信は5000文字以内で入力してください。");
  const { error } = await client.rpc("reply_support_request", {
    p_request_id: requestId,
    p_message: body,
  });
  if (error) throw supportError(error, "返信を送信できませんでした。");
}

export async function markSupportRequestSeen(client: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await client.rpc("mark_support_request_seen", { p_request_id: requestId });
  if (error) throw new Error("既読状態を更新できませんでした。");
}

export async function closeOwnSupportRequest(client: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await client.rpc("close_own_support_request", { p_request_id: requestId });
  if (error) throw new Error("問い合わせを終了できませんでした。");
}

export async function adminSetSupportRequest(
  client: SupabaseClient,
  requestId: string,
  status: SupportStatus,
  priority: SupportPriority,
): Promise<void> {
  const { error } = await client.rpc("admin_set_support_request", {
    p_request_id: requestId,
    p_status: status,
    p_priority: priority,
  });
  if (error) throw new Error("問い合わせの管理状態を更新できませんでした。");
}

export async function getSupportNotificationSummary(client: SupabaseClient): Promise<SupportNotificationSummary> {
  const { data, error } = await client.rpc("get_support_notification_summary");
  if (error) return { unreadCount: 0, openCount: 0 };
  const row = Array.isArray(data) ? data[0] : data;
  const value = (row ?? {}) as Record<string, unknown>;
  return {
    unreadCount: Number(value.unread_count ?? 0) || 0,
    openCount: Number(value.open_count ?? 0) || 0,
  };
}

export async function loadSupportUsers(
  client: SupabaseClient,
  userIds: readonly string[],
): Promise<Record<string, SupportUserSummary>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await client
    .from("profiles")
    .select("id,aas_user_id,display_name")
    .in("id", unique);
  if (error) throw new Error("問い合わせユーザー情報を読み込めませんでした。");
  const result: Record<string, SupportUserSummary> = {};
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "");
    if (!id) continue;
    result[id] = {
      id,
      aasUserId: String(row.aas_user_id ?? ""),
      displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : "ユーザー",
    };
  }
  return result;
}
