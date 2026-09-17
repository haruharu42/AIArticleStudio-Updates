import Link from "next/link";

export default function NotFound() {
  return <main className="commerce-page"><section className="commerce-empty"><h2>契約情報ページが見つかりません</h2><Link href="/plans">利用プランへ戻る</Link></section></main>;
}
