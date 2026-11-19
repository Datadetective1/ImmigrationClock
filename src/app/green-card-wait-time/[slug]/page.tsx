// =============================================================================
// /green-card-wait-time/[slug] : one category and country, answer first
//
// "How long is the EB-2 India wait?" answered in the first line, from the
// newest hand-checked bulletin, then the two dates, the past year's movement,
// how to place your own date, and the official source. No estimate is made
// here; the forecast page has the method and is linked.
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { ChromeExtensionPanel } from "@/components/AddToChromeButton";
import { BulletinAlertSignup } from "@/components/BulletinAlertSignup";
import { offerById } from "@/lib/billing/offers";
import { Faq, type FaqItem } from "@/components/Faq";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { formatDate } from "@/lib/format";
import {
  FORECAST_PATH,
  OFFICIAL_INDEX_URL,
  ROW_LABEL,
  VISA_BULLETIN_PATH,
  formatCutoff,
  isDate,
  latestBulletin,
} from "@/lib/visa-bulletin";
import { formatMonth } from "@/lib/visa-bulletin/forecast-format";
import {
  COUNTRY_NAME,
  WAIT_PAIRS,
  WAIT_TIME_PATH,
  answerLine,
  behindWords,
  categoryHint,
  countryPhrase,
  forecastLink,
  pairFromSlug,
  ruleLine,
  waitFacts,
  waitLabel,
  waitPath,
  waitSlug,
  yearLine,
  type WaitFacts,
} from "@/lib/visa-bulletin/wait-time";

const USCIS_CHART_URL =
  "https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates";

export const dynamicParams = false;

export function generateStaticParams() {
  return WAIT_PAIRS.map((p) => ({ slug: waitSlug(p) }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const pair = pairFromSlug(params.slug);
  const facts = pair ? waitFacts(pair) : null;
  if (!pair || !facts) return {};
  const name = waitLabel(pair);
  const fa = formatCutoff(facts.finalAction);
  return buildMetadata({
    title: `${name} Green Card Wait Time: ${facts.bulletin.label} Priority Date`,
    description: `${name} final action date in the ${facts.bulletin.label} Visa Bulletin: ${fa}. How far behind the line is, how far it moved in the past year, and how to check your own priority date.`,
    path: waitPath(pair),
    image: ogImagePath("page", "visa-bulletin"),
    keywords: [
      `${name} wait time`,
      `${name} green card wait time`,
      `${name} priority date`,
      `${name} visa bulletin`,
      `${ROW_LABEL[pair.row]} ${COUNTRY_NAME[pair.country]} backlog`,
      "green card wait time by country",
      "visa bulletin priority date",
    ],
  });
}

function moveTone(f: WaitFacts): string {
  const k = f.yearAgo?.move.kind;
  if (k === "ahead" || k === "now-current") return "text-status-green";
  if (k === "back" || k === "now-unavailable") return "text-status-red";
  return "text-slate-100";
}

function yearTile(f: WaitFacts): string {
  const m = f.yearAgo?.move;
  if (!m) return "Not in our records";
  switch (m.kind) {
    case "ahead":
      return `Ahead ${m.gap}`;
    case "back":
      return `Back ${m.gap}`;
    case "same":
      return "No change";
    case "now-current":
      return "Now current";
    case "now-unavailable":
      return "Now unavailable";
    case "now-dated":
      return "Now dated";
    default:
      return "Not in our records";
  }
}

function faqFor(f: WaitFacts): FaqItem[] {
  const name = waitLabel(f.pair);
  const month = f.bulletin.label;
  const fa = formatCutoff(f.finalAction);
  const df = formatCutoff(f.filing);
  const year = yearLine(f, formatMonth);
  const items: FaqItem[] = [
    {
      q: `What is the ${name} priority date in the ${month} Visa Bulletin?`,
      a: `The final action date is ${fa} and the date for filing is ${df}. A priority date is reached when it is earlier than the listed date.`,
    },
  ];
  if (isDate(f.finalAction) && f.behind) {
    items.push({
      q: `How long is the ${name} green card wait?`,
      a: `In ${month}, the ${name} final action date sits ${behindWords(f.behind)} behind the bulletin month, so the cases being approved now have priority dates from ${fa} or earlier. ${year ?? ""} How long a new case waits depends on how fast that date keeps moving, which the bulletin does not promise.`.replace(
        /\s+/g,
        " "
      ),
    });
  } else if (f.finalAction === "C") {
    items.push({
      q: `Is there a wait for ${name}?`,
      a: `${name} is current in ${month}, so a visa number is available for every priority date. The time left is USCIS or consular processing.`,
    });
  }
  items.push(
    {
      q: `When will ${name} be current?`,
      a: `No one can say for certain: a new law, a surge in demand or a retrogression can change it. ImmigrationClock's free forecast gives a range from how fast the official final action date has moved over the past one to three years.`,
    },
    {
      q: "What is the difference between final action dates and dates for filing?",
      a: "The final action date decides when a green card can be approved. The date for filing is earlier in the process: when USCIS allows it, you can file your adjustment of status application once your priority date is earlier than that date. USCIS says each month which chart it accepts.",
    },
    {
      q: "Where do these dates come from?",
      a: `From the U.S. Department of State Visa Bulletin for ${month}. ImmigrationClock checked every date against the official bulletin on ${formatDate(f.bulletin.verifiedAt)}.`,
    }
  );
  return items;
}

export default function WaitTimePage({ params }: { params: { slug: string } }) {
  const pair = pairFromSlug(params.slug);
  const facts = pair ? waitFacts(pair) : null;
  if (!pair || !facts) notFound();
  const f = facts;
  const name = waitLabel(pair);
  const rule = ruleLine(f);
  const year = yearLine(f, formatMonth);
  const sameRow = WAIT_PAIRS.filter((p) => p.row === pair.row && p.country !== pair.country);
  const sameCountry = WAIT_PAIRS.filter((p) => p.country === pair.country && p.row !== pair.row);
  const latest = latestBulletin();

  const tiles: [string, string, string, string][] = [
    ["Final action date", formatCutoff(f.finalAction), "When a green card can be approved", "text-slate-100"],
    ["Date for filing", formatCutoff(f.filing), "When you may be able to file early", "text-slate-100"],
    ["Past 12 months", yearTile(f), f.yearAgo ? `Final action, since ${formatMonth(f.yearAgo.month)}` : "", moveTone(f)],
  ];

  return (
    <div>
      <PageHeader
        compact
        eyebrow="Green card wait time"
        title={`${name} green card wait time`}
        description={`${categoryHint(pair)}, for ${countryPhrase(pair.country)}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: WAIT_TIME_PATH, label: "Wait times" },
          { href: waitPath(pair), label: name },
        ]}
        share
        sharePath={waitPath(pair)}
      />

      <div className="container-page max-w-4xl space-y-6 py-6 sm:py-8">
        <section aria-label="Answer" className="panel panel-pad">
          <p className="text-lg font-semibold leading-snug text-white sm:text-xl" data-testid="wait-answer">
            {answerLine(f)}
          </p>
          {rule ? <p className="mt-2 text-sm text-slate-300">{rule}</p> : null}
          {year ? <p className="mt-1 text-sm text-slate-400">{year}</p> : null}
        </section>

        <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          {tiles.map(([label, value, hint, tone]) => (
            <div key={label} className="panel p-4">
              <div className="text-xs text-slate-400">{label}</div>
              <div className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</div>
              {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
            </div>
          ))}
        </div>

        <section aria-labelledby="estimate-heading">
          <h2 id="estimate-heading" className="text-base font-bold text-white">
            How to estimate your own wait
          </h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">1</span>
              <p className="mt-2 text-sm font-semibold text-white">Find your priority date</p>
              <p className="mt-1 text-xs text-slate-400">
                {pair.section === "employment"
                  ? "It is on your I-140 approval notice: usually the day your PERM labor certification was filed, or the day the I-140 was filed when no PERM was needed."
                  : "It is on your I-130 receipt notice: the day the petition was filed."}
              </p>
            </li>
            <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">2</span>
              <p className="mt-2 text-sm font-semibold text-white">Compare it with {formatCutoff(f.finalAction)}</p>
              <p className="mt-1 text-xs text-slate-400">
                Earlier than the final action date means a green card can be approved this month. Earlier than {formatCutoff(f.filing)} may let you file now, if USCIS accepts that chart.
              </p>
            </li>
            <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">3</span>
              <p className="mt-2 text-sm font-semibold text-white">See when the line may reach you</p>
              <p className="mt-1 text-xs text-slate-400">
                Enter your date in the{" "}
                <Link href={forecastLink(pair)} className="link-accent">
                  free {name} forecast
                </Link>
                . It measures how far this date has moved in past bulletins and gives a range.
              </p>
            </li>
          </ol>
        </section>

        {sameRow.length > 0 ? (
          <section aria-labelledby="row-heading" className="panel panel-pad">
            <h2 id="row-heading" className="text-base font-bold text-white">
              {ROW_LABEL[pair.row]} in other countries
            </h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1.5 font-medium">Country</th>
                  <th className="py-1.5 font-medium">Final action date</th>
                  <th className="hidden py-1.5 font-medium sm:table-cell">Behind the bulletin month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sameRow.map((p) => {
                  const pf = waitFacts(p, f.bulletin);
                  return (
                    <tr key={waitSlug(p)}>
                      <td className="py-2">
                        <Link href={waitPath(p)} className="link-accent">
                          {waitLabel(p)}
                        </Link>
                      </td>
                      <td className="py-2 tabular-nums text-slate-200">{formatCutoff(pf?.finalAction)}</td>
                      <td className="hidden py-2 text-slate-400 sm:table-cell">{pf?.behind ? behindWords(pf.behind) : "None"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        {sameCountry.length > 0 ? (
          <p className="text-sm text-slate-400">
            Other categories for {COUNTRY_NAME[pair.country]}:{" "}
            {sameCountry.map((p, i) => (
              <span key={waitSlug(p)}>
                {i > 0 ? ", " : null}
                <Link href={waitPath(p)} className="link-accent">
                  {waitLabel(p)}
                </Link>
              </span>
            ))}
            . All categories:{" "}
            <Link href={WAIT_TIME_PATH} className="link-accent">
              green card wait times
            </Link>
            .
          </p>
        ) : null}

        <section aria-labelledby="next-heading" className="panel p-4 sm:p-6">
          <div className="eyebrow mb-1 text-accent">Next month</div>
          <h2 id="next-heading" className="text-lg font-bold text-white sm:text-xl">
            Hear when the new dates are out
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Get the new {name} dates by email, free, when we publish each bulletin month.{" "}
            <Link href="/pricing" className="link-accent">
              Pro
            </Link>{" "}
            adds alerts on a watchlist of policy changes and a forecast by month for your own priority date.
          </p>
          <div className="mt-4">
            <BulletinAlertSignup
              placement="wait-time-page"
              defaultRow={pair.row}
              defaultCountry={pair.country}
              trialDays={offerById("free-trial").trialDays}
              heading={`Free ${name} date alerts`}
              blurb={`One email when we publish each new Visa Bulletin month, with the ${name} final action date and date for filing. Pick another category or country if you need to.`}
            />
          </div>
          <div className="mt-4">
            <ChromeExtensionPanel
              placement="wait-time-page"
              what={`Pick ${name} once and see its dates in one click, with an alert each time we add a new bulletin month.`}
            />
          </div>
        </section>

        <Faq items={faqFor(f)} />

        <footer className="space-y-2 text-xs leading-relaxed text-slate-500">
          <p>
            Source:{" "}
            <a href={f.bulletin.sourceUrl} className="link-accent" target="_blank" rel="noopener noreferrer">
              U.S. Department of State, Visa Bulletin for {f.bulletin.label} (PDF)
            </a>
            . Every date was checked against it on {formatDate(f.bulletin.verifiedAt)}.
            {f.yearAgo ? (
              <>
                {" "}
                The {formatMonth(f.yearAgo.month)} date is from{" "}
                <a href={f.yearAgo.sourceUrl} className="link-accent" target="_blank" rel="noopener noreferrer">
                  that month&apos;s bulletin
                </a>
                .
              </>
            ) : null}{" "}
            All bulletins:{" "}
            <a href={OFFICIAL_INDEX_URL} className="link-accent" target="_blank" rel="noopener noreferrer">
              travel.state.gov
            </a>
            .
          </p>
          <p>
            USCIS says each month which chart applicants for adjustment of status may use; see{" "}
            <a href={USCIS_CHART_URL} className="link-accent" target="_blank" rel="noopener noreferrer">
              USCIS: Visa Availability and Priority Dates
            </a>
            . Full table:{" "}
            <Link href={VISA_BULLETIN_PATH} className="link-accent">
              {latest?.label} Visa Bulletin
            </Link>
            . Forecast:{" "}
            <Link href={FORECAST_PATH} className="link-accent">
              when will my date be current?
            </Link>
            . This page is information, not legal advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
