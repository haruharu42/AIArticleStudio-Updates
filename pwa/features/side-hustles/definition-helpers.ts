import {
  SIDE_HUSTLE_CUSTOM_VALUE,
  type SideHustleField,
  type SideHustleFieldOption,
} from "@/features/side-hustles/types";

export function sideOption(value: string, label: string, description?: string): SideHustleFieldOption {
  return { value, label, description };
}

export function sideField(
  key: string,
  label: string,
  help: string,
  group: "basic" | "detail",
  customPlaceholder: string,
  options: readonly SideHustleFieldOption[],
  customMultiline = false,
): SideHustleField {
  return {
    key,
    label,
    help,
    group,
    options: [...options, sideOption(SIDE_HUSTLE_CUSTOM_VALUE, "その他・自由入力")],
    customLabel: "自由入力",
    customPlaceholder,
    customMultiline,
  };
}

export function promptLines(...lines: string[]): string {
  return lines.join("\n");
}
