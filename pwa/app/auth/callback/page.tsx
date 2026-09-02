"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { authMessage } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("ログインを完了しています…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const finish = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const oauthError = query.get("error_description") || query.get("error");
        if (oauthError) throw new Error(oauthError);

        const code = query.get("code");
        if (!code) throw new Error("認証コードが見つかりません。");

        const client = getSupabaseClient();
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;

        const googleConsent =
          sessionStorage.getItem("aas-pwa-google-consent") === "accepted";
        sessionStorage.removeItem("aas-pwa-google-consent");

        if (googleConsent) {
          const {
            data: { user },
            error: userError,
          } = await client.auth.getUser();
          if (userError || !user) throw userError ?? new Error("認証ユーザーを確認できません。");

          const { data: profile, error: profileError } = await client
            .from("profiles")
            .select("status")
            .eq("id", user.id)
            .single();
          if (profileError) throw profileError;

          if (profile?.status === "pending" || profile?.status === "active") {
            const { error: termsError } = await client.rpc("accept_current_terms");
            if (termsError) throw termsError;
          }
        }

        const recovery = query.get("mode") === "recovery";
        window.location.replace(recovery ? "/?mode=recovery" : "/?auth=complete");
      } catch (error) {
        sessionStorage.removeItem("aas-pwa-google-consent");
        if (!active) return;
        setFailed(true);
        setMessage(authMessage(error));
      }
    };

    void finish();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="callback-page" role="status" aria-live="polite">
      <div className="callback-card">
        <span className="brand-mark" aria-hidden="true">✦</span>
        {!failed && <span className="spinner" aria-hidden="true" />}
        <h1>{failed ? "認証を完了できませんでした" : "AI記事スタジオ"}</h1>
        <p>{message}</p>
        {failed && <Link className="primary-action" href="/">ログインへ戻る</Link>}
      </div>
    </main>
  );
}
