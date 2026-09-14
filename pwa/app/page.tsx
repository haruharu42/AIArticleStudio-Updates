import Link from "next/link";
import { FreeTrialBanner } from "@/components/free-trial-banner";
import { Phase18BeginnerHome } from "@/components/phase18-beginner-home";

export default function Home() {
  return (
    <>
      <FreeTrialBanner />
      <Phase18BeginnerHome />
      <nav className="commerce-public-shortcuts" aria-label="料金・契約情報">
        <Link href="/plans">利用プラン</Link>
        <Link href="/billing">契約・利用権</Link>
        <Link href="/commercial-transactions">販売条件</Link>
      </nav>
    </>
  );
}
