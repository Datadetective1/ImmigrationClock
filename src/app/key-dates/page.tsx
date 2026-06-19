import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { KeyDates } from "@/components/KeyDates";
import { MethodologyNote } from "@/components/MethodologyNote";
import { KEY_DATES } from "@/lib/key-dates";

export const metadata = buildMetadata({
  title: "Key U.S. Immigration Dates & Deadlines",
  description:
    "Don't miss a window: H-1B registration, the tax filing deadline, the Diversity Visa lottery, the fiscal-year H-1B start, the monthly Visa Bulletin, and the F-1 OPT window — counted down, with the official source for each.",
  path: "/key-dates",
  keywords: [
    "H-1B registration dates",
    "immigration deadlines 2026",
    "tax deadline visa holders",
    "diversity visa lottery dates",
    "visa bulletin",
    "OPT application window",
  ],
});

export default function KeyDatesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Key dates"
        title="Key immigration dates & deadlines"
        description="The recurring U.S. immigration deadlines that matter — counted down from today, with the official source for each. Missing a window can cost you a full year, so we surface them early. This is timing, not legal or tax advice."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/key-dates", label: "Key dates" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        <KeyDates
          dates={KEY_DATES}
          placement="key-dates-page"
          title="Every deadline, counted down"
          subtitle="Sorted soonest-first. Recurring monthly or per-person items are listed last."
        />

        <MethodologyNote>
          Countdowns are computed from your device&rsquo;s current date. Exact windows for H-1B registration,
          the Diversity Visa lottery, and the Visa Bulletin are announced by USCIS and the State Department
          each year — always confirm the official dates at the linked source before acting. For your own
          case, consult a qualified immigration professional. See the{" "}
          <Link href="/resources" className="link-accent">
            resources directory
          </Link>{" "}
          for help with any of these.
        </MethodologyNote>
      </div>
    </div>
  );
}
