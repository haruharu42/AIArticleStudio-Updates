import { OperationsAdminPage } from "@/components/operations-admin-page";
import { OperationsSecurityRepairPanel } from "@/components/operations-security-repair-prompt";
import { SupabasePlanUsageGuide } from "@/components/supabase-plan-usage-guide";

export default function AdminOperationsRoute() {
  return (
    <>
      <OperationsSecurityRepairPanel />
      <SupabasePlanUsageGuide />
      <OperationsAdminPage />
    </>
  );
}
