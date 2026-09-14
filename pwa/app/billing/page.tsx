import type { Metadata } from "next";
import { BillingAccountPage } from "@/components/billing-account-page";

export const metadata: Metadata = {
  title: "契約・利用権 | AI記事スタジオ",
  description: "AI記事スタジオの契約と利用権を確認します。",
  robots: { index: false, follow: false },
};

export default function BillingPage() {
  return <BillingAccountPage />;
}
