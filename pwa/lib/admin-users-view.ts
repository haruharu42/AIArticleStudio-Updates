import type { PwaAdminInvite, PwaAdminUser } from "@/lib/pwa-admin-users";

export type UserFilter = "all" | PwaAdminUser["status"];

export const USER_FILTERS: Array<{ value: UserFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "承認待ち" },
  { value: "active", label: "利用中" },
  { value: "suspended", label: "停止中" },
  { value: "disabled", label: "無効" },
];

export const STATUS_LABELS: Record<PwaAdminUser["status"], string> = {
  pending: "承認待ち",
  active: "利用中",
  suspended: "停止中",
  disabled: "無効",
};

export function formatAdminDate(value: string | null): string {
  if (!value) return "無期限";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function adminStatusClass(status: PwaAdminUser["status"]): string {
  return `status-chip status-${status}`;
}

export function filterAdminUsers(
  users: PwaAdminUser[],
  search: string,
  filter: UserFilter,
): PwaAdminUser[] {
  const query = search.trim().toLowerCase();
  return users.filter((user) => {
    if (filter !== "all" && user.status !== filter) return false;
    if (!query) return true;
    return `${user.aasUserId} ${user.displayName ?? ""}`.toLowerCase().includes(query);
  });
}

export function summarizeAdminUsers(users: PwaAdminUser[]) {
  return {
    pending: users.filter((user) => user.status === "pending").length,
    active: users.filter((user) => user.status === "active").length,
  };
}

export function summarizeAccessCodes(codes: PwaAdminInvite[]) {
  return {
    active: codes.filter((code) => code.status === "active").length,
    used: codes.reduce((sum, code) => sum + code.useCount, 0),
  };
}
