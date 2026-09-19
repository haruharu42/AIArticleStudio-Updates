"use client";

import { useEffect } from "react";

import { clearEffectiveRelease } from "@/lib/app-release";
import { clearLocalAuthArtifacts, signOutCurrentBrowser } from "@/lib/auth-session";
import { getSupabaseClient } from "@/lib/supabase";

export default function LogoutPage() {
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await signOutCurrentBrowser(getSupabaseClient());
      } catch {
        clearEffectiveRelease();
        clearLocalAuthArtifacts();
      } finally {
        if (active) window.location.replace("/");
      }
    };
    void run();
    return () => { active = false; };
  }, []);

  return (
    <main className="standalone-page">
      <section className="standalone-card">
        <p className="eyebrow">ACCOUNT SWITCH</p>
        <h1>ログアウトしています</h1>
        <p className="route-notice">この端末のAASログイン情報を消去して、ログイン画面へ戻ります。</p>
      </section>
    </main>
  );
}
