import { CreateAiSetup } from "@/components/create-ai-setup";
import { FreeTrialFeatureGate } from "@/components/free-trial-feature-gate";

export default function CreatePage() {
  return <FreeTrialFeatureGate feature="article_generate"><CreateAiSetup /></FreeTrialFeatureGate>;
}
