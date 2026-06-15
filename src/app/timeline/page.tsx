import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { EventTimeline } from "@/components/EventTimeline";
import { timelineEvents } from "@/lib/events";

export const metadata = buildMetadata({
  title: "Immigration Timeline — Policy, Law & the Data",
  description:
    "A curated timeline of major U.S. immigration events — Title 42's end, the asylum proclamation, H-1B and fee changes, administration changes — each linked to the official source and the data figure at that time.",
  path: "/timeline",
  keywords: [
    "immigration timeline",
    "Title 42 ended",
    "immigration policy changes",
    "H-1B policy timeline",
    "border policy timeline",
  ],
});

export default function TimelinePage() {
  const count = timelineEvents().length;

  return (
    <div>
      <PageHeader
        eyebrow="Timeline"
        title="Policy, law, and the data"
        description="Major U.S. immigration events — policy, legal, and political — with a primary-source link on each, and the real data figure for that period where it maps to a series. Facts only; we connect events to numbers without claiming one caused the other."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/timeline", label: "Timeline" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        <p className="text-xs text-slate-400">{count} events · newest first · curated and non-exhaustive.</p>

        <EventTimeline />

        <AdSlot format="in-content" />

        <MethodologyNote>
          This timeline is a hand-curated, non-exhaustive selection of widely-reported events, each linked
          to an official or primary source. Data figures shown under an event are the real reported totals
          for that fiscal year (or year-to-date, labelled) drawn from the same datasets used across the
          site. Placing an event next to a data change does not establish that the event caused it.
        </MethodologyNote>
      </div>
    </div>
  );
}
