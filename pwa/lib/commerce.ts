import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export type CommercePlanCode =
  | "AAS-PWA-7DAY"
  | "AAS-PWA-MONTHLY"
  | "AAS-WIN-MONTHLY"
  | "AAS-BUNDLE-MONTHLY";

export type CommercePurchaseType = "one_time" | "subscription";
export type CommercePlatformScope = "pwa" | "windows" | "bundle";

export type PublicCommercePrice = {
  currency: string;
  unitAmount: number;
  interval: string | null;
  intervalCount: number | null;
};

export type PublicCommercePlan = {
  planCode: CommercePlanCode;
  purchaseType: CommercePurchaseType;
  platformScope: CommercePlatformScope;
  available: boolean;
  price: PublicCommercePrice | null;
};

export type PublicCommerceConfig = {
  mode: "off" | "test" | "live";
  commerceReady: boolean;
  legalReady: boolean;
  seller: {
    name: string;
    address: string;
    phone: string;
    email: string;
    supportUrl: string;
  };
  plans: PublicCommercePlan[];
};

export type BillingSubscription = {
  id: string;
  planCode: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  endedAt: string | null;
  livemode: boolean;
  updatedAt: string;
};

export type MyBillingState = {
  subscriptions: BillingSubscription[];
  pwaAccess: boolean;
  windowsAccess: boolean;
};

export const COMMERCE_PLAN_COPY: Record<
  CommercePlanCode,
  { name: string; description: string; badge: string }
> = {
  "AAS-PWA-7DAY": {
    name: "PWA 7日利用パス",
    description: "PWA版を7日間利用できる、自動更新なしの短期利用パスです。",
    badge: "まず試す",
  },
  "AAS-PWA-MONTHLY": {
    name: "PWA 月額プラン",
    description: "スマホ・PCブラウザからPWA版を継続利用する1か月ごとの自動更新プランです。",
    badge: "PWAのみ",
  },
  "AAS-WIN-MONTHLY": {
    name: "Windows 月額プラン",
    description: "Windows版を継続利用する1か月ごとの自動更新プランです。",
    badge: "Windowsのみ",
  },
  "AAS-BUNDLE-MONTHLY": {
    name: "PWA + Windows 月額プラン",
    description: "PWA版とWindows版の両方を利用する1か月ごとの自動更新セットプランです。",
    badge: "両方使う",
  },
};

function isPlanCode(value: unknown): value is CommercePlanCode {
  return (
    value === "AAS-PWA-7DAY" ||
    value === "AAS-PWA-MONTHLY" ||
    value === "AAS-WIN-MONTHLY" ||
    value === "AAS-BUNDLE-MONTHLY"
  );
}

function parsePublicConfig(value: unknown): PublicCommerceConfig {
  if (!value || typeof value !== "object") throw new Error("販売設定を確認できませんでした。");
  const row = value as Record<string, unknown>;
  const mode = row.mode === "test" || row.mode === "live" ? row.mode : "off";
  const sellerRow = row.seller && typeof row.seller === "object"
    ? (row.seller as Record<string, unknown>)
    : {};
  const plans = Array.isArray(row.plans)
    ? row.plans.flatMap((item): PublicCommercePlan[] => {
        if (!item || typeof item !== "object") return [];
        const plan = item as Record<string, unknown>;
        if (!isPlanCode(plan.planCode)) return [];
        const purchaseType = plan.purchaseType === "subscription" ? "subscription" : "one_time";
        const platformScope =
          plan.platformScope === "windows" || plan.platformScope === "bundle"
            ? plan.platformScope
            : "pwa";
        let price: PublicCommercePrice | null = null;
        if (plan.price && typeof plan.price === "object") {
          const priceRow = plan.price as Record<string, unknown>;
          if (
            typeof priceRow.currency === "string" &&
            typeof priceRow.unitAmount === "number"
          ) {
            price = {
              currency: priceRow.currency,
              unitAmount: priceRow.unitAmount,
              interval: typeof priceRow.interval === "string" ? priceRow.interval : null,
              intervalCount:
                typeof priceRow.intervalCount === "number" ? priceRow.intervalCount : null,
            };
          }
        }
        return [{
          planCode: plan.planCode,
          purchaseType,
          platformScope,
          available: plan.available === true,
          price,
        }];
      })
    : [];

  return {
    mode,
    commerceReady: row.commerceReady === true,
    legalReady: row.legalReady === true,
    seller: {
      name: typeof sellerRow.name === "string" ? sellerRow.name : "",
      address: typeof sellerRow.address === "string" ? sellerRow.address : "",
      phone: typeof sellerRow.phone === "string" ? sellerRow.phone : "",
      email: typeof sellerRow.email === "string" ? sellerRow.email : "",
      supportUrl: typeof sellerRow.supportUrl === "string" ? sellerRow.supportUrl : "",
    },
    plans,
  };
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

async function accessToken(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  const token = data.session?.access_token ?? "";
  if (error || !token) throw new Error("購入・契約管理にはログインが必要です。");
  return token;
}

export async function fetchCommerceConfig(): Promise<PublicCommerceConfig> {
  const response = await fetch("/api/billing/config", {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "販売設定を取得できませんでした。"));
  return parsePublicConfig(await response.json());
}

async function authenticatedBillingRequest(
  path: "/api/billing/checkout" | "/api/billing/portal",
  payload?: Record<string, unknown>,
): Promise<string> {
  const token = await accessToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "決済サービスへ接続できませんでした。"));
  }
  const result = (await response.json()) as { url?: unknown };
  if (typeof result.url !== "string" || !/^https:\/\//i.test(result.url)) {
    throw new Error("決済先URLを確認できませんでした。");
  }
  return result.url;
}

export function beginCheckout(planCode: CommercePlanCode): Promise<string> {
  return authenticatedBillingRequest("/api/billing/checkout", { planCode });
}

export function openBillingPortal(): Promise<string> {
  return authenticatedBillingRequest("/api/billing/portal");
}

export function formatCommercePrice(price: PublicCommercePrice | null): string {
  if (!price) return "価格設定準備中";
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      maximumFractionDigits: price.currency.toLowerCase() === "jpy" ? 0 : 2,
    }).format(price.unitAmount / 100);
  } catch {
    return `${price.unitAmount / 100} ${price.currency.toUpperCase()}`;
  }
}

export function renewalLabel(plan: PublicCommercePlan): string {
  if (plan.purchaseType === "one_time") return "7日間・自動更新なし";
  const interval = plan.price?.interval;
  const count = plan.price?.intervalCount ?? 1;
  if (interval === "month" && count === 1) return "1か月ごとの自動更新";
  if (interval === "year" && count === 1) return "1年ごとの自動更新";
  return "定期契約・自動更新";
}

function parseSubscription(value: unknown): BillingSubscription | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.plan_code !== "string" ||
    typeof row.status !== "string"
  ) return null;
  return {
    id: row.id,
    planCode: row.plan_code,
    status: row.status,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    currentPeriodStart: typeof row.current_period_start === "string" ? row.current_period_start : null,
    currentPeriodEnd: typeof row.current_period_end === "string" ? row.current_period_end : null,
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    livemode: row.livemode === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export async function loadMyBillingState(client: SupabaseClient): Promise<MyBillingState> {
  const [subscriptionsResult, pwaAccessResult, windowsAccessResult] = await Promise.all([
    client
      .from("billing_subscriptions")
      .select("id,plan_code,status,cancel_at_period_end,current_period_start,current_period_end,ended_at,livemode,updated_at")
      .order("updated_at", { ascending: false }),
    client.rpc("can_access_product", { p_product_code: "AAS-PWA-BETA" }),
    client.rpc("can_access_product", { p_product_code: "AAS-WIN-BETA" }),
  ]);

  if (subscriptionsResult.error) throw new Error("契約情報を取得できませんでした。");
  if (pwaAccessResult.error || windowsAccessResult.error) throw new Error("利用権を確認できませんでした。");

  return {
    subscriptions: (subscriptionsResult.data ?? [])
      .map(parseSubscription)
      .filter((item): item is BillingSubscription => item !== null),
    pwaAccess: pwaAccessResult.data === true,
    windowsAccess: windowsAccessResult.data === true,
  };
}
