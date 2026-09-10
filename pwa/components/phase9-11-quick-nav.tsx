"use client";

import { useEffect, useState } from "react";

import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { getSupabaseClient } from "@/lib/supabase";

type QuickState = AccessState | { kind: "unavailable" } | { kind: "loading" };

export function Phase9To11QuickNav() {
  const [state, setState] = useState<QuickState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await loadAccessState(getSupabaseClient());
        if (active) setState(next);
      } catch {
        if (active) setState({ kind: "unavailable" });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (
    state.kind === "loading" ||
    state.kind === "unavailable" ||
    state.kind === "signed_out" ||
    state.kind === "suspended" ||
    state.kind === "disabled"
  ) {
    return null;
  }

  const showInvite =
    state.kind === "pending" || state.kind === "entitlement_denied";
  const showCreate = state.kind === "ready";
  const showAdmin = state.kind === "ready" && state.profile.role === "admin";

  return (
    <nav className="phase-quick-nav" aria-label="追加機能">
      {showCreate && (
        <a className="quick-primary" href="/create">
          <span>✦</span>
          記事を作る
        </a>
      )}
      {showInvite && (
        <a href="/invite">
          <span>⌁</span>
          PWA招待
        </a>
      )}
      {showAdmin && (
        <a href="/admin">
          <span>⚙</span>
          管理
        </a>
      )}
    </nav>
  );
}
