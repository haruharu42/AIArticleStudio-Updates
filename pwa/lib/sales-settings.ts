import type { SupabaseClient } from "@supabase/supabase-js";

import type { CommercePlanCode } from "@/lib/commerce";

export type SalesSettings = {
  externalSalesEnabled: boolean;
  accessCodeEnabled: boolean;
  externalSalesUrl: string;
  stripeCheckoutEnabled: boolean;
  pwa7DayEnabled: boolean;
  pwaMonthlyEnabled: boolean;
  windowsMonthlyEnabled: boolean;
  bundleMonthlyEnabled: boolean;
  updatedAt?: string;
};

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateExternalSalesUrl(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "";
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error("購入ページURLを確認してください。");
  }
  if (parsed.protocol !== "https:") throw new Error("購入ページURLは https:// から始まるURLを設定してください。");
  return parsed.toString();
}

function parseSettings(value: unknown): SalesSettings {
  if (!value || typeof value !== "object") throw new Error("販売受付設定を確認できませんでした。");
  const row = value as Record<string, unknown>;
  return {
    externalSalesEnabled: row.externalSalesEnabled === true || row.external_sales_enabled === true,
    accessCodeEnabled: row.accessCodeEnabled === true || row.access_code_enabled === true,
    externalSalesUrl: optionalText(row.externalSalesUrl ?? row.external_sales_url),
    stripeCheckoutEnabled: row.stripeCheckoutEnabled === true || row.stripe_checkout_enabled === true,
    pwa7DayEnabled: row.pwa7DayEnabled === true || row.pwa_7day_enabled === true,
    pwaMonthlyEnabled: row.pwaMonthlyEnabled === true || row.pwa_monthly_enabled === true,
    windowsMonthlyEnabled: row.windowsMonthlyEnabled === true || row.windows_monthly_enabled === true,
    bundleMonthlyEnabled: row.bundleMonthlyEnabled === true || row.bundle_monthly_enabled === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export function normalizePwaOnlySalesSettings(settings: SalesSettings): SalesSettings {
  return {
    ...settings,
    windowsMonthlyEnabled: false,
    bundleMonthlyEnabled: false,
  };
}

export async function fetchPublicSalesSettings(): Promise<SalesSettings> {
  const response = await fetch("/api/sales/settings", {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("販売受付設定を取得できませんでした。");
  return normalizePwaOnlySalesSettings(parseSettings(await response.json()));
}

export async function loadAdminSalesSettings(client: SupabaseClient): Promise<SalesSettings> {
  const { data, error } = await client.rpc("admin_get_commerce_sales_settings");
  if (error) throw new Error("販売・決済設定を取得できませんでした。");
  const row = Array.isArray(data) ? data[0] : data;
  return normalizePwaOnlySalesSettings(parseSettings(row));
}

export async function updateAdminSalesSettings(client: SupabaseClient, settings: SalesSettings): Promise<void> {
  const normalized = normalizePwaOnlySalesSettings(settings);
  const externalSalesUrl = validateExternalSalesUrl(normalized.externalSalesUrl);
  const { error } = await client.rpc("admin_update_commerce_sales_settings", {
    p_external_sales_enabled: normalized.externalSalesEnabled,
    p_access_code_enabled: normalized.accessCodeEnabled,
    p_external_sales_url: externalSalesUrl || null,
    p_stripe_checkout_enabled: normalized.stripeCheckoutEnabled,
    p_pwa_7day_enabled: normalized.pwa7DayEnabled,
    p_pwa_monthly_enabled: normalized.pwaMonthlyEnabled,
    p_windows_monthly_enabled: false,
    p_bundle_monthly_enabled: false,
  });
  if (error) throw new Error("販売・決済設定を保存できませんでした。");
}

export function planSalesEnabled(settings: SalesSettings | null, planCode: CommercePlanCode): boolean {
  if (!settings?.stripeCheckoutEnabled) return false;
  if (planCode === "AAS-PWA-7DAY") return settings.pwa7DayEnabled;
  if (planCode === "AAS-PWA-MONTHLY") return settings.pwaMonthlyEnabled;
  return false;
}
