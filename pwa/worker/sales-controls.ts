export interface SalesControlEnv {
  AAS_SUPABASE_URL?: string;
  AAS_SUPABASE_PUBLISHABLE_KEY?: string;
  AAS_SUPABASE_SERVICE_ROLE_KEY?: string;
}

const BUILD_SUPABASE_URL = (process.env.NEXT_PUBLIC_AAS_SUPABASE_URL ?? "").trim();
const BUILD_SUPABASE_PUBLISHABLE_KEY = (
  process.env.NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY ?? ""
).trim();

type SalesSettings = {
  externalSalesEnabled: boolean;
  accessCodeEnabled: boolean;
  externalSalesUrl: string;
  stripeCheckoutEnabled: boolean;
  pwa7DayEnabled: boolean;
  pwaMonthlyEnabled: boolean;
};

const PLAN_FLAGS: Record<string, keyof Pick<SalesSettings, "pwa7DayEnabled" | "pwaMonthlyEnabled">> = {
  "AAS-PWA-7DAY": "pwa7DayEnabled",
  "AAS-PWA-MONTHLY": "pwaMonthlyEnabled",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function parseSalesSettingsPayload(payload: unknown): SalesSettings | null {
  const row = Array.isArray(payload) && payload[0] && typeof payload[0] === "object"
    ? payload[0] as Record<string, unknown>
    : payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  if (!row) return null;
  return {
    externalSalesEnabled: row.external_sales_enabled === true,
    accessCodeEnabled: row.access_code_enabled === true,
    externalSalesUrl: clean(row.external_sales_url),
    stripeCheckoutEnabled: row.stripe_checkout_enabled === true,
    pwa7DayEnabled: row.pwa_7day_enabled === true,
    pwaMonthlyEnabled: row.pwa_monthly_enabled === true,
  };
}

async function loadSalesSettingsWithServiceRole(
  baseUrl: string,
  serviceKey: string,
): Promise<SalesSettings | null> {
  if (!baseUrl || !serviceKey) return null;
  const response = await fetch(
    `${baseUrl}/rest/v1/commerce_sales_settings?id=eq.1&select=external_sales_enabled,access_code_enabled,external_sales_url,stripe_checkout_enabled,pwa_7day_enabled,pwa_monthly_enabled&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceKey,
        ...(!serviceKey.startsWith("sb_secret_") ? { authorization: `Bearer ${serviceKey}` } : {}),
        accept: "application/json",
      },
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  return parseSalesSettingsPayload(await response.json().catch(() => null));
}

async function loadSalesSettingsWithPublicRpc(
  baseUrl: string,
  publishableKey: string,
): Promise<SalesSettings | null> {
  if (!baseUrl || !publishableKey) return null;
  const response = await fetch(
    `${baseUrl}/rest/v1/rpc/get_public_commerce_sales_settings`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  return parseSalesSettingsPayload(await response.json().catch(() => null));
}

async function loadSalesSettings(env: SalesControlEnv): Promise<SalesSettings | null> {
  const baseUrl = (clean(env.AAS_SUPABASE_URL) || BUILD_SUPABASE_URL).replace(/\/$/, "");
  const serviceKey = clean(env.AAS_SUPABASE_SERVICE_ROLE_KEY);
  const publishableKey = clean(env.AAS_SUPABASE_PUBLISHABLE_KEY) || BUILD_SUPABASE_PUBLISHABLE_KEY;

  const privileged = await loadSalesSettingsWithServiceRole(baseUrl, serviceKey);
  if (privileged) return privileged;

  return loadSalesSettingsWithPublicRpc(baseUrl, publishableKey);
}

export async function handleSalesControlRequest(
  request: Request,
  env: SalesControlEnv,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/sales/settings" && request.method === "GET") {
    const settings = await loadSalesSettings(env);
    if (!settings) return jsonResponse({ error: "販売受付設定を確認できませんでした。" }, 503);
    return jsonResponse(settings);
  }

  if (url.pathname !== "/api/billing/checkout" || request.method !== "POST") return null;

  const settings = await loadSalesSettings(env);
  if (!settings) return jsonResponse({ error: "販売受付設定を確認できないため、新規決済を停止しています。" }, 503);
  if (!settings.stripeCheckoutEnabled) {
    return jsonResponse({ error: "現在、Stripeでの新規購入受付は停止しています。" }, 503);
  }

  let planCode = "";
  try {
    const payload = await request.clone().json() as Record<string, unknown>;
    planCode = clean(payload.planCode).toUpperCase();
  } catch {
    return null;
  }

  const flag = PLAN_FLAGS[planCode];
  if (flag && !settings[flag]) {
    return jsonResponse({ error: "このプランは現在、新規受付を停止しています。" }, 503);
  }

  return null;
}
