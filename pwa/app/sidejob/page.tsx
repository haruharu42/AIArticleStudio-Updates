import { Phase15MemberGate } from "@/components/phase15-member-gate";
import { SideHustleWizardPage } from "@/components/side-hustle-wizard-page";

export default function SideJobPage() {
  return (
    <Phase15MemberGate>
      <SideHustleWizardPage slug="sidejob-planner" />
    </Phase15MemberGate>
  );
}
