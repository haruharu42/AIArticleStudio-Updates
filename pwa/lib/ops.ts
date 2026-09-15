import { getSupabaseClient } from "@/lib/supabase";

type ClientErrorInput = {
  errorCode: string;
  message: string;
  feature?: string;
  route?: string;
  requestId?: string;
};

type WindowErrorLike = {
  error?: unknown;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

export type WindowErrorDiagnostic = {
  errorCode: "WINDOW_ERROR" | "WINDOW_SCRIPT_ERROR_OPAQUE";
  message: string;
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

function safeScriptSource(value?: string): string {
  const raw = safeText(value ?? "", 240);
  if (!raw) return "";

  try {
    const base = typeof window !== "undefined" ? window.location.href : "https://aas.invalid/";
    const url = new URL(raw, base);
    const sameOrigin = typeof window !== "undefined" && url.origin === window.location.origin;
    const source = sameOrigin ? url.pathname : `${url.host}${url.pathname}`;
    return safeText(source || "/", 180);
  } catch {
    return safeText(raw.split(/[?#]/, 1)[0], 180);
  }
}

export function windowErrorDiagnostic(event: WindowErrorLike): WindowErrorDiagnostic {
  const baseMessage = errorMessage(event.error ?? event.message ?? "Unexpected client error");
  const source = safeScriptSource(event.filename);
  const line = Number.isFinite(event.lineno) && Number(event.lineno) > 0 ? Number(event.lineno) : 0;
  const column = Number.isFinite(event.colno) && Number(event.colno) > 0 ? Number(event.colno) : 0;
  const opaque = baseMessage === "Script error." && !event.error && !source && line === 0 && column === 0;

  if (opaque) {
    return {
      errorCode: "WINDOW_SCRIPT_ERROR_OPAQUE",
      message: "Script error. | browser-withheld-source-details",
    };
  }

  const details: string[] = [];
  if (source) details.push(`source=${source}`);
  if (line > 0) details.push(`line=${line}`);
  if (column > 0) details.push(`column=${column}`);

  return {
    errorCode: "WINDOW_ERROR",
    message: safeText(details.length > 0 ? `${baseMessage} | ${details.join(" ")}` : baseMessage, 700),
  };
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
