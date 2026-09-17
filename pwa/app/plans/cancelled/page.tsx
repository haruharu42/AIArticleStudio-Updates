import { redirect } from "next/navigation";

export default function CheckoutCancelledPage() {
  redirect("/plans?checkout=cancelled");
}
