import { FreeTrialFeatureGate } from "@/components/free-trial-feature-gate";
import { Phase13ImagePromptPage } from "@/components/phase13-image-page";

export default function ImagesPage() {
  return <FreeTrialFeatureGate feature="image_generate"><Phase13ImagePromptPage /></FreeTrialFeatureGate>;
}
