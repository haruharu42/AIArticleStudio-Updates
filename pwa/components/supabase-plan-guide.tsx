const SUPABASE_USAGE_URL = "https://supabase.com/dashboard/org/_/usage";
const SUPABASE_BILLING_URL = "https://supabase.com/dashboard/org/_/billing";
const SUPABASE_PRICING_URL = "https://supabase.com/pricing";

const JPY_REFERENCE_RATE = 157;
const JPY_REFERENCE_LABEL = "1 USD ≈ ¥157（2026-09-18終値付近）";

const plans = [
  {
    name: "Free",
    priceUsd: "$0 / 月",
    priceJpy: "約 ¥0 / 月",
    note: "開発・小規模運用向け",
    quota: "DB 500 MB / Storage 1 GB / MAU 50,000 / Egress 5 GB / Edge Functions 500,000回",
  },
  {
    name: "Pro",
    priceUsd: "$25〜 / 月",
    priceJpy: `約 ¥${(25 * JPY_REFERENCE_RATE).toLocaleString("ja-JP")}〜 / 月`,
    note: "本番公開の基本候補",
    quota: "DB 8 GB / Storage 100 GB / MAU 100,000 / Egress 250 GB / Edge Functions 200万回",
  },
  {
    name: "Team",
    priceUsd: "$599〜 / 月",
    priceJpy: `約 ¥${(599 * JPY_REFERENCE_RATE).toLocaleString("ja-JP")}〜 / 月`,
    note: "組織・監査・コンプライアンス強化向け",
    quota: "Pro相当の主要使用枠 + SOC2 / ISO 27001 / 14日バックアップ / 28日ログ保持など",
  },
  {
    name: "Enterprise",
    priceUsd: "要問い合わせ",
    priceJpy: "日本円も個別見積",
    note: "大規模・個別要件向け",
    quota: "使用枠・SLA・サポート等を個別契約",
  },
] as const;

export function SupabasePlanGuide() {
  return (
    <section className="admin-page" style={{ paddingTop: 0 }}>
      <div className="admin-panel admin-dashboard-section">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">SUPABASE PLAN & BILLING</p>
            <h2>Supabaseプラン・料金</h2>
          </div>
        </div>

        <p className="trial-admin-note">
          現在のDatabase / Storage使用量と設定プランは上の「Supabase使用容量」で確認できます。MAU・Egress・Edge Functions・Realtimeなど請求サイクル単位の正式な使用量はSupabase公式Usage画面を確認してください。
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <a className="primary-action" href={SUPABASE_USAGE_URL} target="_blank" rel="noreferrer">公式Usageを開く ↗</a>
          <a className="secondary-action" href={SUPABASE_BILLING_URL} target="_blank" rel="noreferrer">プラン変更・請求設定 ↗</a>
          <a className="secondary-action" href={SUPABASE_PRICING_URL} target="_blank" rel="noreferrer">最新料金を確認 ↗</a>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 18 }}>
          {plans.map((plan) => (
            <article className="choice-card compact" key={plan.name}>
              <span style={{ display: "grid", gap: 6 }}>
                <small>{plan.note}</small>
                <strong style={{ fontSize: 18 }}>{plan.name}</strong>
                <strong>{plan.priceUsd}</strong>
                <strong style={{ color: "#0b67c2" }}>{plan.priceJpy}</strong>
                <small>{plan.quota}</small>
              </span>
            </article>
          ))}
        </div>

        <p className="trial-admin-note" style={{ marginTop: 14 }}>
          日本円は{JPY_REFERENCE_LABEL}で換算した概算です。料金は2026-09-19時点のSupabase公式情報を基にしています。Pro / Teamは使用超過、追加Compute、PITR、Custom Domain等で追加料金が発生する場合があります。実際のカード請求額は為替・税・決済会社の換算レート等で変動するため、最終金額はSupabase Billing画面を優先してください。
        </p>
      </div>
    </section>
  );
}
