import { OperationsAdminPage } from "@/components/operations-admin-page";
import { OperationsSecurityRepairPanel } from "@/components/operations-security-repair-prompt";

export default function AdminOperationsRoute() {
  return (
    <>
      <OperationsSecurityRepairPanel />
      <OperationsAdminPage />
    </>
  );
}