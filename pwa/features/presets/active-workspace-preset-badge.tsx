"use client";

import { useWorkspacePreset } from "@/features/presets/workspace-preset-provider";
import {
  WORKSPACE_PRESETS,
  type WorkspacePresetPreference,
} from "@/features/presets/workspace-presets";

type PresetFeature =
  | "article"
  | "images"
  | "sns"
  | "note"
  | "workflow"
  | "account_design";

const FEATURE_KEYS: Record<PresetFeature, keyof WorkspacePresetPreference> = {
  article: "applyArticle",
  images: "applyImages",
  sns: "applySns",
  note: "applyNote",
  workflow: "applyWorkflow",
  account_design: "applyAccountDesign",
};

export function ActiveWorkspacePresetBadge({ feature }: { feature: PresetFeature }) {
  const { preference, loading } = useWorkspacePreset();
  if (loading || !preference || !preference[FEATURE_KEYS[feature]]) return null;
  const preset = WORKSPACE_PRESETS[preference.presetKey];
  return (
    <div className={\`active-workspace-preset \${preset.adminOnly ? "admin" : ""}\`} role="status">
      <span>✦ 共通プリセット</span>
      <strong>{preset.label}</strong>
      <small>この機能へ反映中</small>
    </div>
  );
}
