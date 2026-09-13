"use client";

import { useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase";
import { redeemPwaInvite } from "@/lib/phase9-invite";

type State =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "ready"; aasId: string; status: string }
  | { kind: "error"; message: string };

export function Phase9InvitePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) {
          setState({ kind: "signed_out" });
          return;
        }
        const { data, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,status,role")
          .eq("id", user.id)
          .single();
        if (profileError || !data || data.id !== user.id || data.role !== "user") {
          throw new Error("招待コードを利用できるユーザー情報を確認できません。");
        }
        if (data.status !== "pending" && data.status !== "active") {
          throw new Error("現在のアカウント状態では招待コードを利用できません。");
        }
        setState({ kind: "ready", aasId: data.aas_user_id, status: data.status });
      } catch (error) {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "初期化に失敗しました。" });
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const redeem = async () => {
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      const result = await redeemPwaInvite(getSupabaseClient(), code);
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

        {state.kind === "loading" && <p className="route-notice">アカウントを確認しています…</p>}
        {state.kind === "signed_out" && (
          <div className="route-notice error">先にホームからログインしてください。</div>
        )}
        {state.kind === "error" && <div className="route-notice error">{state.message}</div>}
        {state.kind === "ready" && (
          <>
            <dl className="route-meta">
              <div><dt>AAS ID</dt><dd>{state.aasId}</dd></div>
              <div><dt>アカウント状態</dt><dd>{state.status}</dd></div>
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
        <a className="route-back" href="/">← ホームへ戻る</a>
      </section>
    </main>
  );
}
