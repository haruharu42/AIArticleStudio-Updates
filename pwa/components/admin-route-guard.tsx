"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase";

const ADMIN_MFA_FRIENDLY_NAME = "AAS PWA Admin";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied" }
  | { kind: "mfa_enroll" }
  | { kind: "mfa_challenge"; factorId: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

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

        const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
        if (!active) return;
        if (factorsError) {
          setGate({ kind: "error", message: "管理者MFAの状態を確認できませんでした。" });
          return;
        }
        const verifiedTotp = factors.totp.find((factor) => factor.status === "verified");
        if (!verifiedTotp) {
          setGate({ kind: "mfa_enroll" });
          return;
        }

        const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!active) return;
        if (aalError) {
          setGate({ kind: "error", message: "管理者MFAの認証レベルを確認できませんでした。" });
          return;
        }
        if (aal.currentLevel !== "aal2") {
          setGate({ kind: "mfa_challenge", factorId: verifiedTotp.id });
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

  const beginEnrollment = async () => {
    setBusy(true);
    setActionError("");
    try {
      const client = getSupabaseClient();

      // A browser refresh or interrupted setup can leave an unverified TOTP factor behind.
      // Remove only the unfinished primary-admin factor before creating a fresh enrollment.
      const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const unfinishedPrimaryFactors = factors.totp.filter(
        (factor) => factor.status !== "verified" && factor.friendly_name === ADMIN_MFA_FRIENDLY_NAME,
      );
      for (const factor of unfinishedPrimaryFactors) {
        const { error: cleanupError } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (cleanupError) throw cleanupError;
      }

      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: ADMIN_MFA_FRIENDLY_NAME,
      });
      if (error) throw error;
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch {
      setActionError("MFAの設定を開始できませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    if (!enrollment) return;
    setBusy(true);
    setActionError("");
    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.mfa.unenroll({ factorId: enrollment.factorId });
      if (error) throw error;
      setEnrollment(null);
      setCode("");
    } catch {
      setActionError("MFA設定をキャンセルできませんでした。再読み込み後にもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const verifyTotp = async (factorId: string) => {
    const normalized = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      setActionError("認証アプリに表示された6桁のコードを入力してください。");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const client = getSupabaseClient();
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: normalized,
      });
      if (verifyError) throw verifyError;
      window.location.reload();
    } catch {
      setActionError("MFAコードを確認できませんでした。新しいコードで再試行してください。");
      setBusy(false);
    }
  };

  if (gate.kind === "ready") return <>{children}</>;

  return (
    <main className="standalone-page">
      <section className="standalone-card">
        {gate.kind === "loading" && <p className="route-notice">権限を確認しています…</p>}
        {gate.kind === "signed_out" && <p className="route-notice error">このページを表示するにはログインが必要です。</p>}
        {gate.kind === "denied" && <p className="route-notice error">このページを表示する権限がありません。</p>}
        {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}

        {gate.kind === "mfa_enroll" && (
          <div style={{ display: "grid", gap: 14 }}>
            <p className="route-notice">管理者画面を保護するため、認証アプリによる2段階認証が必要です。</p>
            {!enrollment ? (
              <button className="primary-action" type="button" disabled={busy} onClick={() => void beginEnrollment()}>
                {busy ? "設定を準備しています…" : "管理者MFAを設定する"}
              </button>
            ) : (
              <>
                <p className="route-notice">QRコードをGoogle Authenticator、1Password等で読み取り、表示された6桁コードを入力してください。</p>
                <p className="trial-admin-note">スマホ1台だけで設定する場合は、下の「QRコードを読めない場合」を開き、表示されるセットアップキーを認証アプリへ手入力してください。</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrollment.qrCode} alt="AAS管理者MFA登録用QRコード" style={{ width: 220, maxWidth: "100%", margin: "0 auto", background: "white", padding: 8, borderRadius: 10 }} />
                <details>
                  <summary>QRコードを読めない場合</summary>
                  <p style={{ marginTop: 8 }}>セットアップキー（他人には共有しないでください）</p>
                  <code style={{ display: "block", overflowWrap: "anywhere", marginTop: 8 }}>{enrollment.secret}</code>
                </details>
                <label className="editor-field">
                  <span>6桁の認証コード</span>
                  <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="primary-action" type="button" disabled={busy} onClick={() => void verifyTotp(enrollment.factorId)}>
                    {busy ? "確認しています…" : "MFAを有効化して管理画面へ"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void cancelEnrollment()}>
                    設定をキャンセル
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {gate.kind === "mfa_challenge" && (
          <div style={{ display: "grid", gap: 14 }}>
            <p className="route-notice">管理者MFAが有効です。認証アプリの6桁コードを入力してください。</p>
            <label className="editor-field">
              <span>6桁の認証コード</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
            </label>
            <button className="primary-action" type="button" disabled={busy} onClick={() => void verifyTotp(gate.factorId)}>
              {busy ? "確認しています…" : "認証して管理画面へ"}
            </button>
          </div>
        )}

        {actionError && <p className="route-notice error">{actionError}</p>}
        {gate.kind !== "loading" && <Link className="route-back" href="/">← ホームへ戻る</Link>}
      </section>
    </main>
  );
}
