import { Phase15MemberGate } from "@/components/phase15-member-gate";
import { Phase15SideJobPage } from "@/components/phase15-sidejob-page";

export default function SideJobPage() {
  return (
    <Phase15MemberGate>
      <Phase15SideJobPage />
    </Phase15MemberGate>
  );
}
