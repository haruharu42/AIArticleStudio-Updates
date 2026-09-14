import type { SupabaseClient } from "@supabase/supabase-js";

import type { CommercePlanCode } from "@/lib/commerce";

export type SalesSettings = {
  externalSalesEnabled: boolean;
  accessCodeEnabled: boolean;
  stripeCheckoutEnabled: boolean;
  pwa7DayEnabled: boolean;
  pwaMonthlyEnabled: boolean;
  windowsMonthlyEnabled: boolean;
  bundleMonthlyEnabled: boolean;
  updatedAt?: string;
};

function parseSettings(value: unknown): SalesSettings {
  if (!value || typeof value !== "object") throw new Error("販売受付設定を確認できませんでした。");
  const row = value as Record<string, unknown>;
  return {
    externalSalesEnabled: row.externalSalesEnabled === true || row.external_sales_enabled === true,
    accessCodeEnabled: row.accessCodeEnabled === true || row.access_code_enabled === true,
    stripeCheckoutEnabled: row.stripeCheckoutEnabled === true || row.stripe_checkout_enabled === true,
    pwa7DayEnabled: row.pwa7DayEnabled === true || row.pwa_7day_enabled === true,
    pwaMonthlyEnabled: row.pwaMonthlyEnabled === true || row.pwa_monthly_enabled === true,
    windowsMonthlyEnabled: row.windowsMonthlyEnabled === true || row.windows_monthly_enabled === true,
    bundleMonthlyEnabled: row.bundleMonthlyEnabled === true || row.bundle_monthly_enabled === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export async function fetchPublicSalesSettings(): Promise<SalesSettings> {
  const response = await fetch("/api/sales/settings", {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("販売受付設定を取得できませんでした。");
  return parseSettings(await response.json());
}

export async function loadAdminSalesSettings(client: SupabaseClient): Promise<SalesSettings> {
  const { data, error } = await client.rpc("admin_get_commerce_sales_settings");
  if (error) throw new Error("販売・決済設定を取得できませんでした。");
  const row = Array.isArray(data) ? data[0] : data;
  return parseSettings(row);
}

export async function updateAdminSalesSettings(client: SupabaseClient, settings: SalesSettings): Promise<void> {
  const { error } = await client.rpc("admin_update_commerce_sales_settings", {
    p_external_sales_enabled: settings.externalSalesEnabled,
    p_access_code_enabled: settings.accessCodeEnabled,
    p_stripe_checkout_enabled: settings.stripeCheckoutEnabled,
    p_pwa_7day_enabled: settings.pwa7DayEnabled,
    p_pwa_monthly_enabled: settings.pwaMonthlyEnabled,
    p_windows_monthly_enabled: settings.windowsMonthlyEnabled,
    p_bundle_monthly_enabled: settings.bundleMonthlyEnabled,
  });
  if (error) throw new Error("販売・決済設定を保存できませんでした。");
}

export function planSalesEnabled(settings: SalesSettings | null, planCode: CommercePlanCode): boolean {
  if (!settings?.stripeCheckoutEnabled) return false;
  if (planCode === "AAS-PWA-7DAY") return settings.pwa7DayEnabled;
  if (planCode === "AAS-PWA-MONTHLY") return settings.pwaMonthlyEnabled;
  if (planCode === "AAS-WIN-MONTHLY") return settings.windowsMonthlyEnabled;
  if (planCode === "AAS-BUNDLE-MONTHLY") return settings.bundleMonthlyEnabled;
  return false;
}
