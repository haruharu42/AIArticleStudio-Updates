import type { SupabaseClient } from "@supabase/supabase-js";

export const PWA_PRODUCT = "AAS-PWA-BETA" as const;

export type PwaAdminUser = {
  id: string;
  aasUserId: string;
  displayName: string | null;
  role: "user" | "admin";
  status: "pending" | "active" | "suspended" | "disabled";
  createdAt: string;
};

export type PwaAdminEntitlement = {
  id: string;
  productCode: string;
  productName: string;
  status: string;
  salesChannel: string;
  externalReference: string | null;
  grantedAt: string;
  expiresAt: string | null;
};

export type PwaAdminInvite = {
  id: string;
  code: string;
  label: string | null;
  status: "active" | "exhausted" | "revoked";
  salesChannel: string;
  externalReference: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  entitlementExpiresAt: string | null;
};

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("管理APIの応答形式が不正です。");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("管理APIの応答形式が不正です。");
    }
    return item as Record<string, unknown>;
  });
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name}の形式が不正です。`);
  return value;
}

function nullableText(value: unknown, name: string): string | null {
  return value === null || value === undefined ? null : text(value, name);
}

function safeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name}の形式が不正です。`);
  }
  return value;
}

function adminError(error: unknown, fallback: string): Error {
  const source = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = typeof source.message === "string" ? source.message.toLowerCase() : "";
  if (message.includes("active admin required") || message.includes("aal2")) {
    return new Error("管理者MFAを確認できません。6桁コードで再認証してからお試しください。");
  }
  if (message.includes("invalid status transition")) {
    return new Error("現在の状態ではその変更を実行できません。");
  }
  if (message.includes("active entitlement not found")) {
    return new Error("有効なPWA利用権がありません。");
  }
  return new Error(fallback);
}

export async function listPwaAdminUsers(client: SupabaseClient, aasId = ""): Promise<PwaAdminUser[]> {
  const { data, error } = await client.rpc("admin_list_users", {
    p_aas_user_id: aasId.trim() || null,
  });
  if (error) throw adminError(error, "ユーザー一覧の取得に失敗しました。");
  return rows(data).map((row) => ({
    id: text(row.id, "id"),
    aasUserId: text(row.aas_user_id, "AAS ID"),
    displayName: nullableText(row.display_name, "表示名"),
    role: text(row.role, "role") as PwaAdminUser["role"],
    status: text(row.status, "status") as PwaAdminUser["status"],
    createdAt: text(row.created_at, "created_at"),
  }));
}

export async function setPwaAdminUserStatus(
  client: SupabaseClient,
  userId: string,
  status: "active" | "suspended",
): Promise<void> {
  const { error } = await client.rpc("admin_set_user_status", {
    p_target_user_id: userId,
    p_new_status: status,
  });
  if (error) throw adminError(error, "アカウント状態の変更に失敗しました。");
}

export async function listPwaEntitlements(
  client: SupabaseClient,
  userId: string,
): Promise<PwaAdminEntitlement[]> {
  const { data, error } = await client.rpc("admin_list_user_entitlements", {
    p_target_user_id: userId,
  });
  if (error) throw adminError(error, "PWA利用権の取得に失敗しました。");
  return rows(data)
    .filter((row) => row.product_code === PWA_PRODUCT)
    .map((row) => ({
      id: text(row.id, "id"),
      productCode: text(row.product_code, "product_code"),
      productName: text(row.product_name, "product_name"),
      status: text(row.status, "status"),
      salesChannel: text(row.sales_channel, "sales_channel"),
      externalReference: nullableText(row.external_reference, "external_reference"),
      grantedAt: text(row.granted_at, "granted_at"),
      expiresAt: nullableText(row.expires_at, "expires_at"),
    }));
}

export async function grantPwaEntitlement(
  client: SupabaseClient,
  userId: string,
  input: { salesChannel: string; externalReference?: string; expiresAt?: string },
): Promise<void> {
  const { error } = await client.rpc("admin_grant_entitlement", {
    p_target_user_id: userId,
    p_product_code: PWA_PRODUCT,
    p_expires_at: input.expiresAt || null,
    p_sales_channel: input.salesChannel.trim() || "admin-pwa",
    p_external_reference: input.externalReference?.trim() || null,
  });
  if (error) throw adminError(error, "PWA利用権の付与に失敗しました。");
}

export async function revokePwaEntitlement(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.rpc("admin_revoke_entitlement", {
    p_target_user_id: userId,
    p_product_code: PWA_PRODUCT,
  });
  if (error) throw adminError(error, "PWA利用権の取り消しに失敗しました。");
}

function parseInvite(row: Record<string, unknown>): PwaAdminInvite {
  return {
    id: text(row.id, "id"),
    code: text(row.invite_code, "invite_code"),
    label: nullableText(row.label, "label"),
    status: text(row.status, "status") as PwaAdminInvite["status"],
    salesChannel: text(row.sales_channel, "sales_channel"),
    externalReference: nullableText(row.external_reference, "external_reference"),
    maxUses: safeInteger(row.max_uses, "max_uses"),
    useCount: safeInteger(row.use_count, "use_count"),
    expiresAt: nullableText(row.expires_at, "expires_at"),
    entitlementExpiresAt: nullableText(row.entitlement_expires_at, "entitlement_expires_at"),
  };
}

export async function listPwaAccessCodes(client: SupabaseClient): Promise<PwaAdminInvite[]> {
  const { data, error } = await client.rpc("admin_list_pwa_invites", { p_status: null });
  if (error) throw adminError(error, "利用コード一覧の取得に失敗しました。");
  return rows(data).map(parseInvite);
}

export async function createPwaAccessCode(
  client: SupabaseClient,
  input: {
    label?: string;
    salesChannel: string;
    externalReference?: string;
    expiresAt?: string;
    entitlementExpiresAt?: string;
    maxUses: number;
  },
): Promise<PwaAdminInvite> {
  const { data, error } = await client.rpc("admin_create_pwa_invite", {
    p_label: input.label?.trim() || null,
    p_sales_channel: input.salesChannel.trim() || "admin-pwa-code",
    p_external_reference: input.externalReference?.trim() || null,
    p_expires_at: input.expiresAt || null,
    p_entitlement_expires_at: input.entitlementExpiresAt || null,
    p_max_uses: input.maxUses,
  });
  if (error) throw adminError(error, "利用コードの作成に失敗しました。");
  const parsed = rows(data);
  if (parsed.length !== 1) throw new Error("利用コード作成結果が不正です。");
  return parseInvite(parsed[0]);
}

export async function revokePwaAccessCode(client: SupabaseClient, inviteId: string): Promise<void> {
  const { error } = await client.rpc("admin_revoke_pwa_invite", { p_invite_id: inviteId });
  if (error) throw adminError(error, "利用コードの無効化に失敗しました。");
}
