import type { SupabaseClient } from "@supabase/supabase-js";

import { clearEffectiveRelease } from "@/lib/app-release";

export async function signOutCurrentBrowser(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "local" });
  clearEffectiveRelease();
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem("aas-pwa-google-consent");
  }
  if (error) throw error;
}
