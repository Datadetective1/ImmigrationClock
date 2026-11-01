import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { VisaBulletinView } from "@/components/VisaBulletinView";
import { BULLETINS, VISA_BULLETIN_PATH, bulletinPath, getBulletin, latestBulletin } from "@/lib/visa-bulletin";

export const dynamicParams = false;

export function generateStaticParams() {
  return BULLETINS.map((b) => ({ month: b.id }));
}

export function generateMetadata({ params }: { params: { month: string } }): Metadata {
  const b = getBulletin(params.month);
  if (!b) return {};
  // The newest month's canonical is the evergreen /visa-bulletin, so the two
  // addresses do not compete for the same search.
  const isLatest = latestBulletin()?.id === b.id;
  return buildMetadata({
    title: `${b.label} Visa Bulletin: Green Card Dates`,
    description: `${b.label} green card cut-off dates for family and employment categories from the State Department Visa Bulletin, with what moved since the month before.`,
    path: isLatest ? VISA_BULLETIN_PATH : bulletinPath(b),
    image: ogImagePath("page", "visa-bulletin"),
  });
}

export default function VisaBulletinMonthPage({ params }: { params: { month: string } }) {
  const b = getBulletin(params.month);
  if (!b) notFound();
  return <VisaBulletinView bulletin={b} path={bulletinPath(b)} />;
}
