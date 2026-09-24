import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeWidgetDevice = "desktop" | "mobile";
export type HomeWidgetSize = "wide" | "half";
export type HomeWidgetKey =
  | "creator"
  | "todayNote"
  | "missions"
  | "membership"
  | "library"
  | "releaseStatus"
  | "hero"
  | "quickStart"
  | "articleSetup"
  | "aiApps"
  | "ranking"
  | "quickActions";

export type HomeWidgetLayoutItem = {
  key: HomeWidgetKey;
  visible: boolean;
  size: HomeWidgetSize;
};

export type HomeWidgetPreferences = {
  desktop: HomeWidgetLayoutItem[];
  mobile: HomeWidgetLayoutItem[];
};

export type HomeWidgetDefinition = {
  key: HomeWidgetKey;
  label: string;
  description: string;
  icon: string;
  allowHalf: boolean;
};

export const HOME_WIDGET_PREFERENCE_EVENT = "aas-home-widget-preference";
const HOME_WIDGET_STORAGE_KEY = "aas-home-widget-layout";

export const HOME_WIDGET_DEFINITIONS: readonly HomeWidgetDefinition[] = [
  { key: "creator", label: "Creatorステータス", description: "レベル・XP・連続利用日数", icon: "♛", allowHalf: false },
  { key: "todayNote", label: "今日のnote", description: "今日の運営状況と次のアクション", icon: "✦", allowHalf: true },
  { key: "missions", label: "今日のミッション", description: "毎日のミッションと獲得XP", icon: "🎯", allowHalf: true },
  { key: "membership", label: "メンバー特典", description: "Creator Level・メンバーシップ特典", icon: "◇", allowHalf: true },
  { key: "library", label: "記事ライブラリ", description: "最近の記事・noteマガジン", icon: "▤", allowHalf: false },
  { key: "releaseStatus", label: "AAS更新状態", description: "利用中バージョン・更新案内", icon: "↻", allowHalf: true },
  { key: "hero", label: "アクシア × ルーモ", description: "主要機能とAASホームヒーロー", icon: "✦", allowHalf: false },
  { key: "quickStart", label: "クイックスタート", description: "記事作成までの3ステップ", icon: "⚡", allowHalf: true },
  { key: "articleSetup", label: "記事の基本設定", description: "掲載先・ジャンル・文字数など", icon: "⚙", allowHalf: false },
  { key: "aiApps", label: "AIアプリを開く", description: "ChatGPT・Claude・Gemini", icon: "◎", allowHalf: true },
  { key: "ranking", label: "週間ランキング", description: "Creatorランキングと公開設定", icon: "🏆", allowHalf: true },
  { key: "quickActions", label: "よく使う機能", description: "SNS・運営・副業機能へのショートカット", icon: "▦", allowHalf: true },
] as const;

const VALID_KEYS = new Set<HomeWidgetKey>(HOME_WIDGET_DEFINITIONS.map((item) => item.key));
const HALF_ALLOWED = new Set<HomeWidgetKey>(
  HOME_WIDGET_DEFINITIONS.filter((item) => item.allowHalf).map((item) => item.key),
);

export const DEFAULT_HOME_WIDGET_LAYOUT: readonly HomeWidgetLayoutItem[] = HOME_WIDGET_DEFINITIONS.map((item) => ({
  key: item.key,
  visible: true,
  size: "wide" as HomeWidgetSize,
}));

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeHomeWidgetLayout(value: unknown, device: HomeWidgetDevice): HomeWidgetLayoutItem[] {
  const next: HomeWidgetLayoutItem[] = [];
  if (Array.isArray(value)) {
    for (const raw of value) {
      const row = asRecord(raw);
      if (typeof row.key !== "string" || !VALID_KEYS.has(row.key as HomeWidgetKey)) continue;
      const key = row.key as HomeWidgetKey;
      if (next.some((item) => item.key === key)) continue;
      const requestedSize = row.size === "half" ? "half" : "wide";
      next.push({
        key,
        visible: row.visible !== false,
        size: device === "desktop" && requestedSize === "half" && HALF_ALLOWED.has(key) ? "half" : "wide",
      });
    }
  }

  for (const fallback of DEFAULT_HOME_WIDGET_LAYOUT) {
    if (!next.some((item) => item.key === fallback.key)) next.push({ ...fallback });
  }
  return next;
}

export function defaultHomeWidgetPreferences(): HomeWidgetPreferences {
  return {
    desktop: normalizeHomeWidgetLayout(DEFAULT_HOME_WIDGET_LAYOUT, "desktop"),
    mobile: normalizeHomeWidgetLayout(DEFAULT_HOME_WIDGET_LAYOUT, "mobile"),
  };
}

function storageKey(userId: string, device: HomeWidgetDevice): string {
  return `${HOME_WIDGET_STORAGE_KEY}:${userId.trim() || "guest"}:${device}`;
}

export function readLocalHomeWidgetLayout(userId: string, device: HomeWidgetDevice): HomeWidgetLayoutItem[] {
  if (typeof window === "undefined") return normalizeHomeWidgetLayout(DEFAULT_HOME_WIDGET_LAYOUT, device);
  const stored = window.localStorage.getItem(storageKey(userId, device));
  if (!stored) return normalizeHomeWidgetLayout(DEFAULT_HOME_WIDGET_LAYOUT, device);
  try {
    return normalizeHomeWidgetLayout(JSON.parse(stored), device);
  } catch {
    return normalizeHomeWidgetLayout(DEFAULT_HOME_WIDGET_LAYOUT, device);
  }
}

export function writeLocalHomeWidgetLayout(
  userId: string,
  device: HomeWidgetDevice,
  layout: readonly HomeWidgetLayoutItem[],
): HomeWidgetLayoutItem[] {
  const normalized = normalizeHomeWidgetLayout([...layout], device);
  if (typeof window === "undefined") return normalized;
  window.localStorage.setItem(storageKey(userId, device), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(HOME_WIDGET_PREFERENCE_EVENT, {
    detail: { userId, device, layout: normalized },
  }));
  return normalized;
}

function parseCloudPreferences(row: unknown): HomeWidgetPreferences {
  const data = asRecord(row);
  return {
    desktop: normalizeHomeWidgetLayout(data.desktop_layout, "desktop"),
    mobile: normalizeHomeWidgetLayout(data.mobile_layout, "mobile"),
  };
}

export async function loadHomeWidgetPreferences(
  client: SupabaseClient,
  userId: string,
): Promise<HomeWidgetPreferences> {
  const { data, error } = await client
    .from("user_home_widget_preferences")
    .select("user_id,desktop_layout,mobile_layout,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("ホームのウィジェット設定を取得できませんでした。");
  return data ? parseCloudPreferences(data) : defaultHomeWidgetPreferences();
}

export async function saveHomeWidgetPreferences(
  client: SupabaseClient,
  userId: string,
  preferences: HomeWidgetPreferences,
): Promise<HomeWidgetPreferences> {
  const desktop = normalizeHomeWidgetLayout(preferences.desktop, "desktop");
  const mobile = normalizeHomeWidgetLayout(preferences.mobile, "mobile");
  const { data, error } = await client
    .from("user_home_widget_preferences")
    .upsert({
      user_id: userId,
      desktop_layout: desktop,
      mobile_layout: mobile,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("user_id,desktop_layout,mobile_layout,updated_at")
    .single();

  if (error || !data) throw new Error("ホームのウィジェット設定を保存できませんでした。");
  const saved = parseCloudPreferences(data);
  writeLocalHomeWidgetLayout(userId, "desktop", saved.desktop);
  writeLocalHomeWidgetLayout(userId, "mobile", saved.mobile);
  return saved;
}
