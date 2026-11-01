import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { VisaBulletinView } from "@/components/VisaBulletinView";
import { VISA_BULLETIN_PATH, latestBulletin } from "@/lib/visa-bulletin";

// The evergreen address: always the newest month we have checked. Each month
// also has its own page under /visa-bulletin/YYYY-MM for the archive.
const latest = latestBulletin();

export const metadata = buildMetadata({
  title: latest ? `${latest.label} Visa Bulletin: What Moved and Where Your Date Stands` : "Visa Bulletin",
  description: latest
    ? `${latest.label} green card cut-off dates for family and employment categories, what moved since last month, and a free check for your own priority date.`
    : "Monthly green card cut-off dates from the State Department Visa Bulletin.",
  path: VISA_BULLETIN_PATH,
  image: ogImagePath("page", "visa-bulletin"),
  keywords: [
    "visa bulletin",
    latest ? `${latest.label.toLowerCase()} visa bulletin` : "visa bulletin dates",
    "priority date",
    "EB-2 visa bulletin",
    "EB-3 visa bulletin",
    "F2A visa bulletin",
    "final action dates",
    "dates for filing",
  ],
});

export default function VisaBulletinPage() {
  if (!latest) notFound();
  return <VisaBulletinView bulletin={latest} path={VISA_BULLETIN_PATH} />;
}
