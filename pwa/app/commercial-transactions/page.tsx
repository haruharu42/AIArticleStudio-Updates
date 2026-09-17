import type { Metadata } from "next";
import { CommercialTransactionsPage } from "@/components/commercial-transactions-page";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | AI記事スタジオ",
  description: "AI記事スタジオの販売条件を確認します。",
  robots: { index: false, follow: false },
};

export default function CommercialTransactionsRoute() {
  return <CommercialTransactionsPage />;
}
