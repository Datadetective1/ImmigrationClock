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

const r = (text: string, provenance: Provenance): RelevancePoint => ({ text, provenance });

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
