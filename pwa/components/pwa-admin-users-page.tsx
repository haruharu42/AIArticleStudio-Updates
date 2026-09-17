"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CREATOR_MEMBERSHIP_PLANS,
  clearCreatorMembershipPlan,
  createPwaAccessCode,
  grantPwaEntitlement,
  listCreatorMembershipEntitlements,
  listPwaAccessCodes,
  listPwaAdminUsers,
  listPwaEntitlements,
  revokePwaAccessCode,
  revokePwaEntitlement,
  setCreatorMembershipPlan,
  setPwaAdminUserStatus,
  type CreatorMembershipPlanCode,
  type PwaAdminEntitlement,
  type PwaAdminInvite,
  type PwaAdminUser,
} from "@/lib/pwa-admin-users";
import { getSupabaseClient } from "@/lib/supabase";

type LoadState = "loading" | "ready" | "error";

function formatDate(value: string | null): string {
  if (!value) return "無期限";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isCurrent(item: PwaAdminEntitlement): boolean {
  if (item.status !== "active") return false;
  return !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now();
}

export function PwaAdminUsersPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [users, setUsers] = useState<PwaAdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entitlements, setEntitlements] = useState<PwaAdminEntitlement[]>([]);
  const [membershipEntitlements, setMembershipEntitlements] = useState<PwaAdminEntitlement[]>([]);
  const [codes, setCodes] = useState<PwaAdminInvite[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [grantChannel, setGrantChannel] = useState("admin-pwa");
  const [grantReference, setGrantReference] = useState("");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [membershipPlan, setMembershipPlan] = useState<CreatorMembershipPlanCode>("CREATOR_CLUB");
  const [membershipReference, setMembershipReference] = useState("");
  const [membershipExpiry, setMembershipExpiry] = useState("");
  const [codeLabel, setCodeLabel] = useState("");
  const [codeChannel, setCodeChannel] = useState("external-sale");
  const [codeReference, setCodeReference] = useState("");
  const [codeExpiry, setCodeExpiry] = useState("");
  const [accessExpiry, setAccessExpiry] = useState("");
  const [maxUses, setMaxUses] = useState(1);

  const selected = useMemo(
    () => users.find((user) => user.id === selectedId) ?? null,
    [users, selectedId],
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      `${user.aasUserId} ${user.displayName ?? ""}`.toLowerCase().includes(query),
    );
  }, [search, users]);

  const refreshSelectedEntitlements = useCallback(async (userId: string) => {
    if (!userId) {
      setEntitlements([]);
      setMembershipEntitlements([]);
      return;
    }
    const client = getSupabaseClient();
    const [nextPwa, nextMembership] = await Promise.all([
      listPwaEntitlements(client, userId),
      listCreatorMembershipEntitlements(client, userId),
    ]);
    setEntitlements(nextPwa);
    setMembershipEntitlements(nextMembership);
  }, []);

  const refresh = useCallback(async () => {
    const client = getSupabaseClient();
    const [nextUsers, nextCodes] = await Promise.all([
      listPwaAdminUsers(client),
      listPwaAccessCodes(client),
    ]);
    setUsers(nextUsers);
    setCodes(nextCodes);
    const nextSelected = nextUsers.some((user) => user.id === selectedId)
      ? selectedId
      : nextUsers[0]?.id ?? "";
    setSelectedId(nextSelected);
    await refreshSelectedEntitlements(nextSelected);
  }, [refreshSelectedEntitlements, selectedId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void refresh().then(
        () => { if (active) setState("ready"); },
        (error: unknown) => {
          if (!active) return;
          setState("error");
          setMessage(error instanceof Error ? error.message : "管理データを取得できませんでした。");
        },
      );
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const selectUser = async (user: PwaAdminUser) => {
    setSelectedId(user.id);
    setMessage("");
    try {
      await refreshSelectedEntitlements(user.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "利用権を取得できませんでした。");
    }
  };

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const createCode = async () => {
    await run(async () => {
      const created = await createPwaAccessCode(getSupabaseClient(), {
        label: codeLabel,
        salesChannel: codeChannel,
        externalReference: codeReference,
        expiresAt: codeExpiry ? new Date(codeExpiry).toISOString() : undefined,
        entitlementExpiresAt: accessExpiry ? new Date(accessExpiry).toISOString() : undefined,
        maxUses,
      });
      if (navigator.clipboard) await navigator.clipboard.writeText(created.code).catch(() => undefined);
      setCodeLabel("");
      setCodeReference("");
      setCodeExpiry("");
      setAccessExpiry("");
    }, "PWA利用コードを作成しました。コードは可能な場合クリップボードへコピーしました。");
  };

  if (state === "loading") {
    return <main className="admin-dashboard"><section className="admin-card"><p>ユーザー管理を読み込んでいます…</p></section></main>;
  }

  return (
    <main className="admin-dashboard">
      <section className="admin-card">
        <p className="eyebrow">PWA USER MANAGEMENT</p>
        <h1>ユーザー・PWA利用権</h1>
        <p>PWA利用権とCreator Club特典を分離して管理します。note購入状態の自動取得は行わず、確認済みプランだけを登録できます。</p>
        {message && <p role="status" className="admin-message">{message}</p>}
        {state === "error" && <button type="button" onClick={() => window.location.reload()}>再読み込み</button>}
      </section>

      {state === "ready" && (
        <>
          <section className="admin-card">
            <div className="admin-section-head">
              <div><p className="eyebrow">ACCOUNTS</p><h2>アカウント一覧</h2></div>
              <button type="button" disabled={busy} onClick={() => void run(refresh, "最新状態へ更新しました。")}>更新</button>
            </div>
            <label className="route-field full">
              <span>AAS ID / 表示名で検索</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AAS-000002" />
            </label>
            <div className="admin-user-list">
              {filteredUsers.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  className={selectedId === user.id ? "selected" : ""}
                  onClick={() => void selectUser(user)}
                >
                  <strong>{user.aasUserId}</strong>
                  <span>{user.displayName || "表示名なし"}</span>
                  <small>{user.role} / {user.status}</small>
                </button>
              ))}
            </div>
          </section>

          {selected && (
            <section className="admin-card">
              <p className="eyebrow">SELECTED USER</p>
              <h2>{selected.aasUserId} — {selected.displayName || "表示名なし"}</h2>
              <p>role: {selected.role} / status: {selected.status}</p>

              {selected.role === "user" && (
                <>
                  <div className="admin-actions">
                    {selected.status === "pending" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "active"),
                        "アカウントを承認しました。",
                      )}>承認</button>
                    )}
                    {selected.status === "active" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "suspended"),
                        "アカウントを停止しました。",
                      )}>停止</button>
                    )}
                    {selected.status === "suspended" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "active"),
                        "アカウントを再開しました。",
                      )}>再開</button>
                    )}
                  </div>

                  <h3>PWA利用権</h3>
                  {entitlements.length ? (
                    <div className="admin-entitlement-list">
                      {entitlements.map((item) => (
                        <article key={item.id}>
                          <strong>{item.productName}</strong>
                          <span>{item.status}{isCurrent(item) ? " / 利用可能" : ""}</span>
                          <small>期限: {formatDate(item.expiresAt)} / {item.salesChannel}</small>
                        </article>
                      ))}
                    </div>
                  ) : <p>PWA利用権はありません。</p>}

                  <div className="admin-form-grid">
                    <label className="route-field"><span>付与元</span><input value={grantChannel} onChange={(event) => setGrantChannel(event.target.value)} /></label>
                    <label className="route-field"><span>利用期限（任意）</span><input type="datetime-local" value={grantExpiry} onChange={(event) => setGrantExpiry(event.target.value)} /></label>
                    <label className="route-field full"><span>外部参照（任意）</span><input value={grantReference} onChange={(event) => setGrantReference(event.target.value)} /></label>
                  </div>
                  <div className="admin-actions">
                    <button type="button" disabled={busy} onClick={() => void run(
                      () => grantPwaEntitlement(getSupabaseClient(), selected.id, {
                        salesChannel: grantChannel,
                        externalReference: grantReference,
                        expiresAt: grantExpiry ? new Date(grantExpiry).toISOString() : undefined,
                      }),
                      "PWA利用権を付与しました。",
                    )}>PWAを付与</button>
                    <button type="button" disabled={busy} onClick={() => void run(
                      () => revokePwaEntitlement(getSupabaseClient(), selected.id),
                      "PWA利用権を取り消しました。",
                    )}>PWAを取消</button>
                  </div>

                  <h3>note Creator Club特典</h3>
                  <p>確認済みのnoteメンバーシップをAAS特典へ紐づけます。切替時は以前のCreator Clubプランを安全に無効化して1プランだけ有効にします。</p>
                  {membershipEntitlements.length ? (
                    <div className="admin-entitlement-list">
                      {membershipEntitlements.map((item) => (
                        <article key={item.id}>
                          <strong>{item.productName}</strong>
                          <span>{item.status}{isCurrent(item) ? " / 特典有効" : ""}</span>
                          <small>期限: {formatDate(item.expiresAt)} / {item.salesChannel}</small>
                        </article>
                      ))}
                    </div>
                  ) : <p>Creator Club特典は未登録です。</p>}

                  <div className="admin-form-grid">
                    <label className="route-field">
                      <span>Creator Clubプラン</span>
                      <select value={membershipPlan} onChange={(event) => setMembershipPlan(event.target.value as CreatorMembershipPlanCode)}>
                        {CREATOR_MEMBERSHIP_PLANS.map((plan) => <option key={plan.code} value={plan.code}>{plan.label}</option>)}
                      </select>
                    </label>
                    <label className="route-field"><span>特典期限（任意）</span><input type="datetime-local" value={membershipExpiry} onChange={(event) => setMembershipExpiry(event.target.value)} /></label>
                    <label className="route-field full"><span>note確認メモ・外部参照（任意）</span><input value={membershipReference} onChange={(event) => setMembershipReference(event.target.value)} placeholder="例: 2026-09 note確認" /></label>
                  </div>
                  <div className="admin-actions">
                    <button type="button" disabled={busy} onClick={() => void run(
                      () => setCreatorMembershipPlan(getSupabaseClient(), selected.id, {
                        planCode: membershipPlan,
                        expiresAt: membershipExpiry ? new Date(membershipExpiry).toISOString() : undefined,
                        externalReference: membershipReference,
                      }),
                      "Creator Clubプランを登録しました。",
                    )}>Creator Clubを登録・変更</button>
                    <button type="button" disabled={busy} onClick={() => void run(
                      () => clearCreatorMembershipPlan(getSupabaseClient(), selected.id),
                      "Creator Clubプランを解除しました。記事やプロフィールは削除されません。",
                    )}>Creator Clubを解除</button>
                  </div>
                </>
              )}
            </section>
          )}

          <section className="admin-card">
            <p className="eyebrow">ACCESS CODES</p>
            <h2>PWA利用コード</h2>
            <div className="admin-form-grid">
              <label className="route-field"><span>ラベル</span><input value={codeLabel} onChange={(event) => setCodeLabel(event.target.value)} /></label>
              <label className="route-field"><span>販売チャネル</span><input value={codeChannel} onChange={(event) => setCodeChannel(event.target.value)} /></label>
              <label className="route-field full"><span>外部参照（任意）</span><input value={codeReference} onChange={(event) => setCodeReference(event.target.value)} /></label>
              <label className="route-field"><span>コード有効期限（任意）</span><input type="datetime-local" value={codeExpiry} onChange={(event) => setCodeExpiry(event.target.value)} /></label>
              <label className="route-field"><span>付与する利用権期限（任意）</span><input type="datetime-local" value={accessExpiry} onChange={(event) => setAccessExpiry(event.target.value)} /></label>
              <label className="route-field"><span>最大利用回数</span><input type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value) || 1))} /></label>
            </div>
            <button type="button" disabled={busy} onClick={() => void createCode()}>PWA利用コードを作成</button>

            <div className="admin-invite-list">
              {codes.map((code) => (
                <article key={code.id}>
                  <strong>{code.label || "ラベルなし"}</strong>
                  <code>{code.code}</code>
                  <span>{code.status} / {code.useCount}/{code.maxUses}</span>
                  <small>コード期限: {formatDate(code.expiresAt)} / 利用権期限: {formatDate(code.entitlementExpiresAt)}</small>
                  {code.status === "active" && (
                    <button type="button" disabled={busy} onClick={() => void run(
                      () => revokePwaAccessCode(getSupabaseClient(), code.id),
                      "PWA利用コードを無効化しました。",
                    )}>無効化</button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
