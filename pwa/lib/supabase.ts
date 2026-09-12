import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_AAS_SUPABASE_URL ?? "").trim();
const publishableKey = (
  process.env.NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY ?? ""
).trim();

let singleton: SupabaseClient | null = null;

export class PublicConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicConfigurationError";
  }
}

function validatePublicConfiguration(): void {
  if (!url || !publishableKey) {
    throw new PublicConfigurationError(
      "PWA用Supabase公開設定が未構成です。",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PublicConfigurationError("Supabase URLの形式が不正です。");
  }

  const localHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new PublicConfigurationError(
      "Supabase URLにはHTTPSが必要です。",
    );
  }

  if (
    /^sb_secret_/i.test(publishableKey) ||
    /service[_-]?role/i.test(publishableKey)
  ) {
    throw new PublicConfigurationError(
      "秘密鍵はPWAへ設定できません。publishable keyを使用してください。",
    );
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;

  validatePublicConfiguration();
  singleton = createClient(url, publishableKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "aas-pwa-auth",
    },
  });
  return singleton;
}

export const publicLinks = {
  terms: (process.env.NEXT_PUBLIC_AAS_TERMS_URL ?? "/terms").trim(),
  privacy: (process.env.NEXT_PUBLIC_AAS_PRIVACY_URL ?? "/privacy").trim(),
  aiTerms: (process.env.NEXT_PUBLIC_AAS_AI_TERMS_URL ?? "/ai-terms").trim(),
};
