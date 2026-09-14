import Link from "next/link";

export default function NotFound() {
  return <main className="commerce-page"><section className="commerce-empty"><h2>利用プランが見つかりません</h2><Link href="/">ホームへ戻る</Link></section></main>;
}
