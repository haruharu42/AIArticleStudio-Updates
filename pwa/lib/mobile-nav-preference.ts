export const MOBILE_NAV_PREFERENCE_KEY = "aas-pwa-bottom-nav-always";
export const MOBILE_NAV_PREFERENCE_EVENT = "aas-pwa-bottom-nav-preference";
export const MOBILE_NAV_ITEMS_KEY = "aas-pwa-bottom-nav-items";
export const MOBILE_NAV_ITEMS_EVENT = "aas-pwa-bottom-nav-items-preference";

export type MobileNavItemKey =
  | "create"
  | "noteOps"
  | "images"
  | "tools"
  | "sns"
  | "sidejob"
  | "snsPlan"
  | "publish"
  | "analytics"
  | "ranking"
  | "profile"
  | "manual";

export type MobileNavItem = {
  key: MobileNavItemKey;
  label: string;
  icon: string;
  href: string;
};

const FALLBACK_MOBILE_NAV_ITEM: MobileNavItem = { key: "create", label: "作成", icon: "✎", href: "/create" };

export const MOBILE_NAV_ITEM_OPTIONS: readonly MobileNavItem[] = [
  FALLBACK_MOBILE_NAV_ITEM,\n  { key: "noteOps", label: "note運営", icon: "▣", href: "/note-operations" },
  { key: "images", label: "画像", icon: "▧", href: "/images" },
  { key: "tools", label: "機能", icon: "▦", href: "/tools" },
  { key: "sns", label: "SNS", icon: "↗", href: "/sns" },
  { key: "sidejob", label: "副業", icon: "◇", href: "/sidejob" },
  { key: "snsPlan", label: "SNS設計", icon: "◎", href: "/sns-plan" },
  { key: "publish", label: "公開", icon: "⇧", href: "/publish" },
  { key: "analytics", label: "分析", icon: "▥", href: "/analytics" },
  { key: "ranking", label: "ランキング", icon: "🏆", href: "/ranking" },
  { key: "profile", label: "プロフィール", icon: "◎", href: "/profile" },
  { key: "manual", label: "使い方", icon: "?", href: "/manual" },
] as const;

export const DEFAULT_MOBILE_NAV_ITEMS: readonly MobileNavItemKey[] = ["create", "tools", "sns"];
export const MAX_CUSTOM_MOBILE_NAV_ITEMS = 3;

const VALID_MOBILE_NAV_KEYS = new Set<MobileNavItemKey>(MOBILE_NAV_ITEM_OPTIONS.map((item) => item.key));

export function readMobileNavAlways(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MOBILE_NAV_PREFERENCE_KEY) !== "0";
}

export function writeMobileNavAlways(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_NAV_PREFERENCE_KEY, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent<boolean>(MOBILE_NAV_PREFERENCE_EVENT, { detail: value }));
}

export function normalizeMobileNavItems(value: unknown): MobileNavItemKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_MOBILE_NAV_ITEMS];
  const next: MobileNavItemKey[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !VALID_MOBILE_NAV_KEYS.has(raw as MobileNavItemKey)) continue;
    const key = raw as MobileNavItemKey;
    if (!next.includes(key)) next.push(key);
    if (next.length >= MAX_CUSTOM_MOBILE_NAV_ITEMS) break;
  }
  return next;
}

export function readMobileNavItems(): MobileNavItemKey[] {
  if (typeof window === "undefined") return [...DEFAULT_MOBILE_NAV_ITEMS];
  const stored = window.localStorage.getItem(MOBILE_NAV_ITEMS_KEY);
  if (stored === null) return [...DEFAULT_MOBILE_NAV_ITEMS];
  try {
    return normalizeMobileNavItems(JSON.parse(stored));
  } catch {
    return [...DEFAULT_MOBILE_NAV_ITEMS];
  }
}

export function writeMobileNavItems(value: readonly MobileNavItemKey[]): MobileNavItemKey[] {
  const next = normalizeMobileNavItems([...value]);
  if (typeof window === "undefined") return next;
  window.localStorage.setItem(MOBILE_NAV_ITEMS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<MobileNavItemKey[]>(MOBILE_NAV_ITEMS_EVENT, { detail: next }));
  return next;
}

export function mobileNavItemFor(key: MobileNavItemKey): MobileNavItem {
  return MOBILE_NAV_ITEM_OPTIONS.find((item) => item.key === key) ?? FALLBACK_MOBILE_NAV_ITEM;
}
