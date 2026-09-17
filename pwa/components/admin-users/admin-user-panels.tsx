import {
  CREATOR_MEMBERSHIP_PLANS,
  type CreatorMembershipPlanCode,
  type PwaAdminEntitlement,
  type PwaAdminUser,
} from "@/lib/pwa-admin-users";
import {
  USER_FILTERS,
  STATUS_LABELS,
  adminStatusClass,
  formatAdminDate,
  type UserFilter,
} from "@/lib/admin-users-view";

export function AdminUserSelectionPanel({
  users,
  selectedId,
  search,
  userFilter,
  busy,
  onSearchChange,
  onFilterChange,
  onSelect,
  onClearFilters,
  onRefresh,
}: {
  users: PwaAdminUser[];
  selectedId: string;
  search: string;
  userFilter: UserFilter;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: UserFilter) => void;
  onSelect: (user: PwaAdminUser) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="admin-card admin-accounts-card">
      <div className="admin-section-head">
        <div>
          <span className="admin-step-number">1</span>
          <h2>ユーザーを選ぶ</h2>
          <p>まず操作したいユーザーを選択します。</p>
        </div>
        <button type="button" disabled={busy} onClick={onRefresh}>更新</button>
      </div>

      <label className="route-field full admin-search-field">
        <span>検索</span>
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="AAS ID または表示名" />
      </label>

      <div className="admin-filter-row" role="group" aria-label="ユーザー状態で絞り込み">
        {USER_FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value}
            className={userFilter === filter.value ? "active" : ""}
            aria-pressed={userFilter === filter.value}
            onClick={() => onFilterChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="admin-user-list">
        {users.length ? users.map((user) => (
          <button
            type="button"
            key={user.id}
            className={selectedId === user.id ? "selected" : ""}
            onClick={() => onSelect(user)}
          >
            <span className="admin-user-id-line">
              <strong>{user.aasUserId}</strong>
              <span className={adminStatusClass(user.status)}>{STATUS_LABELS[user.status]}</span>
            </span>
            <span className="admin-user-name">{user.displayName || "表示名なし"}</span>
          </button>
        )) : (
          <div className="admin-empty-state">
            <strong>該当するユーザーはいません</strong>
            <span>検索条件を変更してください。</span>
            <button type="button" onClick={onClearFilters}>絞り込みを解除</button>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminSelectedUserPanel({
  selected,
  entitlements,
  membershipEntitlements,
  busy,
  grantChannel,
  grantReference,
  grantExpiry,
  membershipPlan,
  membershipReference,
  membershipExpiry,
  onGrantChannelChange,
  onGrantReferenceChange,
  onGrantExpiryChange,
  onMembershipPlanChange,
  onMembershipReferenceChange,
  onMembershipExpiryChange,
  onSetStatus,
  onGrantSimplePwaAccess,
  onRevokePwaAccess,
  onGrantDetailedPwaAccess,
  onSaveMembership,
  onClearMembership,
}: {
  selected: PwaAdminUser;
  entitlements: PwaAdminEntitlement[];
  membershipEntitlements: PwaAdminEntitlement[];
  busy: boolean;
  grantChannel: string;
  grantReference: string;
  grantExpiry: string;
  membershipPlan: CreatorMembershipPlanCode;
  membershipReference: string;
  membershipExpiry: string;
  onGrantChannelChange: (value: string) => void;
  onGrantReferenceChange: (value: string) => void;
  onGrantExpiryChange: (value: string) => void;
  onMembershipPlanChange: (value: CreatorMembershipPlanCode) => void;
  onMembershipReferenceChange: (value: string) => void;
  onMembershipExpiryChange: (value: string) => void;
  onSetStatus: (status: "active" | "suspended") => void;
  onGrantSimplePwaAccess: () => void;
  onRevokePwaAccess: () => void;
  onGrantDetailedPwaAccess: () => void;
  onSaveMembership: () => void;
  onClearMembership: () => void;
}) {
  return (
    <section className="admin-card admin-selected-card">
      <div className="admin-selected-head">
        <div>
          <span className="admin-step-number">2</span>
          <h2>{selected.aasUserId}</h2>
          <p className="admin-selected-name">{selected.displayName || "表示名なし"}</p>
        </div>
        <div className="admin-selected-badges">
          <span className={adminStatusClass(selected.status)}>{STATUS_LABELS[selected.status]}</span>
          <span className="role-chip">{selected.role === "admin" ? "管理者" : "一般ユーザー"}</span>
        </div>
      </div>

      <p className="admin-next-guide">通常の管理は「アカウント」「PWA利用権」「Creator Club特典」の3項目だけです。</p>

      {selected.role === "admin" ? (
        <div className="admin-notice-panel">
          <strong>管理者アカウントです</strong>
          <span>管理者はPC・スマホ・タブレットからPWAを利用できます。一般ユーザー向けの利用権操作は不要です。</span>
        </div>
      ) : (
        <div className="admin-simple-actions">
          <article className="admin-action-card">
            <div className="admin-action-card-head">
              <div>
                <span className="admin-action-index">1</span>
                <h3>アカウント</h3>
              </div>
              <span className={adminStatusClass(selected.status)}>{STATUS_LABELS[selected.status]}</span>
            </div>
            <p>{selected.status === "pending" ? "登録直後のユーザーです。利用を許可する場合は承認してください。" : selected.status === "active" ? "現在ログインして利用できる状態です。" : selected.status === "suspended" ? "現在は利用を停止しています。" : "無効状態のアカウントです。"}</p>
            {selected.status === "pending" && <button type="button" disabled={busy} onClick={() => onSetStatus("active")}>承認する</button>}
            {selected.status === "active" && <button type="button" className="secondary-action" disabled={busy} onClick={() => onSetStatus("suspended")}>利用を停止する</button>}
            {selected.status === "suspended" && <button type="button" disabled={busy} onClick={() => onSetStatus("active")}>利用を再開する</button>}
          </article>

          <article className="admin-action-card">
            <div className="admin-action-card-head">
              <div>
                <span className="admin-action-index">2</span>
                <h3>PWA利用権</h3>
              </div>
              <span className={entitlements.length ? "availability-badge active" : "availability-badge"}>
                {entitlements.length ? "全端末で利用可能" : "未付与"}
              </span>
            </div>
            <p>{entitlements.length ? "PC・スマホ・タブレットすべてでPWA版を利用できます。端末ごとの追加承認は不要です。" : "PWA利用権を1つ付与すると、PC・スマホ・タブレットすべてで利用できます。"}</p>
            {entitlements.length ? (
              <button type="button" className="secondary-action" disabled={busy} onClick={onRevokePwaAccess}>PWA利用権を取り消す</button>
            ) : (
              <button type="button" disabled={busy} onClick={onGrantSimplePwaAccess}>PWA利用権を付与する</button>
            )}
            <details className="admin-advanced-details">
              <summary>期限や付与元を指定する</summary>
              <div className="admin-form-grid admin-advanced-body">
                <label className="route-field"><span>付与元</span><input value={grantChannel} onChange={(event) => onGrantChannelChange(event.target.value)} /></label>
                <label className="route-field"><span>利用期限（任意）</span><input type="datetime-local" value={grantExpiry} onChange={(event) => onGrantExpiryChange(event.target.value)} /></label>
                <label className="route-field full"><span>外部参照（任意）</span><input value={grantReference} onChange={(event) => onGrantReferenceChange(event.target.value)} /></label>
              </div>
              <button type="button" disabled={busy || entitlements.length > 0} onClick={onGrantDetailedPwaAccess}>詳細条件で付与する</button>
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
              <select value={membershipPlan} onChange={(event) => onMembershipPlanChange(event.target.value as CreatorMembershipPlanCode)}>
                {CREATOR_MEMBERSHIP_PLANS.map((plan) => <option key={plan.code} value={plan.code}>{plan.label}</option>)}
              </select>
            </label>
            <div className="admin-actions">
              <button type="button" aria-label="Creator Clubを登録・変更" disabled={busy} onClick={onSaveMembership}>{membershipEntitlements.length ? "プランを変更する" : "特典を設定する"}</button>
              {membershipEntitlements.length > 0 && (
                <button type="button" aria-label="Creator Clubを解除" className="secondary-action" disabled={busy} onClick={onClearMembership}>特典を解除する</button>
              )}
            </div>
            <details className="admin-advanced-details">
              <summary>期限・確認メモを設定する</summary>
              <div className="admin-form-grid admin-advanced-body">
                <label className="route-field"><span>特典期限（任意）</span><input type="datetime-local" value={membershipExpiry} onChange={(event) => onMembershipExpiryChange(event.target.value)} /></label>
                <label className="route-field full"><span>note確認メモ（任意）</span><input value={membershipReference} onChange={(event) => onMembershipReferenceChange(event.target.value)} placeholder="例: 2026-09 note確認" /></label>
              </div>
            </details>
            <p className="admin-detail-note">note購入状態の自動取得は行わず、確認済みのメンバーシップだけを設定してください。</p>
          </article>
        </div>
      )}

      <details className="admin-user-details-drawer">
        <summary>このユーザーの詳細情報を見る</summary>
        <div className="admin-user-meta-grid">
          <article><span>登録日時</span><strong>{formatAdminDate(selected.createdAt)}</strong></article>
          <article><span>PWA利用権（全端末共通）</span><strong>{entitlements.length ? "利用可能" : "なし"}</strong></article>
          <article><span>Creator Club</span><strong>{membershipEntitlements[0]?.productName ?? "未登録"}</strong></article>
        </div>
        {entitlements.length > 0 && (
          <div className="admin-entitlement-list">
            {entitlements.map((item) => (
              <article key={item.id}>
                <strong>{item.productName}</strong>
                <span>{item.status}</span>
                <small>期限: {formatAdminDate(item.expiresAt)} / {item.salesChannel}</small>
              </article>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
