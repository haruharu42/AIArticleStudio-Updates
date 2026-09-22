"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSharedAccessState } from "@/components/access-state-provider";
import { redeemPwaInvite } from "@/lib/phase9-invite";

export function Phase9InvitePage() {
  const { state: accessState, client, refresh } = useSharedAccessState();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);


  const profile = useMemo(() => {
    if (
      accessState.kind === "ready" ||
      accessState.kind === "entitlement_denied" ||
      accessState.kind === "pending"
    ) {
      return accessState.profile.role === "user" &&
        (accessState.profile.status === "pending" || accessState.profile.status === "active")
        ? accessState.profile
        : null;
    }
    return null;
  }, [accessState]);

  const redeem = async () => {
    if (!client || !profile) return;
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      const result = await redeemPwaInvite(client, code);
      await refresh();
      setSuccess(true);
      setMessage(
        result.profileStatus === "active"
          ? "PWA利用権を有効化しました。ホームへ戻ると利用できます。"
          : "PWA利用権を登録しました。管理者のアカウント承認後に利用できます。",
      );
      setCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "招待コードの利用に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="standalone-page">
      <section className="standalone-card">
        <p className="eyebrow">PWA INVITATION</p>
        <h1>PWA招待コード</h1>
        <p className="standalone-lead">購入・招待で受け取ったコードを、このAASアカウントへ登録します。Windows利用権とは別に管理されます。</p>

        {accessState.kind === "signed_out" && (
          <div className="route-notice error">先にホームからログインしてください。</div>
        )}
        {accessState.kind === "unavailable" && (
          <div className="route-notice error">AASへ接続できませんでした。通信状態を確認してください。</div>
        )}
        {accessState.kind !== "loading" && accessState.kind !== "signed_out" && accessState.kind !== "unavailable" && !profile && (
          <div className="route-notice error">現在のアカウント状態では招待コードを利用できません。</div>
        )}
        {profile && (
          <>
            <dl className="route-meta">
              <div><dt>AAS ID</dt><dd>{profile.aas_user_id}</dd></div>
              <div><dt>アカウント状態</dt><dd>{profile.status}</dd></div>
            </dl>
            <label className="route-field">
              <span>招待コード</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
            </label>
            {message && <div className={success ? "route-notice" : "route-notice error"}>{message}</div>}
            <button className="primary-action" type="button" disabled={busy || !code.trim()} onClick={() => void redeem()}>
              {busy ? "確認中…" : "招待コードを登録"}
            </button>
          </>
        )}
        <Link className="route-back" href="/">← ホームへ戻る</Link>
      </section>
    </main>
  );
}
