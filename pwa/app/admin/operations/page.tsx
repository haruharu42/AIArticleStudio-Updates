import { OperationsAdminPage } from "@/components/operations-admin-page";
import { OperationsSecurityRepairPanel } from "@/components/operations-security-repair-prompt";
import { SupabasePlanGuide } from "@/components/supabase-plan-guide";

export default function AdminOperationsRoute() {
  return (
    <>
      <OperationsSecurityRepairPanel />
      <OperationsAdminPage />
      <SupabasePlanGuide />
    </>
  );
}
