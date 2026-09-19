import type { SupabaseClient } from "@supabase/supabase-js";

import { clearEffectiveRelease } from "@/lib/app-release";

const AUTH_STORAGE_PREFIX = "aas-pwa-auth";

export function clearLocalAuthArtifacts(): void {
  if (typeof window === "undefined") return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(AUTH_STORAGE_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
  window.sessionStorage.removeItem("aas-pwa-google-consent");
}

export async function signOutCurrentBrowser(client: SupabaseClient): Promise<void> {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Account switching must remain possible even when the current auth
    // session is already expired/corrupt or the sign-out request cannot
    // reach Supabase. A full page reload after this helper recreates the
    // client from the now-cleared browser storage.
  } finally {
    clearEffectiveRelease();
    clearLocalAuthArtifacts();
  }
}
