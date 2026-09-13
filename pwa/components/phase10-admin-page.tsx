"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase";
import {
  PWA_PRODUCT,
  WINDOWS_PRODUCT,
  createPwaInvite,
  grantEntitlement,
  listAdminUsers,
  listPwaInvites,
  listUserEntitlements,
  revokeEntitlement,
  revokePwaInvite,
  setAdminUserStatus,
  type AdminEntitlement,
  type AdminInvite,
  type AdminUser,
} from "@/lib/phase10-admin";

type Gate =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "denied" }
  | { kind: "ready"; aasId: string }
  | { kind: "error"; message: string };

type StatusFilter = "all" | AdminUser["status"];
type RoleFilter = "all" | AdminUser["role"];
type AccessFilter = "all" | "pwa" | "windows" | "both" | "none";
type InviteFilter = "all" | "usable" | "expired" | "exhausted" | "revoked";
type OverviewState = "idle" | "loading" | "ready" | "partial";

type AccessFlags = {
  pwa: boolean;
  windows: boolean;
  implicitAdmin: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fmtDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status: AdminUser["status"]): string {
  if (status === "pending") return "承認待ち";
  if (status === "active") return "利用中";
  if (status === "suspended") return "停止中";
  return "無効";
}

function roleLabel(role: AdminUser["role"]): string {
  return role === "admin" ? "管理者" : "一般ユーザー";
}

function entitlementStatusLabel(status: string): string {
  if (status === "active") return "有効";
  if (status === "revoked") return "取消済み";
  if (status === "expired") return "期限切れ";
  return status;
}

function inviteStatusLabel(invite: AdminInvite): string {
  if (invite.status === "revoked") return "無効";
  if (invite.status === "exhausted") return "上限到達";
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) return "期限切れ";
  return "利用可能";
}

function expiresWithin(value: string | null, days: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  const now = Date.now();
  return Number.isFinite(time) && time > now && time <= now + days * DAY_MS;
}

function isCurrentEntitlement(item: AdminEntitlement): boolean {
  if (item.status !== "active") return false;
  if (!item.expiresAt) return true;
  const time = new Date(item.expiresAt).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function isUsableInvite(invite: AdminInvite): boolean {
  if (invite.status !== "active") return false;
  if (!invite.expiresAt) return true;
  const time = new Date(invite.expiresAt).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function nearestExpiry(items: AdminEntitlement[]): string | null {
  const times = items
    .filter((item) => isCurrentEntitlement(item) && item.expiresAt)
    .map((item) => item.expiresAt as string)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return times[0] ?? null;
}

async function loadEntitlementOverview(users: AdminUser[]): Promise<{
  map: Record<string, AdminEntitlement[]>;
  partial: boolean;
}> {
  const client = getSupabaseClient();
  const targets = users.filter((user) => user.role === "user");
  const entries: Array<[string, AdminEntitlement[]]> = [];
  let partial = false;

  for (let index = 0; index < targets.length; index += 6) {
    const batch = targets.slice(index, index + 6);
    const results = await Promise.allSettled(
      batch.map(async (user) => [user.id, await listUserEntitlements(client, user.id)] as [string, AdminEntitlement[]]),
    );
    results.forEach((result, resultIndex) => {
      if (result.status === "fulfilled") {
        entries.push(result.value);
      } else {
        partial = true;
        entries.push([batch[resultIndex].id, []]);
      }
    });
  }

  return { map: Object.fromEntries(entries), partial };
}

export function Phase10AdminPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entitlementsByUser, setEntitlementsByUser] = useState<Record<string, AdminEntitlement[]>>({});
  const [overviewState, setOverviewState] = useState<OverviewState>("idle");
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [grantSalesChannel, setGrantSalesChannel] = useState("admin");
  const [grantExternalReference, setGrantExternalReference] = useState("");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteSalesChannel, setInviteSalesChannel] = useState("admin-invite");
  const [inviteExternalReference, setInviteExternalReference] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [inviteEntitlementExpiry, setInviteEntitlementExpiry] = useState("");
  const [maxUses, setMaxUses] = useState(1);

  const selected = useMemo(
    () => users.find((user) => user.id === selectedId) ?? null,
    [users, selectedId],
  );

  const selectedEntitlements = selected ? entitlementsByUser[selected.id] ?? [] : [];

  const accessFor = useCallback((user: AdminUser): AccessFlags => {
    if (user.role === "admin" && user.status === "active") {
      return { pwa: true, windows: true, implicitAdmin: true };
    }
    const items = entitlementsByUser[user.id] ?? [];
    return {
      pwa: items.some((item) => item.productCode === PWA_PRODUCT && isCurrentEntitlement(item)),
      windows: items.some((item) => item.productCode === WINDOWS_PRODUCT && isCurrentEntitlement(item)),
      implicitAdmin: false,
    };
  }, [entitlementsByUser]);

  const reloadBase = useCallback(async () => {
    const client = getSupabaseClient();
    const [nextUsers, nextInvites] = await Promise.all([
      listAdminUsers(client),
      listPwaInvites(client),
    ]);
    setUsers(nextUsers);
    setInvites(nextInvites);
    setOverviewState("loading");
    const overview = await loadEntitlementOverview(nextUsers);
    setEntitlementsByUser(overview.map);
    setOverviewState(overview.partial ? "partial" : "ready");
  }, []);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const client = getSupabaseClient();
        const {
          data: { user },
          error,
        } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) {
          setGate({ kind: "signed_out" });
          return;
        }
        const { data, error: profileError } = await client
          .from("profiles")
          .select("id,aas_user_id,role,status")
          .eq("id", user.id)
          .single();
        if (profileError || !data || data.id !== user.id) {
          throw new Error("管理者プロフィールを確認できません。");
        }
        if (data.role !== "admin" || data.status !== "active") {
          setGate({ kind: "denied" });
          return;
        }
        await reloadBase();
        if (active) setGate({ kind: "ready", aasId: data.aas_user_id });
      } catch (error) {
        if (active) {
          setGate({
            kind: "error",
            message: error instanceof Error ? error.message : "管理画面の初期化に失敗しました。",
          });
        }
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, [reloadBase]);

  const reload = async () => {
    setBusy(true);
    setMessage("");
    try {
      await reloadBase();
      setMessage("最新の管理データへ更新しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const selectUser = async (user: AdminUser) => {
    setSelectedId(user.id);
    setMessage("");
    if (user.role === "admin") return;
    try {
      const next = await listUserEntitlements(getSupabaseClient(), user.id);
      setEntitlementsByUser((current) => ({ ...current, [user.id]: next }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "利用権を取得できませんでした。");
    }
  };

  const runUserAction = async (action: () => Promise<void>) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      await reloadBase();
      setMessage("更新しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const makeInvite = async () => {
    setBusy(true);
    setMessage("");
    try {
      const invite = await createPwaInvite(getSupabaseClient(), {
        label: inviteLabel,
        salesChannel: inviteSalesChannel,
        externalReference: inviteExternalReference,
        expiresAt: inviteExpiry ? new Date(inviteExpiry).toISOString() : undefined,
        entitlementExpiresAt: inviteEntitlementExpiry
          ? new Date(inviteEntitlementExpiry).toISOString()
          : undefined,
        maxUses,
      });
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(invite.code).catch(() => undefined);
      }
      setMessage(`招待コードを作成しました: ${invite.code}`);
      setInviteLabel("");
      setInviteExternalReference("");
      setInvites(await listPwaInvites(getSupabaseClient()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "招待コード作成に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const disableInvite = async (inviteId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await revokePwaInvite(getSupabaseClient(), inviteId);
      setInvites(await listPwaInvites(getSupabaseClient()));
      setMessage("招待コードを無効化しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "招待コードを無効化できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const copyInviteCode = async (invite: AdminInvite) => {
    if (!navigator.clipboard) {
      setMessage("このブラウザーでは自動コピーできません。コードを長押ししてコピーしてください。");
      return;
    }
    try {
      await navigator.clipboard.writeText(invite.code);
      setMessage("招待コードをコピーしました。");
    } catch {
      setMessage("招待コードをコピーできませんでした。");
    }
  };

  const pendingUsers = useMemo(() => users.filter((user) => user.status === "pending"), [users]);
  const suspendedUsers = useMemo(() => users.filter((user) => user.status === "suspended"), [users]);
  const pwaUsers = useMemo(
    () => users.filter((user) => user.role === "user" && user.status === "active" && accessFor(user).pwa),
    [users, accessFor],
  );
  const windowsUsers = useMemo(
    () => users.filter((user) => user.role === "user" && user.status === "active" && accessFor(user).windows),
    [users, accessFor],
  );
  const usableInvites = useMemo(() => invites.filter(isUsableInvite), [invites]);

  const expiringUsers = useMemo(() => {
    return users
      .filter((user) => user.role === "user")
      .map((user) => ({ user, expiry: nearestExpiry(entitlementsByUser[user.id] ?? []) }))
      .filter((item): item is { user: AdminUser; expiry: string } => Boolean(item.expiry && expiresWithin(item.expiry, 7)))
      .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  }, [users, entitlementsByUser]);

  const expiringInvites = useMemo(
    () => invites.filter((invite) => isUsableInvite(invite) && expiresWithin(invite.expiresAt, 7)),
    [invites],
  );

  const channelSummary = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(entitlementsByUser)
      .flat()
      .filter(isCurrentEntitlement)
      .forEach((item) => {
        const label = item.salesChannel || "未設定";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [entitlementsByUser]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (query) {
        const haystack = `${user.aasUserId} ${user.displayName ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (accessFilter !== "all") {
        const access = accessFor(user);
        if (accessFilter === "pwa" && !access.pwa) return false;
        if (accessFilter === "windows" && !access.windows) return false;
        if (accessFilter === "both" && !(access.pwa && access.windows)) return false;
        if (accessFilter === "none" && (access.pwa || access.windows)) return false;
      }
      return true;
    });
  }, [users, search, statusFilter, roleFilter, accessFilter, accessFor]);

  const filteredInvites = useMemo(() => {
    return invites.filter((invite) => {
      if (inviteFilter === "all") return true;
      if (inviteFilter === "usable") return isUsableInvite(invite);
      if (inviteFilter === "expired") return invite.status === "active" && !isUsableInvite(invite);
      return invite.status === inviteFilter;
    });
  }, [invites, inviteFilter]);

  const clearUserFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
    setAccessFilter("all");
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page">
        <section className="standalone-card">
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>管理ダッシュボード</h1>
          {gate.kind === "loading" && <p className="route-notice">管理者権限を確認しています…</p>}
          {gate.kind === "signed_out" && <p className="route-notice error">先にログインしてください。</p>}
          {gate.kind === "denied" && <p className="route-notice error">active管理者のみ利用できます。</p>}
          {gate.kind === "error" && <p className="route-notice error">{gate.message}</p>}
          <a className="route-back" href="/">← ホームへ戻る</a>
        </section>
      </main>
    );
  }

  const attentionCount = pendingUsers.length + expiringUsers.length + expiringInvites.length;

  return (
    <main className="admin-page admin-dashboard-page">
      <header className="admin-head admin-dashboard-head">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>管理ダッシュボード</h1>
          <p>{gate.aasId} / ユーザー・利用権・PWA招待をひとつの画面で確認できます。</p>
        </div>
        <div className="admin-head-actions">
          <button disabled={busy} type="button" className="secondary-action" onClick={() => void reload()}>
            最新情報に更新
          </button>
          <a className="route-back" href="/">← ホーム</a>
        </div>
      </header>

      {message && <div className="route-notice">{message}</div>}
      {overviewState === "partial" && (
        <div className="route-notice error">一部ユーザーの利用権集計を取得できませんでした。個別ユーザーを開くと再取得できます。</div>
      )}

      <section className="admin-dashboard-section" aria-labelledby="admin-summary-title">
        <div className="admin-section-heading">
          <div><p className="eyebrow">OVERVIEW</p><h2 id="admin-summary-title">運用サマリー</h2></div>
          <small>{overviewState === "loading" ? "利用権を集計しています…" : "現在の管理対象をリアルタイム集計"}</small>
        </div>
        <div className="admin-summary-grid">
          <button type="button" className="admin-summary-card" onClick={clearUserFilters}>
            <span>総ユーザー</span><strong>{users.length}</strong><small>管理者を含む登録数</small>
          </button>
          <button type="button" className={pendingUsers.length ? "admin-summary-card alert" : "admin-summary-card"} onClick={() => { setStatusFilter("pending"); setRoleFilter("all"); setAccessFilter("all"); }}>
            <span>承認待ち</span><strong>{pendingUsers.length}</strong><small>対応が必要な登録</small>
          </button>
          <button type="button" className="admin-summary-card" onClick={() => { setStatusFilter("active"); setRoleFilter("user"); setAccessFilter("pwa"); }}>
            <span>PWA利用者</span><strong>{pwaUsers.length}</strong><small>有効な一般ユーザー</small>
          </button>
          <button type="button" className="admin-summary-card" onClick={() => { setStatusFilter("active"); setRoleFilter("user"); setAccessFilter("windows"); }}>
            <span>Windows利用者</span><strong>{windowsUsers.length}</strong><small>有効な一般ユーザー</small>
          </button>
          <button type="button" className={suspendedUsers.length ? "admin-summary-card warning" : "admin-summary-card"} onClick={() => { setStatusFilter("suspended"); setRoleFilter("all"); setAccessFilter("all"); }}>
            <span>停止中</span><strong>{suspendedUsers.length}</strong><small>再開・確認対象</small>
          </button>
          <a className="admin-summary-card" href="#admin-invites">
            <span>利用可能な招待</span><strong>{usableInvites.length}</strong><small>現在使用できるコード</small>
          </a>
        </div>
      </section>

      <section className="admin-operations-grid admin-dashboard-section">
        <article className="admin-panel admin-attention-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">ACTION</p><h2>要対応</h2></div>
            <span className={attentionCount ? "admin-count-badge alert" : "admin-count-badge"}>{attentionCount}</span>
          </div>
          {attentionCount === 0 && <div className="admin-empty-state"><strong>現在、急ぎの対応はありません。</strong><span>承認待ちや7日以内の期限切れが発生するとここへ表示されます。</span></div>}
          <div className="admin-attention-list">
            {pendingUsers.slice(0, 4).map((user) => (
              <button key={`pending-${user.id}`} type="button" onClick={() => void selectUser(user)}>
                <span className="admin-attention-icon">!</span>
                <span><strong>{user.aasUserId} の承認待ち</strong><small>{user.displayName || "名称未設定"} / 登録 {fmtDate(user.createdAt)}</small></span>
              </button>
            ))}
            {expiringUsers.slice(0, 4).map(({ user, expiry }) => (
              <button key={`expiry-${user.id}`} type="button" onClick={() => void selectUser(user)}>
                <span className="admin-attention-icon clock">7</span>
                <span><strong>{user.aasUserId} の利用権期限が近い</strong><small>{fmt(expiry)} に期限到達</small></span>
              </button>
            ))}
            {expiringInvites.slice(0, 3).map((invite) => (
              <a key={`invite-${invite.id}`} href="#admin-invites">
                <span className="admin-attention-icon clock">7</span>
                <span><strong>{invite.label || "PWA招待"} の期限が近い</strong><small>{fmt(invite.expiresAt)} / {invite.useCount}/{invite.maxUses} 使用</small></span>
              </a>
            ))}
          </div>
        </article>

        <article className="admin-panel admin-channel-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">ACCESS</p><h2>利用権・販売状況</h2></div>
            <span className="admin-count-badge">{pwaUsers.length + windowsUsers.length}</span>
          </div>
          <div className="admin-platform-summary">
            <div><span>PWA</span><strong>{pwaUsers.length}</strong><small>有効ユーザー</small></div>
            <div><span>Windows</span><strong>{windowsUsers.length}</strong><small>有効ユーザー</small></div>
          </div>
          <h3>販売チャネル別・有効利用権</h3>
          {channelSummary.length === 0 ? (
            <p className="panel-muted">有効な一般ユーザー利用権はありません。</p>
          ) : (
            <div className="admin-channel-list">
              {channelSummary.map(([channel, count]) => <div key={channel}><span>{channel}</span><strong>{count}</strong></div>)}
            </div>
          )}
        </article>
      </section>

      <section className="admin-workspace admin-dashboard-section" aria-labelledby="admin-users-title">
        <article className="admin-panel admin-users-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">USERS</p><h2 id="admin-users-title">ユーザー管理</h2></div>
            <span className="admin-count-badge">{filteredUsers.length}/{users.length}</span>
          </div>
          <div className="admin-filter-grid">
            <label className="admin-filter-control admin-filter-search">
              <span>AAS ID・表示名</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="例: AAS-000002" />
            </label>
            <label className="admin-filter-control">
              <span>状態</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">すべて</option><option value="pending">承認待ち</option><option value="active">利用中</option><option value="suspended">停止中</option><option value="disabled">無効</option>
              </select>
            </label>
            <label className="admin-filter-control">
              <span>区分</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
                <option value="all">すべて</option><option value="user">一般ユーザー</option><option value="admin">管理者</option>
              </select>
            </label>
            <label className="admin-filter-control">
              <span>利用環境</span>
              <select disabled={overviewState === "loading"} value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}>
                <option value="all">すべて</option><option value="pwa">PWA利用可</option><option value="windows">Windows利用可</option><option value="both">両方利用可</option><option value="none">利用権なし</option>
              </select>
            </label>
          </div>
          <button type="button" className="admin-clear-filters" onClick={clearUserFilters}>絞り込みを解除</button>

          <div className="admin-user-list admin-user-list-modern">
            {filteredUsers.map((user) => {
              const access = accessFor(user);
              return (
                <button key={user.id} className={user.id === selectedId ? "admin-user active" : "admin-user"} type="button" onClick={() => void selectUser(user)}>
                  <span className="admin-user-top">
                    <span><strong>{user.aasUserId}</strong><small>{user.displayName || "名称未設定"}</small></span>
                    <span className={`admin-status-pill ${user.status}`}>{statusLabel(user.status)}</span>
                  </span>
                  <span className="admin-user-badges">
                    <span className="admin-badge neutral">{roleLabel(user.role)}</span>
                    {access.pwa && <span className="admin-badge pwa">PWA ✓</span>}
                    {access.windows && <span className="admin-badge windows">Windows ✓</span>}
                    {!access.pwa && !access.windows && <span className="admin-badge muted">利用権なし</span>}
                  </span>
                  <span className="admin-user-date">登録 {fmtDate(user.createdAt)}</span>
                </button>
              );
            })}
            {filteredUsers.length === 0 && <div className="admin-empty-state compact"><strong>条件に一致するユーザーはいません。</strong><span>絞り込み条件を変更してください。</span></div>}
          </div>
        </article>

        <article className="admin-panel admin-detail-panel">
          <div className="admin-panel-heading">
            <div><p className="eyebrow">DETAIL</p><h2>アカウント詳細</h2></div>
          </div>
          {!selected && <div className="admin-empty-state"><strong>ユーザーを選択してください。</strong><span>左の一覧から選ぶと、状態・利用権・管理操作を確認できます。</span></div>}
          {selected && (
            <>
              <div className="admin-selected-hero">
                <div><span>{roleLabel(selected.role)}</span><h3>{selected.aasUserId}</h3><p>{selected.displayName || "名称未設定"}</p></div>
                <span className={`admin-status-pill large ${selected.status}`}>{statusLabel(selected.status)}</span>
              </div>

              <div className="admin-account-facts">
                <div><span>登録日</span><strong>{fmtDate(selected.createdAt)}</strong></div>
                <div><span>アカウント区分</span><strong>{roleLabel(selected.role)}</strong></div>
              </div>

              <div className="admin-access-summary">
                <div className={accessFor(selected).pwa ? "active" : ""}><span>PWA</span><strong>{accessFor(selected).pwa ? "利用可" : "なし"}</strong></div>
                <div className={accessFor(selected).windows ? "active" : ""}><span>Windows</span><strong>{accessFor(selected).windows ? "利用可" : "なし"}</strong></div>
              </div>
              {accessFor(selected).implicitAdmin && <p className="admin-inline-note">管理者はactive状態の間、個別利用権がなくてもPWA・Windowsの両方を利用できます。</p>}

              <div className="admin-actions admin-primary-actions">
                {selected.status === "pending" && <button disabled={busy} className="primary-action" type="button" onClick={() => void runUserAction(() => setAdminUserStatus(getSupabaseClient(), selected.id, "active"))}>承認する</button>}
                {selected.status === "active" && !(selected.role === "admin" && selected.aasUserId === gate.aasId) && <button disabled={busy} className="danger-action" type="button" onClick={() => void runUserAction(() => setAdminUserStatus(getSupabaseClient(), selected.id, "suspended"))}>利用を停止</button>}
                {selected.status === "suspended" && <button disabled={busy} className="primary-action" type="button" onClick={() => void runUserAction(() => setAdminUserStatus(getSupabaseClient(), selected.id, "active"))}>利用を再開</button>}
              </div>

              {selected.role === "user" && (
                <>
                  <div className="admin-subsection-heading"><h3>利用権</h3><small>{selectedEntitlements.length}件の履歴</small></div>
                  <div className="entitlement-list admin-entitlement-list">
                    {selectedEntitlements.map((item) => (
                      <div key={item.id} className={isCurrentEntitlement(item) ? "active" : ""}>
                        <div className="admin-entitlement-top"><strong>{item.productName || item.productCode}</strong><span>{entitlementStatusLabel(item.status)}</span></div>
                        <small>{item.productCode}</small>
                        <dl><div><dt>販売チャネル</dt><dd>{item.salesChannel || "—"}</dd></div><div><dt>期限</dt><dd>{fmt(item.expiresAt)}</dd></div>{item.externalReference && <div className="full"><dt>外部参照</dt><dd>{item.externalReference}</dd></div>}</dl>
                      </div>
                    ))}
                    {selectedEntitlements.length === 0 && <div className="admin-empty-state compact"><strong>利用権履歴はありません。</strong><span>下のフォームからPWAまたはWindows利用権を付与できます。</span></div>}
                  </div>

                  <div className="admin-grant-section">
                    <div className="admin-subsection-heading"><h3>利用権を変更</h3><small>一般ユーザーのみ</small></div>
                    <div className="admin-form-grid admin-grant-form">
                      <label className="route-field"><span>販売チャネル</span><input value={grantSalesChannel} onChange={(event) => setGrantSalesChannel(event.target.value)} /></label>
                      <label className="route-field"><span>利用期限（任意）</span><input type="datetime-local" value={grantExpiry} onChange={(event) => setGrantExpiry(event.target.value)} /></label>
                      <label className="route-field full"><span>外部参照（任意）</span><input value={grantExternalReference} onChange={(event) => setGrantExternalReference(event.target.value)} /></label>
                    </div>
                    <div className="admin-actions admin-entitlement-actions">
                      <button disabled={busy} className="primary-action" type="button" onClick={() => void runUserAction(() => grantEntitlement(getSupabaseClient(), selected.id, PWA_PRODUCT, { salesChannel: grantSalesChannel, externalReference: grantExternalReference, expiresAt: grantExpiry ? new Date(grantExpiry).toISOString() : undefined }))}>PWAを付与</button>
                      <button disabled={busy} className="primary-action" type="button" onClick={() => void runUserAction(() => grantEntitlement(getSupabaseClient(), selected.id, WINDOWS_PRODUCT, { salesChannel: grantSalesChannel, externalReference: grantExternalReference, expiresAt: grantExpiry ? new Date(grantExpiry).toISOString() : undefined }))}>Windowsを付与</button>
                      <button disabled={busy} className="secondary-action" type="button" onClick={() => void runUserAction(() => revokeEntitlement(getSupabaseClient(), selected.id, PWA_PRODUCT))}>PWAを取消</button>
                      <button disabled={busy} className="secondary-action" type="button" onClick={() => void runUserAction(() => revokeEntitlement(getSupabaseClient(), selected.id, WINDOWS_PRODUCT))}>Windowsを取消</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </article>
      </section>

      <section id="admin-invites" className="admin-panel admin-invite-panel admin-dashboard-section">
        <div className="admin-panel-heading">
          <div><p className="eyebrow">INVITATIONS</p><h2>PWA招待コード</h2></div>
          <span className="admin-count-badge">{usableInvites.length} 利用可能</span>
        </div>
        <div className="admin-invite-layout">
          <div className="admin-invite-create">
            <h3>新しい招待コードを作成</h3>
            <div className="admin-form-grid">
              <label className="route-field"><span>ラベル</span><input value={inviteLabel} onChange={(event) => setInviteLabel(event.target.value)} placeholder="note購入者 2026-09" /></label>
              <label className="route-field"><span>販売チャネル</span><input value={inviteSalesChannel} onChange={(event) => setInviteSalesChannel(event.target.value)} /></label>
              <label className="route-field"><span>外部参照</span><input value={inviteExternalReference} onChange={(event) => setInviteExternalReference(event.target.value)} /></label>
              <label className="route-field"><span>最大利用回数</span><input type="number" min={1} max={10000} value={maxUses} onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label className="route-field"><span>コード期限</span><input type="datetime-local" value={inviteExpiry} onChange={(event) => setInviteExpiry(event.target.value)} /></label>
              <label className="route-field"><span>付与利用権期限</span><input type="datetime-local" value={inviteEntitlementExpiry} onChange={(event) => setInviteEntitlementExpiry(event.target.value)} /></label>
            </div>
            <button disabled={busy} className="primary-action admin-create-invite" type="button" onClick={() => void makeInvite()}>招待コードを作成</button>
          </div>

          <div className="admin-invite-manage">
            <div className="admin-subsection-heading"><h3>招待コード一覧</h3><select value={inviteFilter} onChange={(event) => setInviteFilter(event.target.value as InviteFilter)}><option value="all">すべて</option><option value="usable">利用可能</option><option value="expired">期限切れ</option><option value="exhausted">上限到達</option><option value="revoked">無効</option></select></div>
            <div className="invite-list admin-invite-list">
              {filteredInvites.map((invite) => {
                const percentage = Math.min(100, Math.round((invite.useCount / Math.max(invite.maxUses, 1)) * 100));
                return (
                  <div key={invite.id} className="invite-row admin-invite-row">
                    <div className="admin-invite-top"><div><strong>{invite.label || "PWA招待"}</strong><code>{invite.code}</code></div><span className={`admin-invite-status ${inviteStatusLabel(invite) === "利用可能" ? "active" : ""}`}>{inviteStatusLabel(invite)}</span></div>
                    <div className="admin-invite-meta"><span>{invite.salesChannel}</span><span>{invite.useCount}/{invite.maxUses} 使用</span><span>期限 {fmt(invite.expiresAt)}</span></div>
                    <div className="admin-invite-progress" aria-label={`使用率 ${percentage}%`}><span style={{ width: `${percentage}%` }} /></div>
                    <div className="admin-invite-actions"><button disabled={busy} type="button" className="secondary-action" onClick={() => void copyInviteCode(invite)}>コードをコピー</button>{invite.status === "active" && <button disabled={busy} type="button" className="danger-action" onClick={() => void disableInvite(invite.id)}>無効化</button>}</div>
                  </div>
                );
              })}
              {filteredInvites.length === 0 && <div className="admin-empty-state compact"><strong>該当する招待コードはありません。</strong><span>表示条件を変更するか、新しいコードを作成してください。</span></div>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
