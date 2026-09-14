export interface OpsEnv {
  AAS_SUPABASE_URL?: string;
  AAS_SUPABASE_SERVICE_ROLE_KEY?: string;
}

type SystemEventInput = {
  eventKind: "error" | "security" | "warning" | "health";
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  errorCode: string;
  message: string;
  feature?: string;
  route?: string;
  requestId?: string;
};

function clean(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

export async function recordSystemEvent(env: OpsEnv, input: SystemEventInput): Promise<void> {
  try {
    const baseUrl = clean(env.AAS_SUPABASE_URL, 300).replace(/\/$/, "");
    const serviceKey = clean(env.AAS_SUPABASE_SERVICE_ROLE_KEY, 1000);
    if (!baseUrl || !serviceKey) return;

    const response = await fetch(`${baseUrl}/rest/v1/rpc/ops_record_system_event`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_event_kind: input.eventKind,
        p_severity: input.severity,
        p_source: clean(input.source, 60),
        p_error_code: clean(input.errorCode, 80),
        p_message: clean(input.message, 700),
        p_feature: input.feature ? clean(input.feature, 80) : null,
        p_route: input.route ? clean(input.route.split("?", 1)[0], 160) : null,
        p_request_id: input.requestId ? clean(input.requestId, 120) : null,
      }),
    });
    if (!response.ok) return;
  } catch {
    // Observability is best-effort and must never break the request path.
  }
}

export function safeOpsHealthResponse(): Response {
  return new Response(JSON.stringify({
    ok: true,
    service: "aas-pwa",
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
