import type { NextConfig } from "next";

const publicKey =
  process.env.NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY ??
  process.env.AAS_SUPABASE_PUBLISHABLE_KEY ??
  process.env.AAS_SUPABASE_ANON_KEY ??
  "";

if (/^sb_secret_/i.test(publicKey) || /service[_-]?role/i.test(publicKey)) {
  throw new Error(
    "Refusing to expose a Supabase secret/service-role key to the PWA.",
  );
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AAS_SUPABASE_URL:
      process.env.NEXT_PUBLIC_AAS_SUPABASE_URL ??
      process.env.AAS_SUPABASE_URL ??
      "",
    NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY: publicKey,
    NEXT_PUBLIC_AAS_TERMS_URL:
      process.env.NEXT_PUBLIC_AAS_TERMS_URL ??
      process.env.AAS_TERMS_URL ??
      "",
    NEXT_PUBLIC_AAS_PRIVACY_URL:
      process.env.NEXT_PUBLIC_AAS_PRIVACY_URL ??
      process.env.AAS_PRIVACY_URL ??
      "",
    NEXT_PUBLIC_AAS_AI_TERMS_URL:
      process.env.NEXT_PUBLIC_AAS_AI_TERMS_URL ??
      process.env.AAS_AI_TERMS_URL ??
      "",
  },
  poweredByHeader: false,
};

export default nextConfig;
