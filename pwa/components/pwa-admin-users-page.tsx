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

function isCurrent(item: PwaAdminEntitlement): boolean {
  if (item.status !== "active") return false;
  return !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now();
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
    total: users.length,
    pending: users.filter((user) => user.status === "pending").length,
    active: users.filter((user) => user.status === "active").length,
    suspended: users.filter((user) => user.status === "suspended").length,
  }), [users]);

  const codeStats = useMemo(() => ({
    active: codes.filter((code) => code.status === "active").length,
    used: codes.reduce((sum, code) => sum + code.useCount, 0),
    totalCapacity: codes.reduce((sum, code) => sum + code.maxUses, 0),
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
    }, "PWA利用コードを作成しました。コードは可能な場合クリップボードへコピーしました。");
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
          <p className="eyebrow">PWA USER MANAGEMENT</p>
          <h1>ユーザー・PWA利用権</h1>
          <p>PWA利用権、アカウント状態、Creator Club特典、販売用コードを1画面で確認・操作できます。</p>
        </div>
        {state === "ready" && (
          <div className="admin-kpi-grid" aria-label="ユーザー管理サマリー">
            <article><span>全アカウント</span><strong>{userStats.total}</strong><small>admin含む</small></article>
            <article><span>承認待ち</span><strong>{userStats.pending}</strong><small>要確認</small></article>
            <article><span>利用中</span><strong>{userStats.active}</strong><small>active</small></article>
            <article><span>停止中</span><strong>{userStats.suspended}</strong><small>suspended</small></article>
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
                <p className="eyebrow">ACCOUNTS</p>
                <h2>アカウント一覧</h2>
                <p>{filteredUsers.length}件を表示</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void run(refresh, "最新状態へ更新しました。")}>更新</button>
            </div>

            <label className="route-field full admin-search-field">
              <span>AAS ID / 表示名で検索</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AAS-000002 / 表示名" />
            </label>

            <div className="admin-filter-row" role="group" aria-label="アカウント状態で絞り込み">
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
                  <small>{user.role === "admin" ? "管理者" : "一般ユーザー"}</small>
                </button>
              )) : (
                <div className="admin-empty-state">
                  <strong>条件に一致するユーザーはいません</strong>
                  <span>検索語または状態フィルターを変更してください。</span>
                  <button type="button" onClick={() => { setSearch(""); setUserFilter("all"); }}>絞り込みを解除</button>
                </div>
              )}
            </div>
          </section>

          {selected && (
            <section className="admin-card admin-selected-card">
              <div className="admin-selected-head">
                <div>
                  <p className="eyebrow">SELECTED USER</p>
                  <h2>{selected.aasUserId}</h2>
                  <p className="admin-selected-name">{selected.displayName || "表示名なし"}</p>
                </div>
                <div className="admin-selected-badges">
                  <span className={statusClass(selected.status)}>{STATUS_LABELS[selected.status]}</span>
                  <span className="role-chip">{selected.role === "admin" ? "管理者" : "一般ユーザー"}</span>
                </div>
              </div>

              <div className="admin-user-meta-grid">
                <article><span>登録日時</span><strong>{formatDate(selected.createdAt)}</strong></article>
                <article><span>PWA利用権</span><strong>{entitlements.length ? "利用可能" : "なし"}</strong></article>
                <article><span>Creator Club</span><strong>{membershipEntitlements[0]?.productName ?? "未登録"}</strong></article>
              </div>

              {selected.role === "admin" ? (
                <div className="admin-notice-panel">
                  <strong>管理者アカウント</strong>
                  <span>一般ユーザー向けの停止・利用権操作は表示しません。</span>
                </div>
              ) : (
                <>
                  <div className="admin-actions admin-status-actions">
                    {selected.status === "pending" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "active"),
                        "アカウントを承認しました。",
                      )}>承認して利用可能にする</button>
                    )}
                    {selected.status === "active" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "suspended"),
                        "アカウントを停止しました。",
                      )}>アカウントを停止</button>
                    )}
                    {selected.status === "suspended" && (
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => setPwaAdminUserStatus(getSupabaseClient(), selected.id, "active"),
                        "アカウントを再開しました。",
                      )}>アカウントを再開</button>
                    )}
                  </div>

                  <div className="admin-subsection-head">
                    <div><h3>PWA利用権</h3><p>アプリ本体を利用できる権限です。</p></div>
                    <span className={entitlements.length ? "availability-badge active" : "availability-badge"}>
                      {entitlements.length ? "利用可能" : "未付与"}
                    </span>
                  </div>
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
                  ) : <p className="admin-empty-copy">現在有効なPWA利用権はありません。</p>}

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
                    )}>PWA利用権を付与</button>
                    <button type="button" disabled={busy || !entitlements.length} onClick={() => void run(
                      () => revokePwaEntitlement(getSupabaseClient(), selected.id),
                      "PWA利用権を取り消しました。",
                    )}>PWA利用権を取消</button>
                  </div>

                  <div className="admin-subsection-head">
                    <div><h3>note Creator Club特典</h3><p>note購入状態の自動取得は行わず、確認済みのnoteメンバーシップだけをAAS特典へ紐づけます。</p></div>
                    <span className={membershipEntitlements.length ? "availability-badge active" : "availability-badge"}>
                      {membershipEntitlements.length ? "特典有効" : "未登録"}
                    </span>
                  </div>
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
                  ) : <p className="admin-empty-copy">Creator Club特典は未登録です。</p>}

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
                    <button type="button" disabled={busy || !membershipEntitlements.length} onClick={() => void run(
                      () => clearCreatorMembershipPlan(getSupabaseClient(), selected.id),
                      "Creator Clubプランを解除しました。記事やプロフィールは削除されません。",
                    )}>Creator Clubを解除</button>
                  </div>
                </>
              )}
            </section>
          )}

          <section className="admin-card admin-code-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">ACCESS CODES</p>
                <h2>PWA利用コード</h2>
                <p>外部販売や個別案内用のコードを発行・管理します。</p>
              </div>
              <div className="admin-code-summary">
                <span><strong>{codeStats.active}</strong> 有効</span>
                <span><strong>{codeStats.used}</strong> / {codeStats.totalCapacity} 利用済み</span>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="route-field"><span>ラベル</span><input value={codeLabel} onChange={(event) => setCodeLabel(event.target.value)} placeholder="例: note購入者 9月" /></label>
              <label className="route-field"><span>販売チャネル</span><input value={codeChannel} onChange={(event) => setCodeChannel(event.target.value)} /></label>
              <label className="route-field full"><span>外部参照（任意）</span><input value={codeReference} onChange={(event) => setCodeReference(event.target.value)} /></label>
              <label className="route-field"><span>コード有効期限（任意）</span><input type="datetime-local" value={codeExpiry} onChange={(event) => setCodeExpiry(event.target.value)} /></label>
              <label className="route-field"><span>付与する利用権期限（任意）</span><input type="datetime-local" value={accessExpiry} onChange={(event) => setAccessExpiry(event.target.value)} /></label>
              <label className="route-field"><span>最大利用回数</span><input type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value) || 1))} /></label>
            </div>
            <button type="button" disabled={busy} onClick={() => void createCode()}>PWA利用コードを作成</button>

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
                      <button type="button" disabled={busy} onClick={() => void run(
                        () => revokePwaAccessCode(getSupabaseClient(), code.id),
                        "PWA利用コードを無効化しました。",
                      )}>無効化</button>
                    )}
                  </div>
                </article>
              )) : <p className="admin-empty-copy">発行済みのPWA利用コードはありません。</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
