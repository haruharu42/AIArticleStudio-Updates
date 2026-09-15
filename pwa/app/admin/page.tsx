import Link from "next/link";

const sections = [
  {
    href: "/admin/users",
    eyebrow: "USERS & ACCESS",
    title: "ユーザー・利用権",
    description: "ユーザー承認、停止・再開、PWA / Windows利用権、利用コードの発行と管理。",
  },
  {
    href: "/admin/free-trial",
    eyebrow: "FREE PLAN",
    title: "無料利用・回数制限",
    description: "無料ユーザーの日次回数、リセット時刻、個別利用状況を管理。",
  },
  {
    href: "/admin/sales",
    eyebrow: "SALES",
    title: "販売・アップグレード導線",
    description: "note等の購入URL、外部販売、利用コード、Stripe販売スイッチを管理。",
  },
  {
    href: "/admin/promotion",
    eyebrow: "PROMOTION",
    title: "販売促進・SNS",
    description: "販売記事、SNS投稿、キャンペーンなどのプロモーション機能。",
  },
  {
    href: "/admin/knowledge",
    eyebrow: "KNOWLEDGE",
    title: "ナレッジ管理",
    description: "ジャンル・サブジャンル候補や学習候補を確認・承認。",
  },
  {
    href: "/admin/operations",
    eyebrow: "SECURITY & OPS",
    title: "セキュリティ・運用",
    description: "セキュリティ監査、容量監視、運用イベントとシステム状態を確認。",
  },
] as const;

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

      <section className="admin-dashboard-section" aria-label="管理機能一覧">
        <div className="admin-form-grid">
          {sections.map((section) => (
            <Link key={section.href} className="choice-card compact" href={section.href}>
              <span>
                <small>{section.eyebrow}</small>
                <strong>{section.title}</strong>
                <small>{section.description}</small>
              </span>
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
