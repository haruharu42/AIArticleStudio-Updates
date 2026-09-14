import { getSupabaseClient } from "@/lib/supabase";

type ClientErrorInput = {
  errorCode: string;
  message: string;
  feature?: string;
  route?: string;
  requestId?: string;
};

const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]+/gi,
  /sk_(?:live|test)_[A-Za-z0-9_-]+/gi,
  /whsec_[A-Za-z0-9_-]+/gi,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];

function safeText(value: unknown, max = 500): string {
  let text = value instanceof Error ? value.message : typeof value === "string" ? value : String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function safeCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_.:-]{1,80}$/.test(normalized) ? normalized : "CLIENT_ERROR";
}

function safeRoute(value?: string): string | null {
  const route = value || (typeof window !== "undefined" ? window.location.pathname : "");
  return route ? route.split("?", 1)[0].slice(0, 160) : null;
}

export async function reportClientError(input: ClientErrorInput): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    await client.rpc("record_client_error", {
      p_error_code: safeCode(input.errorCode),
      p_message: safeText(input.message || "Unexpected client error", 700),
      p_feature: input.feature ? safeText(input.feature, 80) : null,
      p_route: safeRoute(input.route),
      p_request_id: input.requestId ? safeText(input.requestId, 120) : null,
    });
  } catch {
    // Logging must never interrupt the product flow or recursively report itself.
  }
}

export function errorMessage(value: unknown): string {
  if (value instanceof Error) return safeText(value.message || value.name || "Error", 500);
  if (typeof value === "string") return safeText(value, 500);
  return "Unexpected client error";
}
