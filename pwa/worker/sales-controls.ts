export interface SalesControlEnv {
  AAS_SUPABASE_URL?: string;
  AAS_SUPABASE_PUBLISHABLE_KEY?: string;
  AAS_SUPABASE_SERVICE_ROLE_KEY?: string;
}

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

async function loadSalesSettings(env: SalesControlEnv): Promise<SalesSettings | null> {
  const baseUrl = clean(env.AAS_SUPABASE_URL).replace(/\/$/, "");
  const apiKey = clean(env.AAS_SUPABASE_PUBLISHABLE_KEY) || clean(env.AAS_SUPABASE_SERVICE_ROLE_KEY);
  if (!baseUrl || !apiKey) return null;

  const response = await fetch(
    `${baseUrl}/rest/v1/rpc/get_public_commerce_sales_settings`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        ...(!apiKey.startsWith("sb_publishable_") && !apiKey.startsWith("sb_secret_")
          ? { authorization: `Bearer ${apiKey}` }
          : {}),
        accept: "application/json",
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload) || !payload[0] || typeof payload[0] !== "object") return null;
  const row = payload[0] as Record<string, unknown>;
  return {
    externalSalesEnabled: row.external_sales_enabled === true,
    accessCodeEnabled: row.access_code_enabled === true,
    externalSalesUrl: clean(row.external_sales_url),
    stripeCheckoutEnabled: row.stripe_checkout_enabled === true,
    pwa7DayEnabled: row.pwa_7day_enabled === true,
    pwaMonthlyEnabled: row.pwa_monthly_enabled === true,
  };
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
