import type { SupabaseClient } from "@supabase/supabase-js";

export const APP_RELEASE_EFFECTIVE_KEY = "aas-pwa-effective-release";
export const APP_RELEASE_STATE_EVENT = "aas-pwa-release-state";

export type AppRelease = {
  id: string;
  version: string;
  title: string;
  notes: string;
  build_key: string;
  update_kind: "optional" | "required";
};

export type AppReleaseState = {
  signed_in: boolean;
  active?: boolean;
  configured?: boolean;
  is_admin?: boolean;
  is_admin_preview?: boolean;
  current_release?: AppRelease | null;
  effective_release?: AppRelease | null;
  available_release?: AppRelease | null;
  update_required?: boolean;
};

export type AdminAppRelease = AppRelease & {
  status: "candidate" | "published" | "retired" | "rolled_back";
  created_at: string;
  published_at: string | null;
  retired_at: string | null;
  adopted_users: number;
};

export type AdminReleaseSnapshot = {
  channel: {
    current_release_id: string | null;
    candidate_release_id: string | null;
    updated_at: string | null;
  };
  releases: AdminAppRelease[];
};

function isRelease(value: unknown): value is AppRelease {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.version === "string" &&
    typeof row.title === "string" &&
    typeof row.notes === "string" &&
    typeof row.build_key === "string" &&
    (row.update_kind === "optional" || row.update_kind === "required")
  );
}

function normalizeState(value: unknown): AppReleaseState {
  if (!value || typeof value !== "object") return { signed_in: false };
  const row = value as Record<string, unknown>;
  return {
    signed_in: row.signed_in === true,
    active: row.active === true,
    configured: row.configured === true,
    is_admin: row.is_admin === true,
    is_admin_preview: row.is_admin_preview === true,
    current_release: isRelease(row.current_release) ? row.current_release : null,
    effective_release: isRelease(row.effective_release) ? row.effective_release : null,
    available_release: isRelease(row.available_release) ? row.available_release : null,
    update_required: row.update_required === true,
  };
}

function normalizeAdminSnapshot(value: unknown): AdminReleaseSnapshot {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawChannel = row.channel && typeof row.channel === "object" ? (row.channel as Record<string, unknown>) : {};
  const rawReleases = Array.isArray(row.releases) ? row.releases : [];
  const releases: AdminAppRelease[] = rawReleases.flatMap((item) => {
    if (!isRelease(item) || typeof item !== "object") return [];
    const release = item as Record<string, unknown>;
    const status = release.status;
    if (!["candidate", "published", "retired", "rolled_back"].includes(String(status))) return [];
    return [{
      ...item,
      status: status as AdminAppRelease["status"],
      created_at: typeof release.created_at === "string" ? release.created_at : "",
      published_at: typeof release.published_at === "string" ? release.published_at : null,
      retired_at: typeof release.retired_at === "string" ? release.retired_at : null,
      adopted_users: typeof release.adopted_users === "number" ? release.adopted_users : Number(release.adopted_users ?? 0),
    }];
  });

  return {
    channel: {
      current_release_id: typeof rawChannel.current_release_id === "string" ? rawChannel.current_release_id : null,
      candidate_release_id: typeof rawChannel.candidate_release_id === "string" ? rawChannel.candidate_release_id : null,
      updated_at: typeof rawChannel.updated_at === "string" ? rawChannel.updated_at : null,
    },
    releases,
  };
}

export function persistEffectiveRelease(state: AppReleaseState): void {
  if (typeof window === "undefined") return;
  const release = state.effective_release ?? state.current_release ?? null;
  if (release) {
    window.localStorage.setItem(APP_RELEASE_EFFECTIVE_KEY, JSON.stringify(release));
  } else {
    window.localStorage.removeItem(APP_RELEASE_EFFECTIVE_KEY);
  }
  window.dispatchEvent(new CustomEvent<AppReleaseState>(APP_RELEASE_STATE_EVENT, { detail: state }));
}

export function readEffectiveRelease(): AppRelease | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(APP_RELEASE_EFFECTIVE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return isRelease(value) ? value : null;
  } catch {
    return null;
  }
}

export async function loadMyAppReleaseState(client: SupabaseClient): Promise<AppReleaseState> {
  const { data, error } = await client.rpc("get_my_app_release_state");
  if (error) throw error;
  const state = normalizeState(data);
  persistEffectiveRelease(state);
  return state;
}

export async function acceptAppRelease(client: SupabaseClient, releaseId: string): Promise<AppReleaseState> {
  const { data, error } = await client.rpc("accept_app_release", { p_release_id: releaseId });
  if (error) throw error;
  const state = normalizeState(data);
  persistEffectiveRelease(state);
  return state;
}

export async function adminListAppReleases(client: SupabaseClient): Promise<AdminReleaseSnapshot> {
  const { data, error } = await client.rpc("admin_list_app_releases");
  if (error) throw error;
  return normalizeAdminSnapshot(data);
}

export async function adminCreateAppRelease(
  client: SupabaseClient,
  input: { version: string; title: string; notes: string; updateKind: "optional" | "required"; buildKey: string },
): Promise<AdminReleaseSnapshot> {
  const { data, error } = await client.rpc("admin_create_app_release", {
    p_version: input.version,
    p_title: input.title,
    p_notes: input.notes,
    p_update_kind: input.updateKind,
    p_build_key: input.buildKey,
  });
  if (error) throw error;
  return normalizeAdminSnapshot(data);
}

export async function adminPublishAppRelease(client: SupabaseClient, releaseId: string): Promise<AdminReleaseSnapshot> {
  const { data, error } = await client.rpc("admin_publish_app_release", { p_release_id: releaseId });
  if (error) throw error;
  return normalizeAdminSnapshot(data);
}

export async function adminRollbackAppRelease(client: SupabaseClient, targetReleaseId: string): Promise<AdminReleaseSnapshot> {
  const { data, error } = await client.rpc("admin_rollback_app_release", { p_target_release_id: targetReleaseId });
  if (error) throw error;
  return normalizeAdminSnapshot(data);
}
