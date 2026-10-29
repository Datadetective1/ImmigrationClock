import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { PageHeader } from "@/components/PageHeader";
import { KeyDates } from "@/components/KeyDates";
import { MethodologyNote } from "@/components/MethodologyNote";
import { formatDate } from "@/lib/format";
import { LAST_REFRESHED } from "@/lib/data";
import { KEY_DATES } from "@/lib/key-dates";
import { openCommentPeriods } from "@/lib/editorial/record-notes";
import { EVENTS } from "@/lib/event-store";
import { changePath } from "@/lib/share";
import { siteDay } from "@/lib/format";

// Hourly, so an open comment period leaves the page the day it closes.
export const revalidate = 3600;

export const metadata = buildMetadata({
  title: "Immigration Deadlines & Key Dates: H-1B, OPT, Visa Bulletin",
  description:
    "The H-1B registration window, the F-1 OPT filing window, the monthly Visa Bulletin and open comment deadlines on proposed rules, each linked to its official source.",
  path: "/key-dates",
  image: ogImagePath("page", "key-dates"),
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
  const today = siteDay();
  const open = openCommentPeriods(today)
    .map(({ id, note }) => ({ note, event: EVENTS.find((e) => e.id === id) }))
    .filter((x): x is { note: typeof x.note; event: NonNullable<typeof x.event> } => Boolean(x.event));
  return (
    <div>
      <PageHeader
        eyebrow="Key dates"
        title="Key immigration dates & deadlines"
        description="The recurring U.S. immigration deadlines that matter, counted down from today, with the official source for each. Missing a window can cost you a full year, so we surface them early. This is timing, not legal or tax advice."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/key-dates", label: "Key dates" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        {/* Page-level currency. Individual items link to their own sources, but
            without a date on the page a reader cannot tell if the LIST is current. */}
        <p className="text-xs leading-relaxed text-slate-500">
          Reviewed {formatDate(LAST_REFRESHED)}. Deadlines are checked against the official source for each. Dates set by an agency can move; always confirm on the linked government page before relying on one.
        </p>

        {open.length > 0 ? (
          <section aria-labelledby="comments-heading" className="panel p-5 sm:p-6">
            <h2 id="comments-heading" className="text-base font-bold text-white sm:text-lg">
              Open comment periods
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Proposed rules, not in force. Anyone may comment on the federal docket until the deadline the document sets.
            </p>
            <ul className="mt-3 space-y-2">
              {open.map(({ note, event }) => (
                <li key={event.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-sm">
                  <Link href={changePath(event)} className="font-semibold text-white hover:text-accent">
                    {event.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-400">
                    Proposed {formatDate(event.publishedAt)} · comments due {formatDate(note.comments!.closes)} · docket{" "}
                    {note.comments!.docket}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <KeyDates
          dates={KEY_DATES}
          placement="key-dates-page"
          anchors
          title="Every deadline, counted down"
          subtitle="Sorted soonest-first. Recurring monthly or per-person items are listed last."
        />

        <MethodologyNote>
          Countdowns are computed from your device&rsquo;s current date. Exact windows for H-1B registration,
          the Diversity Visa lottery, and the Visa Bulletin are announced by USCIS and the State Department
          each year. Always confirm the official dates at the linked source before acting. For your own
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
