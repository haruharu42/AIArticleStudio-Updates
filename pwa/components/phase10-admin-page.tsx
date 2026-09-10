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

export function Phase10AdminPage() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entitlements, setEntitlements] = useState<AdminEntitlement[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [search, setSearch] = useState("");
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

  const reloadBase = useCallback(async (filter = "") => {
    const client = getSupabaseClient();
    const [nextUsers, nextInvites] = await Promise.all([
      listAdminUsers(client, filter),
      listPwaInvites(client),
    ]);
    setUsers(nextUsers);
    setInvites(nextInvites);
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
            message:
              error instanceof Error
                ? error.message
                : "管理画面の初期化に失敗しました。",
          });
        }
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, [reloadBase]);

  const reload = async (filter = search) => {
    await reloadBase(filter);
    if (selectedId) {
      const currentUsers = await listAdminUsers(getSupabaseClient(), filter);
      if (currentUsers.some((user) => user.id === selectedId)) {
        setEntitlements(
          await listUserEntitlements(getSupabaseClient(), selectedId),
        );
      } else {
        setSelectedId("");
        setEntitlements([]);
      }
    }
  };

  const selectUser = async (user: AdminUser) => {
    setSelectedId(user.id);
    setMessage("");
    try {
      setEntitlements(
        await listUserEntitlements(getSupabaseClient(), user.id),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "利用権を取得できませんでした。",
      );
    }
  };

  const runUserAction = async (action: () => Promise<void>) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      await reloadBase(search);
      setEntitlements(
        await listUserEntitlements(getSupabaseClient(), selected.id),
      );
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
        expiresAt: inviteExpiry
          ? new Date(inviteExpiry).toISOString()
          : undefined,
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
      setMessage(
        error instanceof Error ? error.message : "招待コード作成に失敗しました。",
      );
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
      setMessage(
        error instanceof Error ? error.message : "招待コードを無効化できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  if (gate.kind !== "ready") {
    return (
      <main className="standalone-page">
        <section className="standalone-card">
          <p className="eyebrow">ADMIN · PHASE 10</p>
          <h1>管理ダッシュボード</h1>
          {gate.kind === "loading" && (
            <p className="route-notice">管理者権限を確認しています…</p>
          )}
          {gate.kind === "signed_out" && (
            <p className="route-notice error">先にログインしてください。</p>
          )}
          {gate.kind === "denied" && (
            <p className="route-notice error">active管理者のみ利用できます。</p>
          )}
          {gate.kind === "error" && (
            <p className="route-notice error">{gate.message}</p>
          )}
          <a className="route-back" href="/">← ホームへ戻る</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-head">
        <div>
          <p className="eyebrow">ADMIN · PHASE 10</p>
          <h1>共通管理ダッシュボード</h1>
          <p>{gate.aasId} / Windows・PWA利用権を共通管理</p>
        </div>
        <a className="route-back" href="/">← ホーム</a>
      </header>

      {message && <div className="route-notice">{message}</div>}

      <section className="admin-grid">
        <article className="admin-panel">
          <h2>ユーザー</h2>
          <div className="admin-search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="AAS ID（完全一致）"
            />
            <button
              type="button"
              className="secondary-action"
              onClick={() => void reload(search)}
            >
              検索
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setSearch("");
                void reload("");
              }}
            >
              全件
            </button>
          </div>
          <div className="admin-user-list">
            {users.map((user) => (
              <button
                key={user.id}
                className={
                  user.id === selectedId ? "admin-user active" : "admin-user"
                }
                type="button"
                onClick={() => void selectUser(user)}
              >
                <strong>{user.aasUserId}</strong>
                <span>{user.displayName || "名称未設定"}</span>
                <small>{user.role} / {user.status}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="admin-panel">
          <h2>アカウント・利用権</h2>
          {!selected && (
            <p className="panel-muted">左からユーザーを選択してください。</p>
          )}
          {selected && (
            <>
              <dl className="route-meta">
                <div><dt>AAS ID</dt><dd>{selected.aasUserId}</dd></div>
                <div><dt>状態</dt><dd>{selected.status}</dd></div>
              </dl>
              <div className="admin-actions">
                {selected.status === "pending" && (
                  <button
                    disabled={busy}
                    className="primary-action"
                    type="button"
                    onClick={() =>
                      void runUserAction(() =>
                        setAdminUserStatus(
                          getSupabaseClient(),
                          selected.id,
                          "active",
                        ),
                      )
                    }
                  >
                    承認
                  </button>
                )}
                {selected.status === "active" &&
                  !(selected.role === "admin" && selected.aasUserId === gate.aasId) && (
                    <button
                      disabled={busy}
                      className="danger-action"
                      type="button"
                      onClick={() =>
                        void runUserAction(() =>
                          setAdminUserStatus(
                            getSupabaseClient(),
                            selected.id,
                            "suspended",
                          ),
                        )
                      }
                    >
                      停止
                    </button>
                  )}
                {selected.status === "suspended" && (
                  <button
                    disabled={busy}
                    className="primary-action"
                    type="button"
                    onClick={() =>
                      void runUserAction(() =>
                        setAdminUserStatus(
                          getSupabaseClient(),
                          selected.id,
                          "active",
                        ),
                      )
                    }
                  >
                    再開
                  </button>
                )}
              </div>

              {selected.role === "user" && (
                <>
                  <h3>利用権</h3>
                  <div className="entitlement-list">
                    {entitlements.map((item) => (
                      <div key={item.id}>
                        <strong>{item.productCode}</strong>
                        <span>{item.status}</span>
                        <small>{item.salesChannel} / 期限 {fmt(item.expiresAt)}</small>
                      </div>
                    ))}
                    {entitlements.length === 0 && (
                      <p className="panel-muted">利用権履歴なし</p>
                    )}
                  </div>
                  <label className="route-field">
                    <span>販売チャネル</span>
                    <input
                      value={grantSalesChannel}
                      onChange={(event) => setGrantSalesChannel(event.target.value)}
                    />
                  </label>
                  <label className="route-field">
                    <span>外部参照（任意）</span>
                    <input
                      value={grantExternalReference}
                      onChange={(event) => setGrantExternalReference(event.target.value)}
                    />
                  </label>
                  <label className="route-field">
                    <span>利用期限（任意）</span>
                    <input
                      type="datetime-local"
                      value={grantExpiry}
                      onChange={(event) => setGrantExpiry(event.target.value)}
                    />
                  </label>
                  <div className="admin-actions">
                    <button
                      disabled={busy}
                      className="primary-action"
                      type="button"
                      onClick={() =>
                        void runUserAction(() =>
                          grantEntitlement(getSupabaseClient(), selected.id, WINDOWS_PRODUCT, {
                            salesChannel: grantSalesChannel,
                            externalReference: grantExternalReference,
                            expiresAt: grantExpiry
                              ? new Date(grantExpiry).toISOString()
                              : undefined,
                          }),
                        )
                      }
                    >
                      Windows付与
                    </button>
                    <button
                      disabled={busy}
                      className="primary-action"
                      type="button"
                      onClick={() =>
                        void runUserAction(() =>
                          grantEntitlement(getSupabaseClient(), selected.id, PWA_PRODUCT, {
                            salesChannel: grantSalesChannel,
                            externalReference: grantExternalReference,
                            expiresAt: grantExpiry
                              ? new Date(grantExpiry).toISOString()
                              : undefined,
                          }),
                        )
                      }
                    >
                      PWA付与
                    </button>
                    <button
                      disabled={busy}
                      className="secondary-action"
                      type="button"
                      onClick={() =>
                        void runUserAction(() =>
                          revokeEntitlement(
                            getSupabaseClient(),
                            selected.id,
                            WINDOWS_PRODUCT,
                          ),
                        )
                      }
                    >
                      Windows取消
                    </button>
                    <button
                      disabled={busy}
                      className="secondary-action"
                      type="button"
                      onClick={() =>
                        void runUserAction(() =>
                          revokeEntitlement(
                            getSupabaseClient(),
                            selected.id,
                            PWA_PRODUCT,
                          ),
                        )
                      }
                    >
                      PWA取消
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </article>
      </section>

      <section className="admin-panel admin-invite-panel">
        <h2>PWA招待コード</h2>
        <div className="admin-form-grid">
          <label className="route-field">
            <span>ラベル</span>
            <input
              value={inviteLabel}
              onChange={(event) => setInviteLabel(event.target.value)}
              placeholder="note購入者 2026-09"
            />
          </label>
          <label className="route-field">
            <span>販売チャネル</span>
            <input
              value={inviteSalesChannel}
              onChange={(event) => setInviteSalesChannel(event.target.value)}
            />
          </label>
          <label className="route-field">
            <span>外部参照</span>
            <input
              value={inviteExternalReference}
              onChange={(event) => setInviteExternalReference(event.target.value)}
            />
          </label>
          <label className="route-field">
            <span>コード期限</span>
            <input
              type="datetime-local"
              value={inviteExpiry}
              onChange={(event) => setInviteExpiry(event.target.value)}
            />
          </label>
          <label className="route-field">
            <span>付与利用権期限</span>
            <input
              type="datetime-local"
              value={inviteEntitlementExpiry}
              onChange={(event) => setInviteEntitlementExpiry(event.target.value)}
            />
          </label>
          <label className="route-field">
            <span>最大利用回数</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={maxUses}
              onChange={(event) =>
                setMaxUses(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
        </div>
        <button
          disabled={busy}
          className="primary-action"
          type="button"
          onClick={() => void makeInvite()}
        >
          招待コードを作成
        </button>
        <div className="invite-list">
          {invites.map((invite) => (
            <div key={invite.id} className="invite-row">
              <div>
                <strong>{invite.label || "PWA招待"}</strong>
                <code>{invite.code}</code>
                <small>
                  {invite.salesChannel} / {invite.useCount}/{invite.maxUses} / 期限 {fmt(invite.expiresAt)}
                </small>
              </div>
              <span>{invite.status}</span>
              {invite.status === "active" && (
                <button
                  disabled={busy}
                  type="button"
                  className="danger-action"
                  onClick={() => void disableInvite(invite.id)}
                >
                  無効化
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
