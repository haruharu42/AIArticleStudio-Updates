import type { SupabaseClient, User } from "@supabase/supabase-js";

export const PWA_PRODUCT_CODE = "AAS-PWA-BETA";

export type ProfileStatus =
  | "pending"
  | "active"
  | "suspended"
  | "disabled";

export type ProfileRole = "user" | "admin";

export type AasProfile = {
  id: string;
  aas_user_id: string;
  display_name: string | null;
  role: ProfileRole;
  status: ProfileStatus;
};

export type AccessState =
  | { kind: "signed_out" }
  | { kind: "pending"; user: User; profile: AasProfile }
  | { kind: "suspended"; user: User; profile: AasProfile }
  | { kind: "disabled"; user: User; profile: AasProfile }
  | { kind: "entitlement_denied"; user: User; profile: AasProfile }
  | { kind: "ready"; user: User; profile: AasProfile };

function isRole(value: unknown): value is ProfileRole {
  return value === "user" || value === "admin";
}

function isStatus(value: unknown): value is ProfileStatus {
  return (
    value === "pending" ||
    value === "active" ||
    value === "suspended" ||
    value === "disabled"
  );
}

function parseProfile(value: unknown): AasProfile {
  if (!value || typeof value !== "object") {
    throw new Error("ユーザープロフィールを確認できませんでした。");
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.aas_user_id !== "string" ||
    !isRole(row.role) ||
    !isStatus(row.status) ||
    (row.display_name !== null && typeof row.display_name !== "string")
  ) {
    throw new Error("ユーザープロフィールの形式が不正です。");
  }

  return {
    id: row.id,
    aas_user_id: row.aas_user_id,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
  };
}

export async function loadAccessState(
  client: SupabaseClient,
): Promise<AccessState> {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) return { kind: "signed_out" };

  const { data: profileRow, error: profileError } = await client
    .from("profiles")
    .select("id,aas_user_id,display_name,role,status")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error("プロフィールの取得に失敗しました。");
  }

  const profile = parseProfile(profileRow);
  if (profile.id !== user.id) {
    throw new Error("プロフィール所有者の照合に失敗しました。");
  }

  if (profile.status === "pending") {
    return { kind: "pending", user, profile };
  }
  if (profile.status === "suspended") {
    return { kind: "suspended", user, profile };
  }
  if (profile.status === "disabled") {
    return { kind: "disabled", user, profile };
  }

  const { data: canAccess, error: entitlementError } = await client.rpc(
    "can_access_product",
    { p_product_code: PWA_PRODUCT_CODE },
  );
  if (entitlementError) {
    throw new Error("PWA利用権の確認に失敗しました。");
  }

  if (canAccess !== true) {
    return { kind: "entitlement_denied", user, profile };
  }

  return { kind: "ready", user, profile };
}

export function authMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();

  if (lowered.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (lowered.includes("email not confirmed")) {
    return "確認メール内のリンクを開いてからログインしてください。";
  }
  if (lowered.includes("user already registered")) {
    return "このメールアドレスは登録済みです。";
  }
  if (lowered.includes("password")) {
    return "パスワードを確認してください。";
  }
  if (lowered.includes("rate limit")) {
    return "操作が続いたため一時制限されています。時間をおいてください。";
  }
  return message || "認証処理に失敗しました。";
}
