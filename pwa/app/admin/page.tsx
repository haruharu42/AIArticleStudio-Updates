import { Phase10AdminPage } from "@/components/phase10-admin-page";

export default function AdminPage() {
  return (
    <>
      <nav className="admin-ops-entry" aria-label="管理者運用メニュー">
        <a href="/admin/operations">🛡 セキュリティ・運用を確認</a>
      </nav>
      <Phase10AdminPage />
    </>
  );
}
