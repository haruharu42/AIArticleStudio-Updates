"use client";

import { useEffect, useState } from "react";

import { loadAccessState, type AccessState } from "@/lib/phase6-access";
import { readMobileNavAlways, writeMobileNavAlways } from "@/lib/mobile-nav-preference";
import { getSupabaseClient } from "@/lib/supabase";

type SettingsState = AccessState | { kind: "loading" } | { kind: "unavailable" };

export function PwaSettingsPage() {
  const [state, setState] = useState<SettingsState>({ kind: "loading" });
  const [alwaysShowNav, setAlwaysShowNav] = useState(true);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setAlwaysShowNav(readMobileNavAlways());
    });

    let client: ReturnType<typeof getSupabaseClient>;
    try {
      client = getSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setState({ kind: "unavailable" });
      });
      return () => {
        active = false;
      };
    }

    void loadAccessState(client).then(
      (next) => {
        if (active) setState(next);
      },
      () => {
        if (active) setState({ kind: "unavailable" });
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const toggleAlwaysShowNav = () => {
    const next = !alwaysShowNav;
    setAlwaysShowNav(next);
    writeMobileNavAlways(next);
  };

  const logout = async () => {
    try {
      const client = getSupabaseClient();
      await client.auth.signOut({ scope: "local" });
    } finally {
      window.location.assign("/");
    }
  };

  const profile = state.kind === "ready" ? state.profile : null;

  return (
    <div className="beginner-shell persistent-settings-shell">
      <header className="beginner-topbar">
        <a className="beginner-brand" href="/" aria-label="AI Article Studio ホーム"><span aria-hidden="true">✦</span><strong>AI ARTICLE <em>STUDIO</em></strong></a>
        {profile && <div className="beginner-account"><span>{profile.display_name || "ユーザー"}</span><small>{profile.aas_user_id}</small></div>}
      </header>

      <main className="beginner-main">
        <section className="beginner-settings-page persistent-settings-page">
          <p className="eyebrow">SETTINGS</p>
          <h1>設定</h1>
          <p>表示・アカウント・利用権に関する設定を確認できます。</p>

          <section className="persistent-settings-section" aria-labelledby="navigation-settings-title">
            <div>
              <strong id="navigation-settings-title">下部ナビを常に表示</strong>
              <small>ONにすると、記事作成・SNS・画像・各機能画面へ移動しても下部ナビを表示します。OFFではホームと設定画面だけに表示します。</small>
            </div>
            <button className={`persistent-toggle ${alwaysShowNav ? "on" : ""}`} type="button" role="switch" aria-checked={alwaysShowNav} onClick={toggleAlwaysShowNav}>
              <span aria-hidden="true" />
              <b>{alwaysShowNav ? "ON" : "OFF"}</b>
            </button>
          </section>

          {profile ? (
            <div className="beginner-settings-card">
              <div><strong>{profile.display_name || "ユーザー"}</strong><span>{profile.aas_user_id}</span><small>{profile.role} / {profile.status}</small></div>
              <span className="beginner-access-badge">● PWA利用可能</span>
            </div>
          ) : (
            <div className="persistent-settings-status" role="status">
              {state.kind === "loading" ? "アカウント情報を確認しています…" : state.kind === "signed_out" ? "ログイン状態を確認できませんでした。" : "アカウント情報を取得できませんでした。"}
            </div>
          )}

          <div className="beginner-settings-links">
            <a href="/tools">機能一覧 <span>›</span></a>
            <a href="/terms">利用規約 <span>›</span></a>
            <a href="/privacy">プライバシーポリシー <span>›</span></a>
            <a href="/ai-terms">AI利用条件 <span>›</span></a>
          </div>

          <div className="beginner-settings-actions">
            <a className="persistent-settings-home" href="/">ホームへ戻る</a>
            {profile && <button className="danger" type="button" onClick={() => void logout()}>ログアウト</button>}
          </div>
        </section>
      </main>
    </div>
  );
}
