// =============================================================================
// DATA DISCOVERY — what ImmigrationClock itself can do, stated only as verified
//
// A discovery post tells a reader about a tool: "you can search every H-1B
// sponsor in the USCIS export by name". It is the easiest kind of post to get
// wrong, because the temptation is to describe the product one wishes existed.
// So every capability below is written against the code that implements it —
// the component, the route, the data it reads — and tests pin that the routes
// exist. A capability that is not verified is not in this file.
//
// The figures are read from the same snapshots the pages render, so a post can
// say "2,614 sponsors" only because the directory holds 2,614 today.
// =============================================================================

import { EMPLOYERS_META } from "@/lib/employers";
import { WARN_SUMMARY } from "@/lib/warn-summary";
import { INDEX_COVERAGE } from "@/lib/event-index";
import { KEY_DATES } from "@/lib/key-dates";
import { formatNumber } from "@/lib/format";
import { EXPLAINERS } from "./explainers";

export interface Discovery {
  slug: string;
  /** The need a reader arrives with, as they would say it. */
  need: string;
  /** What the tool is. Short. */
  title: string;
  /** The page. Must be a real route; tests check. */
  path: string;
  /** Finished sentences describing verified behaviour. The closed world. */
  facts: string[];
  /** What the tool does NOT do, where a reader might assume otherwise. */
  caveats: string[];
  /** Topic key for same-day variety, matching the social layer's vocabulary. */
  topicKey: string;
}

export function buildDiscoveries(): Discovery[] {
  const m = EMPLOYERS_META;
  const w = WARN_SUMMARY;
  return [
    {
      slug: "employer-directory",
      need: "Looking for a specific H-1B sponsor?",
      title: "The H-1B employer directory",
      path: "/h1b/employers",
      facts: [
        `ImmigrationClock's employer directory lets a reader search ${formatNumber(m.count)} H-1B sponsoring employers by name.`,
        `Each entry shows the employer's petition approvals, denials and approval rate for fiscal year ${m.fiscalYear}, as reported in the USCIS H-1B Employer Data Hub, and the state where most of its approvals were recorded.`,
        `Every listed employer has its own page, with the sponsors immediately above and below it by volume and the other large sponsors in the same state.`,
        `The directory covers every employer in the export with at least ${m.minApprovals} approvals.`,
      ],
      caveats: [
        "Search is by employer name. Figures are petition counts, not headcounts, and the export is the latest fiscal year USCIS has published at employer level.",
      ],
      topicKey: "visa:h-1b",
    },
    {
      slug: "key-dates",
      need: "Trying to keep track of the immigration calendar?",
      title: "Key dates, counted down",
      path: "/key-dates",
      facts: [
        `ImmigrationClock keeps ${KEY_DATES.length} recurring U.S. immigration dates on one page: the H-1B registration window, the federal tax deadline, the Diversity Visa lottery, the October 1 fiscal-year start, the monthly Visa Bulletin and the F-1 OPT filing window.`,
        `Dates with a fixed annual day carry a live countdown. Windows the agency sets each year are marked approximate until they are announced.`,
        `Every entry links to the government page that sets the date.`,
      ],
      caveats: ["The page is a reference, not a reminder service, and nothing on it is legal or tax advice."],
      topicKey: "topic:deadlines",
    },
    {
      slug: "following",
      need: "Only interested in changes that touch one country or one visa?",
      title: "Follow a country, a visa or a topic",
      path: "/following",
      facts: [
        "A reader can choose countries, visa categories, agencies and topics to follow, and ImmigrationClock organises the matching recorded changes around those choices.",
        "The choices are stored in the reader's own browser. There is no account, no server-side profile and no identifier; nothing about what a reader follows is sent to ImmigrationClock.",
        "Clearing browser storage clears the choices, because that is the only place they exist.",
      ],
      caveats: ["This organises the public archive by interest. It does not track anyone's case and cannot say what will happen to a specific application."],
      topicKey: "topic:following",
    },
    {
      slug: "change-archive-search",
      need: "Need to find a specific rule, alert or court decision?",
      title: "Search the change archive",
      path: "/what-changed",
      facts: [
        `ImmigrationClock's change archive holds ${formatNumber(INDEX_COVERAGE.stored)} recorded U.S. immigration changes, each linked to the official document it came from.`,
        `The archive can be searched by keyword and filtered by agency, by kind of document (final rule, proposed rule, court decision, policy update), by the entity it affects and by date.`,
        `Each recorded change now has its own page, with the source, the dates, what the document says about who is affected, and the related context.`,
      ],
      caveats: [
        INDEX_COVERAGE.bounded
          ? `Search reaches the ${formatNumber(INDEX_COVERAGE.indexed)} most recent records; older ones are held but reachable only from their own pages.`
          : "The archive is a record of what the ingested sources published, not a complete record of every U.S. immigration change.",
      ],
      topicKey: "topic:policy-changes",
    },
    {
      slug: "warn-api",
      need: "Want the layoff notices as data rather than a page?",
      title: "A free WARN layoff API",
      path: "/developers",
      facts: [
        `ImmigrationClock publishes the WARN layoff notices it aggregates as a free, public JSON feed, covering ${w.stateCount} states: ${w.stateCodes.join(", ")}.`,
        `The feed holds ${formatNumber(w.noticeCount)} notices naming ${formatNumber(w.employeesTotal)} employees at ${formatNumber(w.employerCount)} employers, with the employer, location, date and headcount for each.`,
        "No key and no sign-up are required.",
      ],
      caveats: ["Coverage is the states that publish a machine-readable feed — a growing subset, not a national total. Notices say nothing about the immigration status of the workers affected."],
      topicKey: "topic:layoffs",
    },
    {
      slug: "layoffs-vs-h1b",
      need: "Wondering whether an employer filing layoffs also sponsors visas?",
      title: "Layoff notices and H-1B sponsorship, side by side",
      path: "/layoffs-vs-h1b",
      facts: [
        "ImmigrationClock matches employer names across two public datasets — state WARN layoff notices and the USCIS H-1B Employer Data Hub — and shows where the same employer appears in both.",
        "For each match it shows the WARN headcount and the H-1B approvals separately, with the period each covers.",
      ],
      caveats: [
        "Appearing in both datasets does not mean a layoff affected sponsored workers, and does not indicate that any worker was displaced. The two filings are made to different agencies for different purposes and are never combined into one figure.",
      ],
      topicKey: "topic:layoffs",
    },
    {
      slug: "weekly-pulse",
      need: "Want the week's changes in one email?",
      title: "Immigration Pulse, the weekly email",
      path: "/pulse",
      facts: [
        "Immigration Pulse is ImmigrationClock's weekly email: the week's recorded changes ranked by impact, each linked to its official source, with the figures that moved.",
        "Subscribers choose their language at signup — English, Spanish, French or Arabic.",
        "There is no tracking pixel and no profile; an address is used only to send the issue.",
      ],
      caveats: ["The email reports what changed. It does not offer advice on any individual case."],
      topicKey: "topic:newsletter",
    },
    {
      slug: "explainers",
      need: "Keep tripping over a term in an immigration headline?",
      title: "ImmigrationClock explains",
      path: "/explained",
      facts: [
        `ImmigrationClock keeps ${EXPLAINERS.length} short, source-backed explainers of the distinctions immigration news gets wrong most often: a proposed rule against a final rule, an effective date against a publication date, an approval count against a headcount.`,
        "Each one cites the government source it was written from and links the ImmigrationClock records it helps read.",
      ],
      caveats: ["Explainers describe how the system works. They are not advice about any individual case."],
      topicKey: "topic:explained",
    },
  ];
}

export const DISCOVERY_SLUGS = buildDiscoveries().map((d) => d.slug);
