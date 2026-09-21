import Link from "next/link";

import { ADMIN_SECTIONS } from "@/lib/admin-sections";

export default function AdminPage() {
  return (
    <main className="admin-page">
      <header className="admin-head admin-dashboard-head">
        <div>
          <p className="eyebrow">ADMIN CONTROL CENTER</p>
          <h1>管理ダッシュボード</h1>
          <p>管理機能を目的別に分離しました。必要な機能だけを開いて操作できます。</p>
        </div>
        <div className="admin-head-actions">
          <Link className="route-back" href="/">← ホームへ戻る</Link>
        </div>
      </header>

      <section className="admin-only-tools-section admin-management-hub" aria-labelledby="admin-management-title">
        <div className="admin-only-tools-heading">
          <div>
            <p>ADMIN ONLY</p>
            <h2 id="admin-management-title">管理機能</h2>
          </div>
          <small>active管理者専用</small>
        </div>
        <div className="admin-only-tools-grid">
          {ADMIN_SECTIONS.map((section) => (
            <Link key={section.id} className="admin-only-tool-card" href={section.href}>
              <span>{section.eyebrow}</span>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <strong>開く →</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="admin-panel admin-dashboard-section">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">SAFETY</p>
            <h2>管理画面の安全設計</h2>
          </div>
        </div>
        <p className="trial-admin-note">
          管理ルートはactive管理者だけが表示できます。実際の管理操作もSupabase側のactive管理者判定で再確認されるため、画面を直接開くだけでは実行できません。
        </p>
      </section>
    </main>
  );
}
