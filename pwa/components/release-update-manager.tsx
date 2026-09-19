"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  acceptAppRelease,
  loadMyAppReleaseState,
  type AppReleaseState,
} from "@/lib/app-release";
import { getSupabaseClient } from "@/lib/supabase";

const HIDDEN_PREFIXES = ["/auth", "/invite", "/terms", "/privacy", "/ai-terms"];

function hiddenRoute(pathname: string): boolean {
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

async function activateWaitingWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;

  try {
    await registration.update();
  } catch {
    // Release state still changes safely even when the browser cannot check SW updates.
  }

  const waiting = registration.waiting;
  if (!waiting) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", finish);
    window.setTimeout(finish, 1600);
    waiting.postMessage({ type: "AAS_ACTIVATE_RELEASE" });
  });
}

export function ReleaseUpdateManager() {
  const pathname = usePathname();
  const [state, setState] = useState<AppReleaseState | null>(null);
  const [dismissedReleaseId, setDismissedReleaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      return () => { mounted.current = false; };
    }

    const refresh = async () => {
      try {
        const next = await loadMyAppReleaseState(client);
        if (mounted.current) {
          setState(next);
          setMessage("");
        }
      } catch {
        if (mounted.current) setState(null);
      }
    };

    const registerWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };

    if (document.readyState === "complete") registerWorker();
    else window.addEventListener("load", registerWorker, { once: true });

    void refresh();
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => { if (mounted.current) void refresh(); }, 0);
    });

    return () => {
      mounted.current = false;
      data.subscription.unsubscribe();
      window.removeEventListener("load", registerWorker);
    };
  }, []);

  const applyUpdate = async () => {
    const release = state?.available_release;
    if (!release || busy) return;

    setBusy(true);
    setMessage("");
    try {
      const client = getSupabaseClient();
      const next = await acceptAppRelease(client, release.id);
      if (mounted.current) setState(next);
      await activateWaitingWorker();
      window.location.reload();
    } catch {
      if (mounted.current) {
        setMessage("アップデートを反映できませんでした。通信状態を確認して、もう一度お試しください。");
        setBusy(false);
      }
    }
  };

  if (hiddenRoute(pathname) || !state?.signed_in || state.active === false) return null;

  if (state.is_admin_preview && state.effective_release) {
    return (
      <aside className="release-admin-preview" aria-label="管理者テスト版">
        <strong>管理者テスト版</strong>
        <span>v{state.effective_release.version}</span>
        <small>この候補版は一般ユーザーにはまだ反映されていません。</small>
      </aside>
    );
  }

  if (state.is_tester_preview && state.effective_release) {
    return (
      <aside className="release-admin-preview" aria-label="指定テスターテスト版">
        <strong>一般ユーザーテスト版</strong>
        <span>v{state.effective_release.version}</span>
        <small>指定されたテスターだけに反映中です。他の一般ユーザーにはまだ公開されていません。</small>
      </aside>
    );
  }

  const available = state.available_release;
  if (!available || dismissedReleaseId === available.id) return null;

  if (state.update_required) {
    return (
      <div className="release-required-backdrop" role="dialog" aria-modal="true" aria-labelledby="release-required-title">
        <section className="release-update-card required">
          <p className="eyebrow">REQUIRED UPDATE</p>
          <h2 id="release-required-title">重要なアップデートがあります</h2>
          <div className="release-version-row">
            <span>現在 v{state.current_release?.version ?? "-"}</span>
            <b>→</b>
            <strong>v{available.version}</strong>
          </div>
          <h3>{available.title}</h3>
          {available.notes && <p className="release-notes">{available.notes}</p>}
          <p className="release-required-note">安全性や互換性のため、この更新は適用してから利用を続けてください。</p>
          {message && <p className="route-notice error">{message}</p>}
          <button className="primary-action" type="button" disabled={busy} onClick={() => void applyUpdate()}>
            {busy ? "アップデートしています…" : "アップデートする"}
          </button>
        </section>
      </div>
    );
  }

  return (
    <aside className="release-update-banner" aria-live="polite">
      <div>
        <span className="release-update-badge">UPDATE</span>
        <strong>v{available.version} が利用できます</strong>
        <small>{available.title}</small>
      </div>
      <div className="release-update-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => void applyUpdate()}>
          {busy ? "更新中…" : "アップデートする"}
        </button>
        <button type="button" disabled={busy} onClick={() => setDismissedReleaseId(available.id)}>あとで</button>
      </div>
      {message && <p className="route-notice error">{message}</p>}
    </aside>
  );
}
