import type { Metadata } from "next";
import { CommercePlansPage } from "@/components/commerce-plans-page";

export const metadata: Metadata = {
  title: "利用プラン | AI記事スタジオ",
  description: "AI記事スタジオの利用プランと購入条件を確認します。",
  robots: { index: false, follow: false },
};

export default function PlansPage() {
  return <CommercePlansPage />;
}
