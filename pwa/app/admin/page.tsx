import { Phase10AdminPage } from "@/components/phase10-admin-page";

export default function AdminPage() {
  return (
    <>
      <nav className="admin-head-actions" aria-label="管理者運用メニュー">
        <a className="primary-action" href="/admin/sales">💳 販売・決済設定</a>
        <a className="primary-action" href="/admin/operations">🛡 セキュリティ・運用を確認</a>
      </nav>
      <Phase10AdminPage />
    </>
  );
}
