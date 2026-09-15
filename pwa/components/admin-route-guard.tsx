"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const verify = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) {
          setGate({ kind: "signed_out" });
          return;
        }

        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("id,role,status")
          .eq("id", user.id)
          .single();
        if (!active) return;
        if (profileError || !profile || profile.id !== user.id) {
          setGate({ kind: "error", message: "アカウント権限を確認できませんでした。" });
          return;
        }
        if (profile.role !== "admin" || profile.status !== "active") {
          setGate({ kind: "denied" });
          return;
        }
        setGate({ kind: "ready" });
      } catch {
        if (active) setGate({ kind: "error", message: "アカウント権限を確認できませんでした。" });
      }
    };

    void verify();
    try {
      const client = getSupabaseClient();
      const { data } = client.auth.onAuthStateChange(() => {
        window.setTimeout(() => { if (active) void verify(); }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Initial verification renders the safe error state when the client cannot be created.
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  if (gate.kind === "ready") return <>{children}</>;

  return (
    <main className="standalone-page">
      <section className="standalone-card">
        {gate.kind === "loading" && <p className="route-notice">権限を確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">このページを表示するにはログインが必要です。</p>}
        {gate.kind === "denied" && <p className="route-notice error">このページを表示する権限がありません。</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
        {gate.kind !== "loading" && <a className="route-back" href="/">← ホームへ戻る</a>}
      </section>
    </main>
  );
}
