import type { AiAppKey } from "@/lib/ai-app-links";
import type { KnowledgeTask } from "@/lib/knowledge-engine";

export const SIDE_HUSTLE_CUSTOM_VALUE = "__custom__";

export type SideHustleFieldGroup = "basic" | "detail";

export type SideHustleFieldOption = {
  value: string;
  label: string;
  description?: string;
};

export type SideHustleField = {
  key: string;
  label: string;
  help: string;
  group: SideHustleFieldGroup;
  options: readonly SideHustleFieldOption[];
  customLabel?: string;
  customPlaceholder: string;
  customMultiline?: boolean;
};

export type SideHustleDefinition = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  knowledgeTask: KnowledgeTask;
  recommendedAi: AiAppKey;
  fields: readonly SideHustleField[];
  promptTemplate: string;
};

export type SideHustleFieldValue = {
  selected: string;
  custom: string;
};

export type SideHustleDraft = {
  values: Record<string, SideHustleFieldValue>;
  selectedAi: AiAppKey;
  selectedPlan: "free" | "paid";
  step: number;
};

export type SideHustlePromptBuildResult = {
  prompt: string;
  appliedKnowledge: string[];
  warnings: string[];
};
