"use client";

import { useEffect, useState } from "react";

import { loadMyAppReleaseState, type AppReleaseState } from "@/lib/app-release";
import { getSupabaseClient } from "@/lib/supabase";

export function ReleasePreviewHomeStatus() {
  const [state, setState] = useState<AppReleaseState | null>(null);

  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      return;
    }

    const refresh = async () => {
      try {
        const next = await loadMyAppReleaseState(client);
        if (active) setState(next);
      } catch {
        if (active) setState(null);
      }
    };

    void refresh();
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => { if (active) void refresh(); }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (
    !state?.signed_in ||
    state.active === false ||
    !state.effective_release ||
    (!state.is_admin_preview && !state.is_tester_preview)
  ) {
    return null;
  }

  const label = state.is_admin_preview ? "管理者確認" : "テスター確認";

  return (
    <aside
      className="release-preview-home-status"
      aria-label={state.is_admin_preview ? "管理者テスト版" : "一般ユーザーテスト版"}
      title="候補版を確認中です。一般公開版とは異なる場合があります。"
    >
      <span>TEST</span>
      <strong>{label}</strong>
      <small>v{state.effective_release.version}</small>
    </aside>
  );
}
