// =============================================================================
// /green-card-wait-time : every category and country page, in one table
//
// The answer first (which line is longest this month), then one row per page
// with the final action date, how far behind it is and how it moved in a year.
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChromeExtensionPanel } from "@/components/AddToChromeButton";
import { BulletinAlertSignup } from "@/components/BulletinAlertSignup";
import { offerById } from "@/lib/billing/offers";
import { Faq } from "@/components/Faq";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { formatDate } from "@/lib/format";
import { FORECAST_PATH, VISA_BULLETIN_PATH, formatCutoff, latestBulletin } from "@/lib/visa-bulletin";
import {
  WAIT_PAIRS,
  WAIT_TIME_PATH,
  behindWords,
  waitFacts,
  waitLabel,
  waitPath,
  waitSlug,
  type WaitFacts,
} from "@/lib/visa-bulletin/wait-time";

const latest = latestBulletin();

export const metadata = buildMetadata({
  title: latest
    ? `Green Card Wait Times by Category and Country: ${latest.label} Visa Bulletin`
    : "Green Card Wait Times by Category and Country",
  description: latest
    ? `EB-1, EB-2, EB-3, F2A and F4 green card wait times for India, China, Mexico, the Philippines and the rest of the world, from the ${latest.label} Visa Bulletin final action dates.`
    : "Green card wait times by category and country from the State Department Visa Bulletin.",
  path: WAIT_TIME_PATH,
  image: ogImagePath("page", "visa-bulletin"),
  keywords: [
    "green card wait time",
    "green card wait time by country",
    "green card backlog",
    "EB-2 India wait time",
    "EB-3 India wait time",
    "EB-2 China wait time",
    "visa bulletin wait time",
  ],
});

function months(f: WaitFacts): number {
  return f.behind?.months ?? -1;
}

function yearCell(f: WaitFacts): string {
  const m = f.yearAgo?.move;
  if (!m) return "Not in our records";
  if (m.kind === "ahead") return `Ahead ${m.gap}`;
  if (m.kind === "back") return `Back ${m.gap}`;
  if (m.kind === "same") return "No change";
  if (m.kind === "now-current") return "Now current";
  return "Changed";
}

export default function WaitTimeIndexPage() {
  if (!latest) notFound();
  const rows = WAIT_PAIRS.map((p) => waitFacts(p, latest)).filter((f): f is WaitFacts => f !== null);
  const longest = [...rows].sort((a, b) => months(b) - months(a))[0];
  const employment = rows.filter((f) => f.pair.section === "employment");
  const family = rows.filter((f) => f.pair.section === "family");

  const table = (title: string, list: WaitFacts[]) => (
    <section className="panel panel-pad" aria-label={title}>
      <h2 className="text-base font-bold text-white">{title}</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1.5 font-medium">Category and country</th>
            <th className="py-1.5 font-medium">Final action date</th>
            <th className="hidden py-1.5 font-medium sm:table-cell">Behind the bulletin month</th>
            <th className="hidden py-1.5 font-medium md:table-cell">Past 12 months</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {list.map((f) => (
            <tr key={waitSlug(f.pair)}>
              <td className="py-2">
                <Link href={waitPath(f.pair)} className="link-accent">
                  {waitLabel(f.pair)}
                </Link>
              </td>
              <td className="py-2 tabular-nums text-slate-200">{formatCutoff(f.finalAction)}</td>
              <td className="hidden py-2 text-slate-400 sm:table-cell">{f.behind ? behindWords(f.behind) : "None"}</td>
              <td className="hidden py-2 text-slate-400 md:table-cell">{yearCell(f)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <div>
      <PageHeader
        compact
        eyebrow="Green card wait time"
        title="Green card wait times by category and country"
        description={`From the ${latest.label} Visa Bulletin. Pick your category and country for its own page.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: WAIT_TIME_PATH, label: "Wait times" },
        ]}
        share
        sharePath={WAIT_TIME_PATH}
      />
      <div className="container-page max-w-4xl space-y-6 py-6 sm:py-8">
        {longest?.behind ? (
          <section aria-label="Answer" className="panel panel-pad">
            <p className="text-lg font-semibold leading-snug text-white sm:text-xl">
              In the {latest.label} Visa Bulletin, the longest line on this list is {waitLabel(longest.pair)}, with a final action
              date of {formatCutoff(longest.finalAction)}, {behindWords(longest.behind)} behind the bulletin month.
            </p>
            <p className="mt-2 text-sm text-slate-400">
              A priority date earlier than its category&apos;s final action date can have a green card approved this month. To
              see when the line may reach a later date, use the{" "}
              <Link href={FORECAST_PATH} className="link-accent">
                free priority date forecast
              </Link>
              .
            </p>
          </section>
        ) : null}

        <BulletinAlertSignup placement="wait-time-index" trialDays={offerById("free-trial").trialDays} />

        <ChromeExtensionPanel
          placement="wait-time-index"
          what="Pick your category and country once and see its dates in one click, with an alert each time we add a new bulletin month."
        />

        {table("Employment-based", employment)}
        {table("Family-based", family)}

        <Faq
          items={[
            {
              q: "How is the green card wait time measured here?",
              a: `As the distance between the ${latest.label} bulletin month and the final action date for each category and country. It shows how far back the line is today. It is not a promise of how long a new case will take.`,
            },
            {
              q: "Why is the wait longer for India and China?",
              a: "U.S. law limits each country to a share of the green cards in each category each year. Countries with many applicants, such as India and China, hit that limit, so their line moves more slowly than the rest of the world's.",
            },
            {
              q: "Where do these dates come from?",
              a: `From the U.S. Department of State Visa Bulletin for ${latest.label}, checked against the official bulletin on ${formatDate(latest.verifiedAt)}.`,
            },
          ]}
        />

        <footer className="space-y-2 text-xs leading-relaxed text-slate-500">
          <p>
            Source:{" "}
            <a href={latest.sourceUrl} className="link-accent" target="_blank" rel="noopener noreferrer">
              U.S. Department of State, Visa Bulletin for {latest.label} (PDF)
            </a>
            . Full table:{" "}
            <Link href={VISA_BULLETIN_PATH} className="link-accent">
              {latest.label} Visa Bulletin
            </Link>
            . This page is information, not legal advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
