// =============================================================================
// /briefing/example — what a Pro Briefing looks like, before anyone pays
//
// The real Briefing component over the real archive, with one fixed watchlist
// (H-1B, F-1 students, USCIS). Nothing here reads an account or calls a Pro
// API: BriefingV2's `example` mode hides edit, saved, settings, alert history
// and downloads. Rebuilt hourly so "due in 30 days" stays true.
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefingV2 } from "@/components/BriefingV2";
import { flagOn } from "@/lib/flags";
import { buildMetadata } from "@/lib/seo";
import { buildBriefing } from "@/lib/pro/feed";
import { buildLandscape } from "@/lib/pro/landscape";
import { parsePrefs } from "@/lib/pro/prefs";
import { labelForEntity } from "@/lib/entity-labels";
import { siteDay } from "@/lib/format";

export const revalidate = 3600;

export const metadata = buildMetadata({
  title: "Example Pro Briefing: Immigration Changes for a Watchlist",
  description:
    "A live sample of the ImmigrationClock Pro Briefing for an H-1B, F-1 and USCIS watchlist: what takes effect next, what is new, each with its official source.",
  path: "/briefing/example",
});

/** The sample watchlist. Followable ids present in the archive. */
const EXAMPLE_FOLLOWS = ["visa:h-1b", "visa:f-1", "agency:uscis"];

export default function ExampleBriefingPage() {
  if (!flagOn("pro_briefing")) notFound();
  const today = siteDay(new Date());
  const briefing = buildBriefing({ follows: EXAMPLE_FOLLOWS, savedIds: [], today });
  const { upcoming, current, historical } = briefing.sections;
  const intelligence = flagOn("pro_intelligence");
  const prefs = parsePrefs(null);

  return (
    <div>
      <div className="container-page max-w-3xl pt-6">
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-slate-300">
          <p>
            <strong className="text-white">This is a sample.</strong> It follows{" "}
            {EXAMPLE_FOLLOWS.map(labelForEntity).join(", ")}, and updates from the same records as every
            subscriber&rsquo;s Briefing. Yours follows whatever you choose, emails you when something
            changes, and adds saved research, downloads and a calendar feed.
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 hover:bg-accent-soft"
          >
            Get your own Briefing with Pro
          </Link>
        </div>
      </div>
      <BriefingV2
        example
        today={today}
        follows={EXAMPLE_FOLLOWS}
        upcoming={upcoming}
        current={current}
        historical={historical}
        savedItems={[]}
        savedCount={0}
        feedCount={briefing.feed.length}
        landscape={intelligence ? buildLandscape({ follows: EXAMPLE_FOLLOWS, today }) : null}
        settings={{
          frequency: prefs.frequency,
          relevance: prefs.relevance,
          reminders: prefs.reminders,
          summary: prefs.summary,
          calendarUrl: "",
        }}
        alertsOn={false}
        intelligence={intelligence}
        history={[]}
        limitations={briefing.limitations}
      />
    </div>
  );
}
