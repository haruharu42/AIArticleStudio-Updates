export const DESKTOP_NAV_ITEMS_KEY = "aas-pwa-desktop-nav-items";
export const DESKTOP_NAV_ITEMS_EVENT = "aas-pwa-desktop-nav-items-preference";

export type DesktopNavItemKey =
  | "create"
  | "library"
  | "images"
  | "tools"
  | "sns"
  | "publish"
  | "analytics"
  | "ranking"
  | "profile"
  | "manual"
  | "missions";

export type DesktopNavItem = {
  key: DesktopNavItemKey;
  label: string;
  icon: string;
  href: string;
};

export const DESKTOP_NAV_ITEM_OPTIONS: readonly DesktopNavItem[] = [
  { key: "create", label: "記事作成", icon: "＋", href: "/create" },
  { key: "library", label: "ライブラリ", icon: "▤", href: "/?section=library" },
  { key: "images", label: "画像作成", icon: "▧", href: "/images" },
  { key: "tools", label: "機能", icon: "▦", href: "/tools" },
  { key: "sns", label: "SNS", icon: "↗", href: "/sns" },
  { key: "publish", label: "公開管理", icon: "⇧", href: "/publish" },
  { key: "analytics", label: "分析", icon: "▥", href: "/analytics" },
  { key: "ranking", label: "ランキング", icon: "♛", href: "/ranking" },
  { key: "profile", label: "プロフィール", icon: "♙", href: "/profile" },
  { key: "manual", label: "使い方", icon: "?", href: "/manual" },
  { key: "missions", label: "ミッション", icon: "♧", href: "/missions" },
] as const;

export const DEFAULT_DESKTOP_NAV_ITEMS: readonly DesktopNavItemKey[] = [
  "create",
  "library",
  "tools",
  "sns",
  "ranking",
  "profile",
];

export const MAX_DESKTOP_NAV_ITEMS = 8;

const VALID_KEYS = new Set<DesktopNavItemKey>(DESKTOP_NAV_ITEM_OPTIONS.map((item) => item.key));

export function normalizeDesktopNavItems(value: unknown): DesktopNavItemKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_DESKTOP_NAV_ITEMS];
  const next: DesktopNavItemKey[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !VALID_KEYS.has(raw as DesktopNavItemKey)) continue;
    const key = raw as DesktopNavItemKey;
    if (!next.includes(key)) next.push(key);
    if (next.length >= MAX_DESKTOP_NAV_ITEMS) break;
  }
  return next.length ? next : [...DEFAULT_DESKTOP_NAV_ITEMS];
}

export function readDesktopNavItems(): DesktopNavItemKey[] {
  if (typeof window === "undefined") return [...DEFAULT_DESKTOP_NAV_ITEMS];
  const stored = window.localStorage.getItem(DESKTOP_NAV_ITEMS_KEY);
  if (stored === null) return [...DEFAULT_DESKTOP_NAV_ITEMS];
  try {
    return normalizeDesktopNavItems(JSON.parse(stored));
  } catch {
    return [...DEFAULT_DESKTOP_NAV_ITEMS];
  }
}

export function writeDesktopNavItems(value: readonly DesktopNavItemKey[]): DesktopNavItemKey[] {
  const next = normalizeDesktopNavItems([...value]);
  if (typeof window === "undefined") return next;
  window.localStorage.setItem(DESKTOP_NAV_ITEMS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<DesktopNavItemKey[]>(DESKTOP_NAV_ITEMS_EVENT, { detail: next }));
  return next;
}

export function desktopNavItemFor(key: DesktopNavItemKey): DesktopNavItem {
  return DESKTOP_NAV_ITEM_OPTIONS.find((item) => item.key === key) ?? DESKTOP_NAV_ITEM_OPTIONS[0];
}
