"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type GateState = AccessState | { kind: "loading" } | { kind: "unavailable" };

export function Phase15MemberGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const next = await loadAccessState(getSupabaseClient());
        if (active) setState(next);
      } catch {
        if (active) setState({ kind: "unavailable" });
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  if (state.kind === "ready") return <>{children}</>;

  const canRegisterInvite =
    state.kind === "pending" || state.kind === "entitlement_denied";

  let message = "PWA利用状態を確認しています…";
  if (state.kind === "signed_out") {
    message = "この機能を利用するにはログインしてください。";
  } else if (state.kind === "pending") {
    message = "アカウント承認後にこの機能を利用できます。";
  } else if (state.kind === "entitlement_denied") {
    message = "この機能を利用するにはPWA利用権が必要です。";
  } else if (state.kind === "suspended" || state.kind === "disabled") {
    message = "現在のアカウント状態ではこの機能を利用できません。";
  } else if (state.kind === "unavailable") {
    message = "アカウントとPWA利用権を確認できませんでした。";
  }

  return (
    <main className="standalone-page">
      <section className="standalone-card">
        <p className="eyebrow">AI ARTICLE STUDIO · MEMBER TOOL</p>
        <h1>利用権を確認</h1>
        <div className={state.kind === "loading" ? "route-notice" : "route-notice error"}>
          {message}
        </div>
        {canRegisterInvite && (
          <a className="route-back" href="/invite">PWA招待コードを登録 →</a>
        )}
        <br />
        <a className="route-back" href="/">← ホームへ戻る</a>
      </section>
    </main>
  );
}
