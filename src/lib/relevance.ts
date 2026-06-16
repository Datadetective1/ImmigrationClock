// =============================================================================
// PERSONAL-RELEVANCE ENGINE — "what the data shows for people like you".
//
// Rule-based (no AI) audience summaries computed from the existing dataset, so a
// visitor sees how the numbers relate to their situation: an Indian H-1B
// applicant, a Texas worker, an international student, an employer. These are
// DATA CONTEXT, not advice — every point is labelled and the UI carries a clear
// non-advice disclaimer. We never tell anyone what to do.
// =============================================================================
import type { Provenance } from "./types";
import { countryAggregate, stateAggregate, visaSeries, topSponsors } from "./data";
import {
  H1B_NATIONAL,
  EMPLOYER_LATEST_FY,
  LATEST_COMPLETE_FY,
  CURRENT_FY,
  FY2026_ELAPSED,
  WARN_LIVE,
  visaByCountry,
} from "./dataset";
import { formatNumber, formatCompact, formatCurrency } from "./format";

export interface RelevancePoint {
  text: string;
  provenance: Provenance;
}
export interface RelevanceSummary {
  audience: string;
  points: RelevancePoint[];
}
export interface PersonaSummary {
  key: string;
  label: string; // "H-1B Worker"
  question: string; // "What does today's data mean for H-1B workers?"
  points: RelevancePoint[];
  links: { href: string; label: string }[];
}

const r = (text: string, provenance: Provenance): RelevancePoint => ({ text, provenance });
const pct = (a: number, b: number): number => (b ? ((a - b) / b) * 100 : 0);

// --- Country: applicants + students of a given nationality -------------------
export function countryRelevance(slug: string): RelevanceSummary[] {
  const agg = countryAggregate(slug);
  if (!agg) return [];
  const name = agg.country.name;
  const national = H1B_NATIONAL[EMPLOYER_LATEST_FY].approvals;
  const h1b = agg.h1b?.issued ?? agg.seed.h1bApprovals2024;
  const share = national ? (h1b / national) * 100 : 0;

  const out: RelevanceSummary[] = [
    {
      audience: `${name} H-1B applicants`,
      points: [
        r(
          `${name} accounted for ${formatNumber(h1b)} of ${formatNumber(national)} U.S. H-1B approvals in FY${EMPLOYER_LATEST_FY} — about ${Math.round(share)}%.`,
          "reported"
        ),
        r(
          share >= 25
            ? `Because the program is so concentrated by nationality, changes to the H-1B cap, fees, or rules fall disproportionately on ${name} applicants.`
            : `${name} is a smaller source of H-1B workers, so program-wide changes tend to affect it roughly in proportion to its share.`,
          "reported"
        ),
      ],
    },
  ];

  if (agg.f1?.issued) {
    out.push({
      audience: `Students from ${name}`,
      points: [
        r(
          `An estimated ${formatNumber(agg.f1.issued)} F-1 student visas went to ${name} nationals in FY${LATEST_COMPLETE_FY} (apportioned from the national total).`,
          "estimated"
        ),
      ],
    });
  }
  return out;
}

// --- State: workers + employers ---------------------------------------------
export function stateRelevance(code: string): RelevanceSummary[] {
  const agg = stateAggregate(code);
  if (!agg) return [];
  const name = agg.state.name;

  const workerPoints: RelevancePoint[] = [
    r(
      `Tracked employers sponsor about ${formatNumber(agg.totalApprovals)} H-1B workers across ${agg.companies.length} firms with worksites in ${name}.`,
      "estimated"
    ),
  ];
  if (agg.avgWage) {
    workerPoints.push(r(`The average offered wage among those sponsors is ${formatCurrency(agg.avgWage)}.`, "estimated"));
  }
  if (code === "TX" && WARN_LIVE.ok && WARN_LIVE.ytdTotal != null) {
    workerPoints.push(
      r(
        `Texas employers have filed ${formatNumber(WARN_LIVE.ytdTotal)} layoffs across ${WARN_LIVE.ytdCount} WARN notices so far in ${WARN_LIVE.ytdYear} — a live read on local labor stress.`,
        "reported"
      )
    );
  } else if (agg.layoffTotal) {
    workerPoints.push(r(`Tracked WARN layoff notices in ${name} total about ${formatNumber(agg.layoffTotal)} employees.`, "estimated"));
  }

  const topNames = agg.companies.slice(0, 3).map((c) => c.name.split(" ")[0]);
  return [
    { audience: `${name} workers`, points: workerPoints },
    {
      audience: `${name} employers`,
      points: [
        r(
          topNames.length
            ? `The largest tracked H-1B sponsors with ${name} worksites include ${topNames.join(", ")}.`
            : `No tracked H-1B sponsors have major worksites here.`,
          "estimated"
        ),
        r(`Sponsorship volume alone does not indicate that any U.S. worker was displaced — see methodology.`, "reported"),
      ],
    },
  ];
}

// --- International students (visa page) --------------------------------------
export function studentRelevance(): RelevanceSummary {
  const points: RelevancePoint[] = [];
  const f1Last = visaSeries("F-1").find((v) => v.fiscalYear === LATEST_COMPLETE_FY)?.issued;
  const f1Ytd = visaSeries("F-1").find((v) => v.fiscalYear === CURRENT_FY)?.issued;
  if (f1Last) points.push(r(`${formatNumber(f1Last)} F-1 student visas were issued in FY${LATEST_COMPLETE_FY}.`, "reported"));
  if (f1Last && f1Ytd) {
    const proj = Math.round(f1Ytd / FY2026_ELAPSED);
    const pct = ((proj - f1Last) / f1Last) * 100;
    points.push(
      r(
        `FY${CURRENT_FY} is running ~${Math.abs(Math.round(pct))}% ${pct < 0 ? "below" : "above"} last year's pace (projected full-year ~${formatCompact(proj)}).`,
        "projected"
      )
    );
  }
  const topCountries = visaByCountry
    .filter((v) => v.visaClass === "F-1")
    .sort((a, b) => b.issued - a.issued)
    .slice(0, 2)
    .map((v) => v.country)
    .filter(Boolean);
  if (topCountries.length === 2) {
    points.push(r(`The largest estimated source countries for F-1 students are ${topCountries[0]} and ${topCountries[1]}.`, "estimated"));
  }
  return { audience: "International students", points };
}

// --- Persona experience: "What does this mean for me?" ----------------------
// National-level summaries for the four audiences who land here most. Computed
// from the dataset; data context, never advice.
export function personaSummaries(): PersonaSummary[] {
  const h24 = H1B_NATIONAL[EMPLOYER_LATEST_FY]; // FY2024 final
  const h25 = H1B_NATIONAL[LATEST_COMPLETE_FY]; // FY2025 preliminary
  const india = visaByCountry
    .filter((v) => v.visaClass === "H-1B")
    .sort((a, b) => b.issued - a.issued)[0];
  const indiaShare = india ? (india.issued / h24.approvals) * 100 : 0;

  const f1 = (fy: number) => visaSeries("F-1").find((v) => v.fiscalYear === fy)?.issued ?? 0;
  const eb = (fy: number) =>
    visaSeries("EB (employment-based IV)").find((v) => v.fiscalYear === fy)?.issued ?? 0;
  const f1Proj = Math.round(f1(CURRENT_FY) / FY2026_ELAPSED);
  const f1PacePct = pct(f1Proj, f1(LATEST_COMPLETE_FY));
  const ebProj = Math.round(eb(CURRENT_FY) / FY2026_ELAPSED);
  const ebPacePct = pct(ebProj, eb(LATEST_COMPLETE_FY));

  const sponsors = topSponsors(EMPLOYER_LATEST_FY);
  const top3 = sponsors.slice(0, 3).reduce((s, c) => s + c.approvals, 0);
  const totApprovals = sponsors.reduce((s, c) => s + c.approvals, 0);
  const top3Share = h24.approvals ? (top3 / h24.approvals) * 100 : 0;
  const wtWage = totApprovals
    ? Math.round(sponsors.reduce((s, c) => s + c.avgWage * c.approvals, 0) / totApprovals)
    : 0;

  const apprPct = pct(h25.approvals, h24.approvals);

  return [
    {
      key: "h1b-worker",
      label: "H-1B worker",
      question: "What does the data mean for H-1B workers?",
      points: [
        r(
          `H-1B approvals were ${formatNumber(h24.approvals)} in FY${EMPLOYER_LATEST_FY}; the preliminary FY${LATEST_COMPLETE_FY} figure is ~${formatNumber(
            h25.approvals
          )} — about ${Math.abs(Math.round(apprPct))}% ${apprPct < 0 ? "lower" : "higher"}.`,
          "projected"
        ),
        r(
          `${india?.country ?? "India"} nationals received ~${Math.round(indiaShare)}% of all approvals, so cap and fee changes land hardest on them.`,
          "reported"
        ),
        r(
          `Denials edged up from ~${formatNumber(h24.denials)} (FY${EMPLOYER_LATEST_FY}) toward ~${formatNumber(h25.denials)} (FY${LATEST_COMPLETE_FY} preliminary).`,
          "projected"
        ),
        r(
          `Two recent changes affect applicants: USCIS moved to beneficiary-centric registration (FY2025 cap) and raised filing fees (April 2024).`,
          "reported"
        ),
      ],
      links: [
        { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
        { href: "/timeline", label: "Policy timeline" },
        { href: "/explained", label: "How H-1B works" },
      ],
    },
    {
      key: "f1-student",
      label: "International student",
      question: "What does the data mean for F-1 students?",
      points: [
        r(
          `F-1 student visa issuances were ${formatNumber(f1(EMPLOYER_LATEST_FY))} in FY${EMPLOYER_LATEST_FY} and ${formatNumber(
            f1(LATEST_COMPLETE_FY)
          )} in FY${LATEST_COMPLETE_FY}.`,
          "reported"
        ),
        r(
          `FY${CURRENT_FY} is running ~${Math.abs(Math.round(f1PacePct))}% ${f1PacePct < 0 ? "below" : "above"} last year's pace (projected full-year ~${formatCompact(
            f1Proj
          )}).`,
          "projected"
        ),
        r(`A visa is counted when an embassy issues it — separate from school enrollment or your status once inside the U.S.`, "reported"),
        r(`After graduation, many students move to OPT and then the H-1B cap lottery — where India and China face the most competition.`, "reported"),
      ],
      links: [
        { href: "/visa/f1-student-visas", label: "Student visa tracker" },
        { href: "/explained", label: "Issuance vs approval" },
      ],
    },
    {
      key: "employer",
      label: "Employer",
      question: "What does the data mean for employers?",
      points: [
        r(
          `The 3 largest sponsors filed ~${Math.round(top3Share)}% of all FY${EMPLOYER_LATEST_FY} H-1B approvals — sponsorship is concentrated among a few firms.`,
          "reported"
        ),
        r(`The approval-weighted average offered wage across top tracked sponsors is ${formatCurrency(wtWage)}.`, "estimated"),
        r(
          `National approvals eased ~${Math.abs(Math.round(apprPct))}% from FY${EMPLOYER_LATEST_FY} to the preliminary FY${LATEST_COMPLETE_FY} total.`,
          "projected"
        ),
        r(`Plan around the April 2024 fee increase and the beneficiary-centric registration, which curbed duplicate filings.`, "reported"),
      ],
      links: [
        { href: "/h1b/top-sponsors", label: "Sponsor benchmarks" },
        { href: "/layoffs-vs-h1b", label: "Layoffs vs sponsorship" },
        { href: "/timeline", label: "Policy timeline" },
      ],
    },
    {
      key: "eb-applicant",
      label: "Green-card applicant",
      question: "What does the data mean for employment-based green cards?",
      points: [
        r(
          `Employment-based immigrant visa issuances were ~${formatNumber(eb(EMPLOYER_LATEST_FY))} in FY${EMPLOYER_LATEST_FY} and ~${formatNumber(
            eb(LATEST_COMPLETE_FY)
          )} in FY${LATEST_COMPLETE_FY}.`,
          "reported"
        ),
        r(
          `FY${CURRENT_FY} is running ~${Math.abs(Math.round(ebPacePct))}% ${ebPacePct < 0 ? "below" : "above"} last year's pace (projected ~${formatCompact(
            ebProj
          )}).`,
          "projected"
        ),
        r(`Employment-based green cards are capped per country, so applicants born in high-demand countries such as India and China face the longest waits.`, "reported"),
        r(`An H-1B is a temporary work visa; an employment-based green card is permanent residence — different processes and queues.`, "reported"),
      ],
      links: [
        { href: "/visa/f1-student-visas", label: "Visa flow tracker" },
        { href: "/explained", label: "Visa vs green card" },
        { href: "/timeline", label: "Policy timeline" },
      ],
    },
  ];
}

// --- Employers / HR teams (H-1B pages) --------------------------------------
export function employerRelevance(): RelevanceSummary {
  const sponsors = topSponsors(EMPLOYER_LATEST_FY);
  const national = H1B_NATIONAL[EMPLOYER_LATEST_FY].approvals;
  const top3 = sponsors.slice(0, 3);
  const top3Sum = top3.reduce((s, c) => s + c.approvals, 0);
  const share = national ? (top3Sum / national) * 100 : 0;
  const totApprovals = sponsors.reduce((s, c) => s + c.approvals, 0);
  const wtWage = totApprovals
    ? Math.round(sponsors.reduce((s, c) => s + c.avgWage * c.approvals, 0) / totApprovals)
    : 0;

  return {
    audience: "Employers & HR teams",
    points: [
      r(
        `The 3 largest sponsors filed ${formatNumber(top3Sum)} of ${formatNumber(national)} H-1B approvals (~${Math.round(share)}%) in FY${EMPLOYER_LATEST_FY} — the program is concentrated among a few firms.`,
        "reported"
      ),
      wtWage
        ? r(`The approval-weighted average offered wage across the top tracked sponsors is ${formatCurrency(wtWage)}.`, "estimated")
        : r(`Offered-wage data comes from DOL LCA disclosures for the latest available year.`, "reported"),
    ],
  };
}
