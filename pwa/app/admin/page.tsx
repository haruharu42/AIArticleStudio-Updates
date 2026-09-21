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

      <section className="tool-grid admin-tool-grid" aria-label="管理機能一覧">
        {ADMIN_SECTIONS.map((section) => (
          <Link key={section.id} className="tool-card admin-tool-card" href={section.href}>
            <span>{section.eyebrow}</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            <strong>開く →</strong>
          </Link>
        ))}
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
