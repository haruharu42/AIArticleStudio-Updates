import { notFound } from "next/navigation";

import { Phase15MemberGate } from "@/components/phase15-member-gate";
import { SideHustleWizardPage } from "@/components/side-hustle-wizard-page";
import {
  SIDE_HUSTLE_SLUGS,
  getSideHustleDefinition,
} from "@/features/side-hustles/catalog";

export function generateStaticParams() {
  return SIDE_HUSTLE_SLUGS.map((slug) => ({ slug }));
}

export default async function SideHustlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!getSideHustleDefinition(slug)) notFound();

  return (
    <Phase15MemberGate>
      <SideHustleWizardPage slug={slug} />
    </Phase15MemberGate>
  );
}
