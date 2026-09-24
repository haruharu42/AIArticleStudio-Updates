import { CLIENT_WORK_SIDE_HUSTLES } from "@/features/side-hustles/definitions-client-work";
import { CONTENT_MEDIA_SIDE_HUSTLES } from "@/features/side-hustles/definitions-content-media";
import { PRODUCTIVITY_SIDE_HUSTLES } from "@/features/side-hustles/definitions-productivity";
import { SALES_SIDE_HUSTLES } from "@/features/side-hustles/definitions-sales";
import { sideField, sideOption } from "@/features/side-hustles/definition-helpers";
import type { SideHustleDefinition } from "@/features/side-hustles/types";

const SIDE_HUSTLE_EXPERIENCE_FIELD = sideField(
  "experience_level",
  "この副業の経験",
  "初心者向け・経験者向けKnowledgeを正しく選び分けるために使います。",
  "basic",
  "例：半年ほど継続、販売経験は3件",
  [
    sideOption("unspecified", "指定しない"),
    sideOption("beginner", "未経験・これから始める"),
    sideOption("early", "初心者・少し経験あり"),
    sideOption("experienced", "経験者・継続中"),
    sideOption("professional", "実務・販売経験あり"),
  ],
  true,
);

const BASE_SIDE_HUSTLE_DEFINITIONS: readonly SideHustleDefinition[] = [
  ...CONTENT_MEDIA_SIDE_HUSTLES,
  ...SALES_SIDE_HUSTLES,
  ...CLIENT_WORK_SIDE_HUSTLES,
  ...PRODUCTIVITY_SIDE_HUSTLES,
];

export const SIDE_HUSTLE_DEFINITIONS: readonly SideHustleDefinition[] = BASE_SIDE_HUSTLE_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    fields: definition.fields.some((field) => field.key === "experience")
      ? definition.fields
      : [SIDE_HUSTLE_EXPERIENCE_FIELD, ...definition.fields],
  }),
);

export const SIDE_HUSTLE_SLUGS = SIDE_HUSTLE_DEFINITIONS.map((definition) => definition.slug);

export function getSideHustleDefinition(slug: string): SideHustleDefinition | undefined {
  return SIDE_HUSTLE_DEFINITIONS.find((definition) => definition.slug === slug);
}
