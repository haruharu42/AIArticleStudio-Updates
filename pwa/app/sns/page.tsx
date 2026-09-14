import { FreeTrialFeatureGate } from "@/components/free-trial-feature-gate";
import { Phase14SnsPage } from "@/components/phase14-sns-page";

export default function SnsPage() {
  return <FreeTrialFeatureGate feature="sns_generate"><Phase14SnsPage /></FreeTrialFeatureGate>;
}
