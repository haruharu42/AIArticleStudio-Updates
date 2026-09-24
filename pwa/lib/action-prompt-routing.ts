import type { ActionPromptTemplate } from "@/lib/action-prompt-catalog";

export type ActionPromptRouteSelection = {
  category: string;
  templateId: string;
  query: string;
};

function safeParam(value: string | null, maxLength = 120): string {
  return (value ?? "").trim().slice(0, maxLength);
}

export function readActionPromptRouteSelection(search: string): ActionPromptRouteSelection {
  const params = new URLSearchParams(search);
  return {
    category: safeParam(params.get("category")),
    templateId: safeParam(params.get("template")),
    query: safeParam(params.get("q")),
  };
}

export function resolveActionPromptRouteTemplate(
  templates: readonly ActionPromptTemplate[],
  selection: ActionPromptRouteSelection,
): ActionPromptTemplate | undefined {
  if (selection.templateId) {
    const direct = templates.find((template) => template.id === selection.templateId);
    if (direct) return direct;
  }
  if (selection.category) {
    return templates.find((template) => template.category === selection.category);
  }
  return undefined;
}
