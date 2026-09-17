import type { PwaAdminInvite } from "@/lib/pwa-admin-users";
import { formatAdminDate } from "@/lib/admin-users-view";

export function AdminAccessCodePanel({
  codes,
  activeCount,
  usedCount,
  busy,
  codeLabel,
  codeChannel,
  codeReference,
  codeExpiry,
  accessExpiry,
  maxUses,
  onCodeLabelChange,
  onCodeChannelChange,
  onCodeReferenceChange,
  onCodeExpiryChange,
  onAccessExpiryChange,
  onMaxUsesChange,
  onCreate,
  onCopy,
  onRevoke,
}: {
  codes: PwaAdminInvite[];
  activeCount: number;
  usedCount: number;
  busy: boolean;
  codeLabel: string;
  codeChannel: string;
  codeReference: string;
  codeExpiry: string;
  accessExpiry: string;
  maxUses: number;
  onCodeLabelChange: (value: string) => void;
  onCodeChannelChange: (value: string) => void;
  onCodeReferenceChange: (value: string) => void;
  onCodeExpiryChange: (value: string) => void;
  onAccessExpiryChange: (value: string) => void;
  onMaxUsesChange: (value: number) => void;
  onCreate: () => void;
  onCopy: (code: string) => void;
  onRevoke: (codeId: string) => void;
}) {
  return (
    <section className="admin-card admin-code-card">
      <details className="admin-tools-drawer">
        <summary>
          <span>
            <strong>販売用PWA利用コード</strong>
            <small>外部販売や個別案内で必要な場合だけ使います。</small>
          </span>
          <span className="admin-code-summary"><strong>{activeCount}</strong> 有効 / {usedCount} 利用済み</span>
        </summary>

        <div className="admin-tools-body">
          <p className="admin-tools-guide">通常のユーザー管理では、この機能を操作する必要はありません。発行したコードで付与されるPWA利用権もPC・スマホ・タブレット共通です。</p>
          <div className="admin-form-grid">
            <label className="route-field"><span>ラベル</span><input value={codeLabel} onChange={(event) => onCodeLabelChange(event.target.value)} placeholder="例: note購入者 9月" /></label>
            <label className="route-field"><span>販売チャネル</span><input value={codeChannel} onChange={(event) => onCodeChannelChange(event.target.value)} /></label>
            <label className="route-field full"><span>外部参照（任意）</span><input value={codeReference} onChange={(event) => onCodeReferenceChange(event.target.value)} /></label>
            <label className="route-field"><span>コード有効期限（任意）</span><input type="datetime-local" value={codeExpiry} onChange={(event) => onCodeExpiryChange(event.target.value)} /></label>
            <label className="route-field"><span>付与する利用権期限（任意）</span><input type="datetime-local" value={accessExpiry} onChange={(event) => onAccessExpiryChange(event.target.value)} /></label>
            <label className="route-field"><span>最大利用回数</span><input type="number" min={1} max={1000} value={maxUses} onChange={(event) => onMaxUsesChange(Math.max(1, Number(event.target.value) || 1))} /></label>
          </div>
          <button type="button" disabled={busy} onClick={onCreate}>利用コードを作成する</button>

          <div className="admin-invite-list">
            {codes.length ? codes.map((code) => (
              <article key={code.id}>
                <div className="admin-code-title">
                  <strong>{code.label || "ラベルなし"}</strong>
                  <small>{code.salesChannel}</small>
                </div>
                <code>{code.code}</code>
                <span>{code.status} / {code.useCount}/{code.maxUses}</span>
                <small>コード期限: {formatAdminDate(code.expiresAt)} / 利用権期限: {formatAdminDate(code.entitlementExpiresAt)}</small>
                <div className="admin-code-actions">
                  <button type="button" onClick={() => onCopy(code.code)}>コピー</button>
                  {code.status === "active" && (
                    <button type="button" className="secondary-action" disabled={busy} onClick={() => onRevoke(code.id)}>無効化</button>
                  )}
                </div>
              </article>
            )) : <p className="admin-empty-copy">発行済みのPWA利用コードはありません。</p>}
          </div>
        </div>
      </details>
    </section>
  );
}
