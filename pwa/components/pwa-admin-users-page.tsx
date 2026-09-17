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
type UserFilter = "all" | PwaAdminUser["status"];

const USER_FILTERS: Array<{ value: UserFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "承認待ち" },
  { value: "active", label: "利用中" },
  { value: "suspended", label: "停止中" },
  { value: "disabled", label: "無効" },
];

const STATUS_LABELS: Record<PwaAdminUser["status"], string> = {
  pending: "承認待ち",
  active: "利用中",
  suspended: "停止中",
  disabled: "無効",
};

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

function statusClass(status: PwaAdminUser["status"]): string {
  return `status-chip status-${status}`;
}

export function PwaAdminUsersPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [users, setUsers] = useState<PwaAdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entitlements, setEntitlements] = useState<PwaAdminEntitlement[]>([]);
  const [membershipEntitlements, setMembershipEntitlements] = useState<PwaAdminEntitlement[]>([]);
  const [codes, setCodes] = useState<PwaAdminInvite[]>([]);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
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

  const userStats = useMemo(() => ({
    pending: users.filter((user) => user.status === "pending").length,
    active: users.filter((user) => user.status === "active").length,
  }), [users]);

  const codeStats = useMemo(() => ({
    active: codes.filter((code) => code.status === "active").length,
    used: codes.reduce((sum, code) => sum + code.useCount, 0),
  }), [codes]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (userFilter !== "all" && user.status !== userFilter) return false;
      if (!query) return true;
      return `${user.aasUserId} ${user.displayName ?? ""}`.toLowerCase().includes(query);
    });
  }, [search, userFilter, users]);

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

  const grantSimplePwaAccess = async () => {
    if (!selected) return;
    await run(
      () => grantPwaEntitlement(getSupabaseClient(), selected.id, { salesChannel: "admin-pwa" }),
      "PWAを使えるようにしました。",
    );
  };

  const saveMembership = async () => {
    if (!selected) return;
    await run(
      () => setCreatorMembershipPlan(getSupabaseClient(), selected.id, {
        planCode: membershipPlan,
        expiresAt: membershipExpiry ? new Date(membershipExpiry).toISOString() : undefined,
        externalReference: membershipReference,
      }),
      "Creator Club特典を設定しました。",
    );
  };

  const copyAccessCode = async (code: string) => {
    if (!navigator.clipboard) {
      setMessage("このブラウザではクリップボードを利用できません。");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setMessage("利用コードをコピーしました。");
    } catch {
      setMessage("利用コードをコピーできませんでした。コードを選択してコピーしてください。");
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
    }, "PWA利用コードを作成しました。可能な場合はクリップボードにもコピーしています。");
  };

  if (state === "loading") {
    return (
      <main className="admin-dashboard">
        <section className="admin-card admin-loading-card">
          <span className="admin-loading-dot" aria-hidden="true" />
          <p>ユーザー管理を読み込んでいます…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-dashboard">
      <section className="admin-card admin-hero-card">
        <div className="admin-hero-copy">
          <p className="eyebrow">USER ACCESS</p>
          <h1>ユーザー利用管理</h1>
          <p>基本操作は「ユーザーを選ぶ → 状態を確認 → 必要なボタンを押す」の3ステップだけです。</p>
        </div>
        {state === "ready" && (
          <div className="admin-simple-stats" aria-label="利用状況">
            <span><strong>{userStats.pending}</strong> 承認待ち</span>
            <span><strong>{userStats.active}</strong> 利用中</span>
            <span><strong>{codeStats.active}</strong> 有効コード</span>
          </div>
        )}
        {message && <p role="status" className="admin-message">{message}</p>}
        {state === "error" && <button type="button" onClick={() => window.location.reload()}>再読み込み</button>}
      </section>

      {state === "ready" && (
        <>
          <section className="admin-card admin-accounts-card">
            <div className="admin-section-head">
              <div>
                <span className="admin-step-number">1</span>
                <h2>ユーザーを選ぶ</h2>
                <p>まず操作したいユーザーを選択します。</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void run(refresh, "最新状態へ更新しました。")}>更新</button>
            </div>

            <label className="route-field full admin-search-field">
              <span>検索</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AAS ID または表示名" />
            </label>

            <div className="admin-filter-row" role="group" aria-label="ユーザー状態で絞り込み">
              {USER_FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  className={userFilter === filter.value ? "active" : ""}
                  aria-pressed={userFilter === filter.value}
                  onClick={() => setUserFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="admin-user-list">
              {filteredUsers.length ? filteredUsers.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  className={selectedId === user.id ? "selected" : ""}
                  onClick={() => void selectUser(user)}
                >
                  <span className="admin-user-id-line">
                    <strong>{user.aasUserId}</strong>
                    <span className={statusClass(user.status)}>{STATUS_LABELS[user.status]}</span>
                  </span>
                  <span className="admin-user-name">{user.displayName || "表示名なし"}</span>
                </button>
              )) : (
                <div className="admin-empty-state">
                  <strong>該当するユーザーはいません</strong>
                  <span>検索条件を変更してください。</span>
                  <button type="button" onClick={() => { setSearch(""); setUserFilter("all"); }}>絞り込みを解除</button>
                </div>
              )}
            </div>
          </section>

          {selected && (
            <section className="admin-card admin-selected-card">
              <div className="admin-selected-head">
                <div>
                  <span className="admin-step-number">2</span>
                  <h2>{selected.aasUserId}</h2>
                  <p className="admin-selected-name">{selected.displayName || "表示名なし"}</p>
                </div>
                <div className="admin-selected-badges">
                  <span className={statusClass(selected.status)}>{STATUS_LABELS[selected.status]}</span>
                  <span className="role-chip">{selected.role === "admin" ? "管理者" : "一般ユーザー"}</span>
                </div>
              </div>

              <p className="admin-next-guide">下の3項目だけ確認すれば、通常のユーザー管理は完了です。</p>

              {selected.role === "admin" ? (
                <div className="admin-notice-panel">
                  <strong>管理者アカウントです</strong>
                  <span>管理者はPWAを利用できるため、一般ユーザー向けの利用権操作は不要です。</span>
                </div>
              ) : (
                <div className="admin-simple-actions">
                  <article className="admin-action-card">
                    <div className="admin-action-card-head">
                      <div>
                        <span className="admin-action-index">1</span>
                        <h3>アカウント</h3>
                      </div>
                      <span className={statusClass(selected.status)}>{STATUS_LABELS[selected.status]}</span>
                    </div>
                    <p>{selected.status === "pending" ? "登録直後のユーザーです。利用を許可する場合は承認してください。" : selected.status === "active" ? "現在ログインして利用できる状態です。" : selected.status === "suspended" ? "現在は利用を停止しています。" : "無効状態のアカウントです。"}</p>
                    {selected.status === "pending" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "active"),
                        "アカウントを承認しました。",
                      )}>承認する</button>
                    )}
                    {selected.status === "active" && (
                      <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "suspended"),
                        "アカウントを停止しました。",
                      )}>利用を停止する</button>
                    )}
                    {selected.status === "suspended" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "active"),
                        "アカウントを再開しました。",
                      )}>利用を再開する</button>
                    )}
                  </article>

                  <article className="admin-action-card">
                    <div className="admin-action-card-head">
                      <div>
                        <span className="admin-action-index">2</span>
                        <h3>PWA利用権</h3>
                      </div>
                      <span className={entitlements.length ? "availability-badge active" : "availability-badge"}>
                        {entitlements.length ? "利用可能" : "未付与"}
                      </span>
                    </div>
                    <p>{entitlements.length ? "このユーザーはPWA版を利用できます。" : "PWA版を使わせる場合は利用権を付与します。"}</p>
                    {entitlements.length ? (
                      <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(
                        () => revokePwaEntitlement(getSupabaseClient(), selected.id),
                        "PWA利用権を取り消しました。",
                      )}>PWA利用権を取り消す</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void grantSimplePwaAccess()}>PWAを使えるようにする</button>
                    )}
                    <details className="admin-advanced-details">
                      <summary>期限や付与元を指定する</summary>
                      <div className="admin-form-grid admin-advanced-body">
                        <label className="route-field"><span>付与元</span><input value={grantChannel} onChange={(event) => setGrantChannel(event.target.value)} /></label>
                        <label className="route-field"><span>利用期限（任意）</span><input type="datetime-local" value={grantExpiry} onChange={(event) => setGrantExpiry(event.target.value)} /></label>
                        <label className="route-field full"><span>外部参照（任意）</span><input value={grantReference} onChange={(event) => setGrantReference(event.target.value)} /></label>
                      </div>
                      <button type="button" disabled={busy || entitlements.length > 0} onClick={() => void run(
                        () => grantPwaEntitlement(getSupabaseClient(), selected.id, {
                          salesChannel: grantChannel,
                          externalReference: grantReference,
                          expiresAt: grantExpiry ? new Date(grantExpiry).toISOString() : undefined,
                        }),
                        "指定した条件でPWA利用権を付与しました。",
                      )}>詳細条件で付与する</button>
                      {entitlements.length > 0 && <p className="admin-detail-note">現在利用権があるため、再付与する場合は一度取り消してください。</p>}
                    </details>
                  </article>

                  <article className="admin-action-card">
                    <div className="admin-action-card-head">
                      <div>
                        <span className="admin-action-index">3</span>
                        <h3>Creator Club特典</h3>
                      </div>
                      <span className={membershipEntitlements.length ? "availability-badge active" : "availability-badge"}>
                        {membershipEntitlements.length ? "特典有効" : "未登録"}
                      </span>
                    </div>
                    <p>note側で加入を確認できたユーザーだけ、該当プランを選んで設定します。</p>
                    <label className="route-field full admin-plan-field">
                      <span>特典プラン</span>
                      <select value={membershipPlan} onChange={(event) => setMembershipPlan(event.target.value as CreatorMembershipPlanCode)}>
                        {CREATOR_MEMBERSHIP_PLANS.map((plan) => <option key={plan.code} value={plan.code}>{plan.label}</option>)}
                      </select>
                    </label>
                    <div className="admin-actions">
                      <button type="button" disabled={busy} onClick={() => void saveMembership()}>{membershipEntitlements.length ? "プランを変更する" : "特典を設定する"}</button>
                      {membershipEntitlements.length > 0 && (
                        <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(
                          () => clearCreatorMembershipPlan(getSupabaseClient(), selected.id),
                          "Creator Club特典を解除しました。",
                        )}>特典を解除する</button>
                      )}
                    </div>
                    <details className="admin-advanced-details">
                      <summary>期限・確認メモを設定する</summary>
                      <div className="admin-form-grid admin-advanced-body">
                        <label className="route-field"><span>特典期限（任意）</span><input type="datetime-local" value={membershipExpiry} onChange={(event) => setMembershipExpiry(event.target.value)} /></label>
                        <label className="route-field full"><span>note確認メモ（任意）</span><input value={membershipReference} onChange={(event) => setMembershipReference(event.target.value)} placeholder="例: 2026-09 note確認" /></label>
                      </div>
                    </details>
                    <p className="admin-detail-note">note購入状態の自動取得は行わず、確認済みのメンバーシップだけを設定してください。</p>
                  </article>
                </div>
              )}

              <details className="admin-user-details-drawer">
                <summary>このユーザーの詳細情報を見る</summary>
                <div className="admin-user-meta-grid">
                  <article><span>登録日時</span><strong>{formatDate(selected.createdAt)}</strong></article>
                  <article><span>PWA利用権</span><strong>{entitlements.length ? "利用可能" : "なし"}</strong></article>
                  <article><span>Creator Club</span><strong>{membershipEntitlements[0]?.productName ?? "未登録"}</strong></article>
                </div>
                {entitlements.length > 0 && (
                  <div className="admin-entitlement-list">
                    {entitlements.map((item) => (
                      <article key={item.id}>
                        <strong>{item.productName}</strong>
                        <span>{item.status}</span>
                        <small>期限: {formatDate(item.expiresAt)} / {item.salesChannel}</small>
                      </article>
                    ))}
                  </div>
                )}
              </details>
            </section>
          )}

          <section className="admin-card admin-code-card">
            <details className="admin-tools-drawer">
              <summary>
                <span>
                  <strong>販売用PWA利用コード</strong>
                  <small>外部販売や個別案内で必要な場合だけ使います。</small>
                </span>
                <span className="admin-code-summary"><strong>{codeStats.active}</strong> 有効 / {codeStats.used} 利用済み</span>
              </summary>

              <div className="admin-tools-body">
                <p className="admin-tools-guide">通常のユーザー管理では、この機能を操作する必要はありません。</p>
                <div className="admin-form-grid">
                  <label className="route-field"><span>ラベル</span><input value={codeLabel} onChange={(event) => setCodeLabel(event.target.value)} placeholder="例: note購入者 9月" /></label>
                  <label className="route-field"><span>販売チャネル</span><input value={codeChannel} onChange={(event) => setCodeChannel(event.target.value)} /></label>
                  <label className="route-field full"><span>外部参照（任意）</span><input value={codeReference} onChange={(event) => setCodeReference(event.target.value)} /></label>
                  <label className="route-field"><span>コード有効期限（任意）</span><input type="datetime-local" value={codeExpiry} onChange={(event) => setCodeExpiry(event.target.value)} /></label>
                  <label className="route-field"><span>付与する利用権期限（任意）</span><input type="datetime-local" value={accessExpiry} onChange={(event) => setAccessExpiry(event.target.value)} /></label>
                  <label className="route-field"><span>最大利用回数</span><input type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value) || 1))} /></label>
                </div>
                <button type="button" disabled={busy} onClick={() => void createCode()}>利用コードを作成する</button>

                <div className="admin-invite-list">
                  {codes.length ? codes.map((code) => (
                    <article key={code.id}>
                      <div className="admin-code-title">
                        <strong>{code.label || "ラベルなし"}</strong>
                        <small>{code.salesChannel}</small>
                      </div>
                      <code>{code.code}</code>
                      <span>{code.status} / {code.useCount}/{code.maxUses}</span>
                      <small>コード期限: {formatDate(code.expiresAt)} / 利用権期限: {formatDate(code.entitlementExpiresAt)}</small>
                      <div className="admin-code-actions">
                        <button type="button" onClick={() => void copyAccessCode(code.code)}>コピー</button>
                        {code.status === "active" && (
                          <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(
                            () => revokePwaAccessCode(getSupabaseClient(), code.id),
                            "PWA利用コードを無効化しました。",
                          )}>無効化</button>
                        )}
                      </div>
                    </article>
                  )) : <p className="admin-empty-copy">発行済みのPWA利用コードはありません。</p>}
                </div>
              </div>
            </details>
          </section>
        </>
      )}
    </main>
  );
}
