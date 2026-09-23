"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getMembershipSettings,
  listMembershipFeatures,
  listMembershipPlanFeatures,
  listMembershipPlans,
  setMembershipPlanFeature,
  updateMembershipSettings,
  type MembershipFeature,
  type MembershipPlan,
  type MembershipPlanFeature,
  type MembershipSettings,
} from "@/lib/admin-membership";
import {
  CREATOR_MEMBERSHIP_PLANS,
  clearCreatorMembershipPlan,
  listCreatorMembershipEntitlements,
  listPwaAdminUsers,
  setCreatorMembershipPlan,
  type CreatorMembershipPlanCode,
  type PwaAdminEntitlement,
  type PwaAdminUser,
} from "@/lib/pwa-admin-users";
import { getSupabaseClient } from "@/lib/supabase";

type LoadState = "loading" | "ready" | "error";

const EMPTY_SETTINGS: MembershipSettings = {
  displayName: "noteメンバーシップ",
  noteMembershipUrl: "",
  guidance: "",
  updatedAt: null,
};

function currentFeatureEnabled(
  planCode: string,
  featureKey: string,
  mappings: readonly MembershipPlanFeature[],
): boolean {
  return mappings.some((item) =>
    item.planCode === planCode
    && item.featureKey === featureKey
    && item.enabled
  );
}

function formatDate(value: string | null): string {
  if (!value) return "期限なし";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "—";
}

export function AdminMembershipPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<MembershipSettings>(EMPTY_SETTINGS);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [features, setFeatures] = useState<MembershipFeature[]>([]);
  const [planFeatures, setPlanFeatures] = useState<MembershipPlanFeature[]>([]);
  const [users, setUsers] = useState<PwaAdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [membershipEntitlements, setMembershipEntitlements] = useState<PwaAdminEntitlement[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<CreatorMembershipPlanCode>("CREATOR_CLUB");
  const [membershipExpiry, setMembershipExpiry] = useState("");
  const [membershipReference, setMembershipReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => user.role === "user")
      .filter((user) => !query
        || user.aasUserId.toLowerCase().includes(query)
        || (user.displayName ?? "").toLowerCase().includes(query))
      .slice(0, 100);
  }, [search, users]);

  const activeFeatures = useMemo(
    () => features.filter((feature) => feature.status === "active"),
    [features],
  );

  const loadMembership = useCallback(async () => {
    const client = getSupabaseClient();
    const [nextSettings, nextPlans, nextFeatures, nextPlanFeatures, nextUsers] = await Promise.all([
      getMembershipSettings(client),
      listMembershipPlans(client),
      listMembershipFeatures(client),
      listMembershipPlanFeatures(client),
      listPwaAdminUsers(client),
    ]);
    setSettings(nextSettings);
    setPlans(nextPlans);
    setFeatures(nextFeatures);
    setPlanFeatures(nextPlanFeatures);
    setUsers(nextUsers);
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadMembership().then(
        () => { if (active) setState("ready"); },
        (error: unknown) => {
          if (!active) return;
          setState("error");
          setMessage(error instanceof Error
            ? error.message
            : "メンバーシップ管理を読み込めませんでした。新しいSupabase migrationが未適用の場合は、リリース工程で適用してください。");
        },
      );
    });
    return () => { active = false; };
  }, [loadMembership]);

  const selectUser = async (user: PwaAdminUser) => {
    setSelectedUserId(user.id);
    setMessage("");
    try {
      const items = await listCreatorMembershipEntitlements(getSupabaseClient(), user.id);
      setMembershipEntitlements(items);
    } catch (error) {
      setMembershipEntitlements([]);
      setMessage(error instanceof Error ? error.message : "メンバー特典を取得できませんでした。");
    }
  };

  const saveSettings = async () => {
    if (busy) return;
    if (!settings.displayName.trim()) {
      setMessage("メンバーシップ表示名を入力してください。");
      return;
    }
    if (settings.noteMembershipUrl && !settings.noteMembershipUrl.startsWith("https://note.com/")) {
      setMessage("noteメンバーシップURLは https://note.com/ で始まるURLを入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await updateMembershipSettings(getSupabaseClient(), settings);
      await loadMembership();
      setMessage("メンバーシップ基本設定を保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "メンバーシップ設定を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const toggleFeature = async (plan: MembershipPlan, feature: MembershipFeature) => {
    if (busy) return;
    const enabled = currentFeatureEnabled(plan.planCode, feature.featureKey, planFeatures);
    const nextEnabled = !enabled;
    if (!window.confirm(
      `${plan.displayName}の「${feature.displayName}」を${nextEnabled ? "利用可能" : "利用不可"}に変更しますか？`
    )) return;

    setBusy(true);
    setMessage("");
    try {
      await setMembershipPlanFeature(getSupabaseClient(), {
        planCode: plan.planCode,
        featureKey: feature.featureKey,
        enabled: nextEnabled,
      });
      setPlanFeatures(await listMembershipPlanFeatures(getSupabaseClient()));
      setMessage(`${plan.displayName}の「${feature.displayName}」を${nextEnabled ? "ON" : "OFF"}にしました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "特典機能を変更できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const assignMembership = async () => {
    if (!selectedUser || busy) return;
    const current = membershipEntitlements[0]?.productName;
    const label = CREATOR_MEMBERSHIP_PLANS.find((plan) => plan.code === selectedPlan)?.label ?? selectedPlan;
    if (!window.confirm(
      current
        ? `${selectedUser.aasUserId} のメンバー特典を「${label}」へ変更しますか？`
        : `${selectedUser.aasUserId} に「${label}」を付与しますか？`
    )) return;

    setBusy(true);
    setMessage("");
    try {
      await setCreatorMembershipPlan(getSupabaseClient(), selectedUser.id, {
        planCode: selectedPlan,
        expiresAt: membershipExpiry ? new Date(membershipExpiry).toISOString() : undefined,
        salesChannel: "note-membership-admin",
        externalReference: membershipReference.trim() || undefined,
      });
      const items = await listCreatorMembershipEntitlements(getSupabaseClient(), selectedUser.id);
      setMembershipEntitlements(items);
      setMessage(`${selectedUser.aasUserId} に${label}特典を設定しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "メンバー特典を設定できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const revokeMembership = async () => {
    if (!selectedUser || !membershipEntitlements.length || busy) return;
    if (!window.confirm(
      `${selectedUser.aasUserId} のメンバーシップ特典を取り消しますか？\nAASの通常利用権は取り消しません。`
    )) return;

    setBusy(true);
    setMessage("");
    try {
      await clearCreatorMembershipPlan(getSupabaseClient(), selectedUser.id);
      setMembershipEntitlements([]);
      setMessage(`${selectedUser.aasUserId} のメンバーシップ特典を取り消しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "メンバー特典を取り消せませんでした。");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;

  return (
    <main className="admin-page admin-membership-page">
      <header className="admin-head">
        <div>
          <p className="eyebrow">MEMBERSHIP CONTROL</p>
          <h1>メンバーシップ管理</h1>
          <p>noteメンバー特典の付与・取消、プラン別機能、参加URLを1か所で管理します。</p>
        </div>
        <div className="admin-head-actions">
          <Link className="route-back" href="/admin">← 管理ダッシュボード</Link>
        </div>
      </header>

      {state === "error" && (
        <div className="route-notice error" role="alert">
          {message || "メンバーシップ管理を読み込めませんでした。"}
        </div>
      )}

      <section className="admin-panel membership-admin-section">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">STEP 1</p>
            <h2>noteメンバーシップ基本設定</h2>
          </div>
          <span className="availability-badge">参加導線</span>
        </div>
        <p className="trial-admin-note">ユーザーへ案内するnoteメンバーシップの名称・URL・説明を設定します。</p>
        <div className="admin-form-grid">
          <label className="route-field">
            <span>表示名</span>
            <input
              value={settings.displayName}
              onChange={(event) => setSettings((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="例: はるくん。Creator Club"
            />
          </label>
          <label className="route-field">
            <span>noteメンバーシップURL</span>
            <input
              type="url"
              value={settings.noteMembershipUrl}
              onChange={(event) => setSettings((current) => ({ ...current, noteMembershipUrl: event.target.value }))}
              placeholder="https://note.com/..."
            />
          </label>
          <label className="route-field full">
            <span>ユーザー向け案内（任意）</span>
            <textarea
              value={settings.guidance}
              onChange={(event) => setSettings((current) => ({ ...current, guidance: event.target.value.slice(0, 1000) }))}
              placeholder="例: メンバーになるとクラウド画像保存や限定機能を利用できます。"
            />
          </label>
        </div>
        <div className="admin-actions">
          <button type="button" disabled={busy || state !== "ready"} onClick={() => void saveSettings()}>基本設定を保存</button>
          {settings.noteMembershipUrl && (
            <a className="secondary-action" href={settings.noteMembershipUrl} target="_blank" rel="noreferrer">設定URLを確認 ↗</a>
          )}
        </div>
      </section>

      <section className="admin-panel membership-admin-section">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">STEP 2</p>
            <h2>プランごとの利用可能機能</h2>
          </div>
          <span className="availability-badge active">DB側でも判定</span>
        </div>
        <p className="trial-admin-note">
          OFFにした機能は、今後 <code>has_creator_membership_feature()</code> を使う機能ゲートから利用不可にできます。
        </p>
        <div className="membership-feature-matrix">
          <div className="membership-feature-row membership-feature-head">
            <div>特典機能</div>
            {plans.map((plan) => <div key={plan.planCode}>{plan.displayName}</div>)}
          </div>
          {activeFeatures.map((feature) => (
            <div className="membership-feature-row" key={feature.featureKey}>
              <div className="membership-feature-copy">
                <strong>{feature.displayName}</strong>
                <small>{feature.description}</small>
                <code>{feature.featureKey}</code>
              </div>
              {plans.map((plan) => {
                const enabled = currentFeatureEnabled(plan.planCode, feature.featureKey, planFeatures);
                return (
                  <div key={plan.planCode}>
                    <button
                      type="button"
                      className={enabled ? "membership-feature-toggle enabled" : "membership-feature-toggle"}
                      aria-pressed={enabled}
                      disabled={busy || state !== "ready"}
                      onClick={() => void toggleFeature(plan, feature)}
                    >
                      {enabled ? "利用可" : "利用不可"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel membership-admin-section">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">STEP 3</p>
            <h2>ユーザーへメンバー特典を付与</h2>
          </div>
          <span className="availability-badge">手動確認</span>
        </div>
        <p className="trial-admin-note">
          note側の加入状態は自動取得せず、管理者が確認できたユーザーへ付与します。PWA利用権とは別管理です。
        </p>

        <label className="route-field full">
          <span>ユーザー検索</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="AAS ID または表示名"
          />
        </label>

        <div className="membership-user-list">
          {filteredUsers.map((user) => (
            <button
              type="button"
              key={user.id}
              className={selectedUserId === user.id ? "selected" : ""}
              onClick={() => void selectUser(user)}
            >
              <strong>{user.aasUserId}</strong>
              <span>{user.displayName || "表示名なし"}</span>
              <small>{user.status}</small>
            </button>
          ))}
          {!filteredUsers.length && <p className="admin-empty-copy">該当するユーザーはいません。</p>}
        </div>

        {selectedUser && (
          <div className="membership-user-editor">
            <div className="membership-user-current">
              <div><span>選択中</span><strong>{selectedUser.aasUserId}</strong></div>
              <div>
                <span>現在の特典</span>
                <strong>{membershipEntitlements[0]?.productName ?? "未付与"}</strong>
                <small>{membershipEntitlements[0] ? `期限: ${formatDate(membershipEntitlements[0].expiresAt)}` : "—"}</small>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="route-field">
                <span>付与するプラン</span>
                <select
                  value={selectedPlan}
                  onChange={(event) => setSelectedPlan(event.target.value as CreatorMembershipPlanCode)}
                >
                  {CREATOR_MEMBERSHIP_PLANS.map((plan) => (
                    <option key={plan.code} value={plan.code}>{plan.label}</option>
                  ))}
                </select>
              </label>
              <label className="route-field">
                <span>特典期限（任意）</span>
                <input
                  type="datetime-local"
                  value={membershipExpiry}
                  onChange={(event) => setMembershipExpiry(event.target.value)}
                />
              </label>
              <label className="route-field full">
                <span>note確認メモ・参照番号（任意）</span>
                <input
                  value={membershipReference}
                  onChange={(event) => setMembershipReference(event.target.value.slice(0, 255))}
                  placeholder="例: 2026-09-23 note加入確認"
                />
              </label>
            </div>

            <div className="admin-actions">
              <button type="button" disabled={busy} onClick={() => void assignMembership()}>
                {membershipEntitlements.length ? "プランを変更・更新" : "メンバー特典を付与"}
              </button>
              {membershipEntitlements.length > 0 && (
                <button className="secondary-action" type="button" disabled={busy} onClick={() => void revokeMembership()}>
                  メンバー特典を取り消す
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="admin-panel membership-admin-section membership-recommendations">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">RECOMMENDED NEXT</p>
            <h2>今後追加すると便利な管理</h2>
          </div>
        </div>
        <div className="membership-recommendation-grid">
          <article><strong>期限切れ予定</strong><p>7日以内に期限が切れるメンバーを一覧表示・更新できるようにする。</p></article>
          <article><strong>クラウド容量</strong><p>メンバーごとの画像保存容量と使用量を確認し、プラン別上限を設定する。</p></article>
          <article><strong>加入確認履歴</strong><p>誰が・いつ・どの根拠で特典を付与/解除したかを専用監査ログで確認する。</p></article>
        </div>
      </section>

      {message && state !== "error" && (
        <div className="route-notice" role="status" aria-live="polite">{message}</div>
      )}
    </main>
  );
}
