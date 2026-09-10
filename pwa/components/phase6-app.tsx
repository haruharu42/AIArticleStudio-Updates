"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  authMessage,
  loadAccessState,
  PWA_PRODUCT_CODE,
  type AccessState,
  type AasProfile,
} from "@/lib/phase6-access";
import {
  getSupabaseClient,
  PublicConfigurationError,
  publicLinks,
} from "@/lib/supabase";
import { Phase7Library } from "@/components/phase7-library";

type AuthMode = "login" | "register" | "reset" | "recovery";
type Screen =
  | { kind: "loading" }
  | { kind: "auth" }
  | { kind: "access"; value: Exclude<AccessState, { kind: "signed_out" }> }
  | { kind: "configuration_error"; message: string }
  | { kind: "error"; message: string };

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const callbackUrl = () => `${window.location.origin}/auth/callback`;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"}>
      <span className="brand-mark" aria-hidden="true">
        ✦
      </span>
      <span>
        <strong>AI ARTICLE</strong>
        <small>STUDIO PWA</small>
      </span>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="center-screen" role="status" aria-live="polite">
      <Brand />
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={error ? "notice error" : "notice"} role={error ? "alert" : "status"}>
      {children}
    </div>
  );
}

function PublicLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function AuthScreen({
  client,
  mode,
  setMode,
  refresh,
}: {
  client: SupabaseClient;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  refresh: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const show = (value: string, error = false) => {
    setMessage(value);
    setIsError(error);
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      show("メールアドレスとパスワードを入力してください。", true);
      return;
    }
    setBusy(true);
    show("");
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPassword("");
    if (error) {
      show(authMessage(error), true);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  };

  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      show("必須項目を入力してください。", true);
      return;
    }
    if (password.length < 8) {
      show("パスワードは8文字以上で入力してください。", true);
      return;
    }
    if (password !== confirmPassword) {
      show("確認用パスワードが一致しません。", true);
      return;
    }
    if (!accepted) {
      show("3つの条件を確認し、同意してください。", true);
      return;
    }

    setBusy(true);
    show("");
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: callbackUrl(),
        data: {
          display_name: displayName.trim(),
          terms_accepted: true,
          privacy_accepted: true,
          ai_terms_accepted: true,
        },
      },
    });
    setPassword("");
    setConfirmPassword("");
    if (error) {
      show(authMessage(error), true);
      setBusy(false);
      return;
    }
    if (data.session) {
      await refresh();
    } else {
      setMode("login");
      show("確認メールを送信しました。メール内のリンクを開いてください。");
    }
    setBusy(false);
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      show("メールアドレスを入力してください。", true);
      return;
    }
    setBusy(true);
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${callbackUrl()}?mode=recovery`,
    });
    if (error) show(authMessage(error), true);
    else show("パスワード再設定メールを送信しました。");
    setBusy(false);
  };

  const submitRecovery = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      show("新しいパスワードは8文字以上で入力してください。", true);
      return;
    }
    if (password !== confirmPassword) {
      show("確認用パスワードが一致しません。", true);
      return;
    }
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setPassword("");
    setConfirmPassword("");
    if (error) {
      show(authMessage(error), true);
      setBusy(false);
      return;
    }
    window.history.replaceState({}, "", "/");
    await refresh();
    setBusy(false);
  };

  const googleLogin = async () => {
    if (!accepted) {
      show("Googleログイン前に3つの条件へ同意してください。", true);
      return;
    }
    setBusy(true);
    sessionStorage.setItem("aas-pwa-google-consent", "accepted");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      sessionStorage.removeItem("aas-pwa-google-consent");
      show(authMessage(error), true);
      setBusy(false);
    }
  };

  const title = {
    login: "ログイン",
    register: "新規アカウント登録",
    reset: "パスワード再設定",
    recovery: "新しいパスワード",
  }[mode];

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Brand />
        <p className="eyebrow">PWA ARTICLE LIBRARY · PHASE 7</p>
        <h1>記事づくりを、<br />どこからでも。</h1>
        <p className="lead">
          Windows版と同じアカウント・利用権を使うPWA基盤です。
          安全なログインに加え、クラウド記事をどの端末からでも確認できます。
        </p>
        <div className="trust-row">
          <span>Supabase Auth</span>
          <span>RLS</span>
          <span>PKCE</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand"><Brand compact /></div>
          <p className="eyebrow">AI ARTICLE STUDIO</p>
          <h2>{title}</h2>
          <p className="form-caption">
            {mode === "login" && "登録済みのアカウントで続けます。"}
            {mode === "register" && "登録後、管理者の承認をお待ちください。"}
            {mode === "reset" && "再設定用のリンクをメールで送信します。"}
            {mode === "recovery" && "安全な新しいパスワードを設定してください。"}
          </p>

          {message && <Notice error={isError}>{message}</Notice>}

          {mode === "login" && (
            <form onSubmit={submitLogin} className="auth-form">
              <Field label="メールアドレス" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
              <button className="primary-action" type="submit" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button>
              <button className="text-action" type="button" onClick={() => setMode("reset")}>パスワードを忘れた方</button>
              <div className="divider"><span>または</span></div>
              <Consent checked={accepted} onChange={setAccepted} compact />
              <button className="google-action" type="button" onClick={googleLogin} disabled={busy}><b>G</b> Googleでログイン</button>
              <p className="switch-copy">はじめての方 <button type="button" onClick={() => setMode("register")}>新規登録</button></p>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={submitRegistration} className="auth-form">
              <Field label="表示名（任意）" value={displayName} onChange={setDisplayName} autoComplete="name" />
              <Field label="メールアドレス" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field label="パスワード（8文字以上）" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
              <Field label="パスワード（確認）" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
              <Consent checked={accepted} onChange={setAccepted} />
              <button className="primary-action" type="submit" disabled={busy}>{busy ? "登録中…" : "同意して登録"}</button>
              <p className="switch-copy">登録済みの方 <button type="button" onClick={() => setMode("login")}>ログインへ</button></p>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={submitReset} className="auth-form">
              <Field label="メールアドレス" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <button className="primary-action" type="submit" disabled={busy}>{busy ? "送信中…" : "再設定メールを送信"}</button>
              <button className="text-action" type="button" onClick={() => setMode("login")}>ログインへ戻る</button>
            </form>
          )}

          {mode === "recovery" && (
            <form onSubmit={submitRecovery} className="auth-form">
              <Field label="新しいパスワード（8文字以上）" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
              <Field label="新しいパスワード（確認）" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
              <button className="primary-action" type="submit" disabled={busy}>{busy ? "更新中…" : "パスワードを更新"}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Consent({
  checked,
  onChange,
  compact = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "consent compact" : "consent"}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <PublicLink href={publicLinks.terms}>利用規約</PublicLink>・
        <PublicLink href={publicLinks.privacy}>プライバシーポリシー</PublicLink>・
        <PublicLink href={publicLinks.aiTerms}>AI利用条件</PublicLink>に同意します
      </span>
    </label>
  );
}

function AccessIssue({
  value,
  onRetry,
  onLogout,
}: {
  value: Exclude<AccessState, { kind: "signed_out" } | { kind: "ready" }>;
  onRetry: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const content = {
    pending: ["承認待ちです", "登録は完了しています。管理者の承認後にもう一度確認してください。"],
    suspended: ["アカウントは停止中です", "管理者へお問い合わせください。ローカルの記事には影響しません。"],
    disabled: ["アカウントを利用できません", "このアカウントは無効です。管理者へお問い合わせください。"],
    entitlement_denied: ["PWA利用権がありません", "Windows版の利用権とは別です。PWA用利用権が付与されるまでお待ちください。"],
  }[value.kind];

  return (
    <main className="status-page">
      <section className="status-card">
        <Brand compact />
        <span className="status-symbol">!</span>
        <p className="eyebrow">ACCESS CHECK</p>
        <h1>{content[0]}</h1>
        <p>{content[1]}</p>
        <dl>
          <div><dt>AAS ID</dt><dd>{value.profile.aas_user_id}</dd></div>
          <div><dt>状態</dt><dd>{value.profile.status}</dd></div>
          <div><dt>製品</dt><dd>{PWA_PRODUCT_CODE}</dd></div>
        </dl>
        <div className="status-actions">
          <button type="button" className="primary-action" onClick={() => void onRetry()}>再確認</button>
          <button type="button" className="secondary-action" onClick={() => void onLogout()}>ログアウト</button>
        </div>
      </section>
    </main>
  );
}

function Dashboard({
  client,
  profile,
  onRetry,
  onLogout,
}: {
  client: SupabaseClient;
  profile: AasProfile;
  onRetry: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [section, setSection] = useState<"home" | "library">("home");
  const [imageUnsaved,setImageUnsaved] = useState(false);
  const [imageBusy,setImageBusy] = useState(false);
  const mayLeave = () => !imageBusy && (!imageUnsaved || window.confirm("未保存の画像情報・選択した画像を破棄して移動しますか？"));
  const navigate = (next: "home" | "library") => { if (next === section || mayLeave()) setSection(next); };
  const logout = async () => { if (mayLeave()) await onLogout(); };

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="pwa-shell">
      <aside className="side-nav">
        <Brand compact />
        <nav aria-label="メインナビゲーション">
          <button className={section === "home" ? "active" : ""} type="button" onClick={() => navigate("home")}><span>⌂</span>ホーム</button>
          <button className={section === "library" ? "active" : ""} type="button" onClick={() => navigate("library")}><span>▤</span>記事ライブラリ<small>利用可能</small></button>
          <button type="button" disabled><span>✦</span>記事を作る<small>準備中</small></button>
          <button type="button" onClick={() => navigate("library")}><span>◫</span>記事の画像<small>記事から選択</small></button>
        </nav>
        <div className="account-block">
          <strong>{profile.display_name || "ユーザー"}</strong>
          <span>{profile.aas_user_id}</span>
          <button type="button" onClick={() => void logout()}>ログアウト</button>
        </div>
      </aside>

      <main className={section === "home" ? "dashboard" : "dashboard library-dashboard"}>
        {section === "library" ? (
          <Phase7Library client={client} ownerId={profile.id} onUnsavedChange={setImageUnsaved} onBusyChange={setImageBusy} />
        ) : (
          <>
        <header className="dashboard-head">
          <div>
            <p className="eyebrow">PWA HOME</p>
            <h1>おかえりなさい</h1>
            <p>記事と画像を、いつもの端末と共有できます。</p>
          </div>
          <span className="access-badge">● PWA利用可能</span>
        </header>

        <section className="hero-card">
          <div>
            <span className="hero-icon">✦</span>
            <p className="eyebrow">ARTICLE LIBRARY READY</p>
            <h2>Windows版の記事をPWAでも確認できます</h2>
            <p>記事の閲覧・編集から、アイキャッチや挿絵の追加まで。記事を開いて、続きから作業できます。</p>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={() => navigate("library")}>記事ライブラリを開く</button>
            <button type="button" className="secondary-action" onClick={() => void onRetry()}>アクセスを再確認</button>
            {installPrompt && <button type="button" className="primary-action" onClick={() => void install()}>アプリとして追加</button>}
          </div>
        </section>

        <section className="status-grid" aria-label="接続状態">
          <StatusTile label="認証" value="接続済み" detail="Supabase Auth / PKCE" />
          <StatusTile label="プロフィール" value="利用中" detail={`${profile.role} / ${profile.status}`} />
          <StatusTile label="PWA利用権" value="確認済み" detail={PWA_PRODUCT_CODE} />
        </section>

        <section className="coming-section">
          <div className="section-title">
            <div><p className="eyebrow">YOUR WORKSPACE</p><h2>記事制作のワークスペース</h2></div>
            <span>順次機能を追加</span>
          </div>
          <div className="feature-grid">
            <FeatureCard number="07" title="共通記事ライブラリ" description="クラウド記事の一覧・閲覧・編集・削除" ready />
            <FeatureCard number="08" title="画像管理と同期" description="アイキャッチ・挿絵の追加と差し替え" ready />
            <FeatureCard number="11" title="記事制作フロー" description="モバイルから記事の新規作成" />
          </div>
        </section>
          </>
        )}
      </main>

      <nav className="bottom-nav" aria-label="モバイルナビゲーション">
        <button className={section === "home" ? "active" : ""} type="button" onClick={() => navigate("home")}><span>⌂</span>ホーム</button>
        <button className={section === "library" ? "active" : ""} type="button" onClick={() => navigate("library")}><span>▤</span>記事</button>
        <button type="button" disabled><span className="create-dot">✦</span>作成</button>
        <button type="button" onClick={() => navigate("library")}><span>◫</span>画像</button>
      </nav>
    </div>
  );
}

function StatusTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="status-tile"><span>{label}</span><strong><i>●</i>{value}</strong><small>{detail}</small></article>;
}

function FeatureCard({ number, title, description, ready = false }: { number: string; title: string; description: string; ready?: boolean }) {
  return <article className={ready ? "feature-card ready" : "feature-card"}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><b>{ready ? "利用可能" : "準備中"}</b></article>;
}

async function resolveAccess(
  client: SupabaseClient,
  setScreen: (next: Screen) => void,
): Promise<void> {
  setScreen({ kind: "loading" });
  try {
    const access = await loadAccessState(client);
    if (access.kind === "signed_out") setScreen({ kind: "auth" });
    else setScreen({ kind: "access", value: access });
  } catch (error) {
    setScreen({ kind: "error", message: authMessage(error) });
  }
}

export function Phase7App() {
  const recoveryRef = useRef(false);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const refresh = useCallback(async () => {
    if (!client) return;
    recoveryRef.current = false;
    await resolveAccess(client, setScreen);
  }, [client]);

  const logout = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut({ scope: "local" });
    setAuthMode("login");
    setScreen({ kind: "auth" });
  }, [client]);

  useEffect(() => {
    let active = true;
    let authClient: SupabaseClient;
    try {
      authClient = getSupabaseClient();
    } catch (error) {
      const message =
        error instanceof PublicConfigurationError
          ? error.message
          : "PWAの初期化に失敗しました。";
      queueMicrotask(() => {
        if (active) setScreen({ kind: "configuration_error", message });
      });
      return;
    }

    recoveryRef.current =
      new URLSearchParams(window.location.search).get("mode") === "recovery";
    queueMicrotask(() => {
      if (!active) return;
      setClient(authClient);
      if (recoveryRef.current) {
        setAuthMode("recovery");
        setScreen({ kind: "auth" });
      } else {
        void resolveAccess(authClient, setScreen);
      }
    });

    const { data } = authClient.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !session) {
        setAuthMode("login");
        setScreen({ kind: "auth" });
        return;
      }
      if (event === "PASSWORD_RECOVERY" || recoveryRef.current) {
        recoveryRef.current = true;
        setAuthMode("recovery");
        setScreen({ kind: "auth" });
        return;
      }
      window.setTimeout(() => void resolveAccess(authClient, setScreen), 0);
    });

    const registerServiceWorker = () =>
      void navigator.serviceWorker.register("/sw.js");
    if ("serviceWorker" in navigator) {
      if (document.readyState === "complete") registerServiceWorker();
      else window.addEventListener("load", registerServiceWorker, { once: true });
    }

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  if (screen.kind === "loading") return <Spinner label="アカウントと利用権を確認しています…" />;

  if (screen.kind === "configuration_error" || screen.kind === "error") {
    return (
      <main className="status-page">
        <section className="status-card">
          <Brand compact />
          <span className="status-symbol">!</span>
          <p className="eyebrow">PHASE 7</p>
          <h1>{screen.kind === "configuration_error" ? "公開設定が必要です" : "接続を確認できません"}</h1>
          <p>{screen.message}</p>
          {screen.kind === "error" && <button className="primary-action" type="button" onClick={() => void refresh()}>再試行</button>}
        </section>
      </main>
    );
  }

  if (!client) return <Spinner label="初期化しています…" />;

  if (screen.kind === "auth") {
    return <AuthScreen client={client} mode={authMode} setMode={setAuthMode} refresh={refresh} />;
  }

  if (screen.value.kind !== "ready") {
    return <AccessIssue value={screen.value} onRetry={refresh} onLogout={logout} />;
  }

  return <Dashboard client={client} profile={screen.value.profile} onRetry={refresh} onLogout={logout} />;
}
