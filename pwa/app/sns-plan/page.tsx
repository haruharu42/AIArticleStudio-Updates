import { Phase15MemberGate } from "@/components/phase15-member-gate";
import { Phase15SnsPlanPage } from "@/components/phase15-sns-plan-page";

export default function SnsPlanPage() {
  return (
    <Phase15MemberGate>
      <Phase15SnsPlanPage />
    </Phase15MemberGate>
  );
}
