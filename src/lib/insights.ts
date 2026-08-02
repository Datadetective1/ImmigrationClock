// =============================================================================
// INSIGHT ENGINE — auto-generated narrative cards computed from the dataset.
//
// Each insight turns figures we already have into a plain-language claim with a
// source and an integrity label (reported / projected / estimated). Everything
// is computed from the data (never hardcoded prose with stale numbers), so the
// cards update automatically when the snapshot changes. We state direction and
// magnitude — never causation.
// =============================================================================
import { topSponsors, LIVE_BLS } from "./data";
import { warnH1bCrossLink } from "./warn";
import { WARN_SOURCE, WARN_SUMMARY } from "./warn-summary";
import { EMPLOYERS_META } from "./employers";
import {
  cbpRows,
  iceByFy,
  H1B_NATIONAL,
  visaByCountry,
  visaRows,
  DETENTION_NOW,
  pointInTimeAge,
  UPDATED,
  EMPLOYER_LATEST_FY,
  LATEST_COMPLETE_FY,
  CURRENT_FY,
  FY2026_ELAPSED,
} from "./dataset";
import { formatCompact, formatNumber } from "./format";
import type { Insight } from "./types";

const SRC = {
  uscis: {
    sourceName: "USCIS H-1B Employer Data Hub",
    sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
  },
  cbp: {
    sourceName: "CBP Nationwide Encounters",
    sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
  },
  ice: {
    sourceName: "ICE Enforcement and Removal Statistics",
    sourceUrl: "https://www.ice.gov/statistics",
  },
  dos: {
    sourceName: "Department of State Visa Statistics",
    sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
  },
};

function pctChange(now: number, base: number): number {
  return base ? ((now - base) / base) * 100 : 0;
}
function signedPct(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
}

/** Build the full set of insight cards from the current dataset snapshot. */
export function buildInsights(): Insight[] {
  const out: Insight[] = [];
  const national = H1B_NATIONAL[EMPLOYER_LATEST_FY].approvals;

  // --- 1. Employer concentration (workforce, reported) ---------------------
  const sponsors = topSponsors(EMPLOYER_LATEST_FY);
  const top3 = sponsors.slice(0, 3);
  const top3Sum = top3.reduce((s, c) => s + c.approvals, 0);
  const top3Share = (top3Sum / national) * 100;
  const top3Names = top3.map((c) => c.name.split(" ")[0]);
  out.push({
    key: "employer-concentration",
    stat: `${Math.round(top3Share)}%`,
    headline: `The 3 biggest sponsors account for ~${Math.round(top3Share)}% of all U.S. H-1B approvals`,
    detail: `${top3Names.join(", ")} together filed ${formatNumber(top3Sum)} of ${formatNumber(
      national
    )} H-1B approvals in FY${EMPLOYER_LATEST_FY} — a small group of firms drives a large share of the program.`,
    whyItMatters:
      "H-1B is often debated as if usage were spread evenly. In reality a handful of large employers dominate filings, so policy changes land hardest on them.",
    group: "workforce",
    provenance: "reported",
    periodLabel: `FY${EMPLOYER_LATEST_FY}`,
    href: "/h1b/top-sponsors",
    ...SRC.uscis,
    sourceUpdatedAt: UPDATED.uscis_h1b,
  });

  // --- 2. Country concentration (visa, reported) ---------------------------
  const h1bByCountry = visaByCountry
    .filter((v) => v.visaClass === "H-1B")
    .sort((a, b) => b.issued - a.issued);
  const first = h1bByCountry[0];
  const second = h1bByCountry[1];
  if (first && second) {
    const share = (first.issued / national) * 100;
    const ratio = first.issued / second.issued;
    out.push({
      key: "country-concentration",
      stat: `${Math.round(share)}%`,
      headline: `${first.country} received ${Math.round(share)}% of all H-1B approvals in FY${EMPLOYER_LATEST_FY}`,
      detail: `${formatNumber(first.issued)} of ${formatNumber(national)} approvals went to ${
        first.country
      } nationals — more than ${ratio.toFixed(1)}× the next country (${second.country}, ${formatNumber(
        second.issued
      )}).`,
      whyItMatters: `Because the program is so concentrated by nationality, any change to H-1B rules falls disproportionately on one country's applicants.`,
      group: "visa",
      provenance: "reported",
      periodLabel: `FY${EMPLOYER_LATEST_FY}`,
      href: `/country/${first.country?.toLowerCase()}`,
      ...SRC.uscis,
      sourceUpdatedAt: UPDATED.uscis_h1b,
    });
  }

  // --- 3. Border vs peak (border, reported) --------------------------------
  const nwRows = cbpRows.filter(
    (r) => r.border === "nationwide" && r.fiscalYear <= LATEST_COMPLETE_FY
  );
  const peak = nwRows.reduce((m, r) => (r.totalEncounters > m.totalEncounters ? r : m), nwRows[0]);
  const latestComplete = nwRows.find((r) => r.fiscalYear === LATEST_COMPLETE_FY);
  if (peak && latestComplete && peak.fiscalYear !== latestComplete.fiscalYear) {
    const drop = pctChange(latestComplete.totalEncounters, peak.totalEncounters);
    out.push({
      key: "border-vs-peak",
      stat: signedPct(drop),
      headline: `Border encounters fell ~${Math.abs(Math.round(drop))}% from their FY${peak.fiscalYear} peak`,
      detail: `Nationwide CBP encounters dropped from ${formatCompact(peak.totalEncounters)} in FY${
        peak.fiscalYear
      } to ${formatCompact(latestComplete.totalEncounters)} in FY${latestComplete.fiscalYear}.`,
      whyItMatters:
        "Encounters are the figure most often cited in border debates. They are now at multi-decade lows — an encounter is an event, not a person, and is not a deportation.",
      group: "border",
      provenance: "reported",
      trend: "DOWN",
      periodLabel: `FY${peak.fiscalYear} → FY${latestComplete.fiscalYear}`,
      href: "/border/encounters",
      ...SRC.cbp,
      sourceUpdatedAt: UPDATED.cbp_encounters,
    });
  }

  // --- 4. Detention vs the last reported average (enforcement, reported) ---
  // This headline previously made an all-time superlative claim about the
  // detention figure. We do not hold the historical series needed to support one,
  // so it was removed on 2026-08-01. The comparison we CAN source is against the
  // last reported fiscal-year average, which is what the headline now states.
  const detBase = iceByFy[EMPLOYER_LATEST_FY].detentionAvgDaily;
  const detPct = pctChange(DETENTION_NOW.value, detBase);
  const detAge = pointInTimeAge(DETENTION_NOW.asOf, DETENTION_NOW.staleAfterDays);
  out.push({
    key: "detention-vs-fy-average",
    stat: formatCompact(DETENTION_NOW.value),
    headline: `ICE detention stood at ~${formatCompact(DETENTION_NOW.value)} on ${
      DETENTION_NOW.asOf
    } — about ${Math.round(detPct)}% above the FY${EMPLOYER_LATEST_FY} daily average`,
    detail:
      `A point-in-time count of people held on one specific day, compared with the FY${EMPLOYER_LATEST_FY} ` +
      `average daily population (${formatNumber(detBase)}).` +
      (detAge.stale
        ? ` This snapshot is ${detAge.days} days old — ICE has very likely published newer figures since, so treat it as dated rather than current.`
        : ""),
    whyItMatters:
      "Detention capacity is a concrete, fundable constraint on enforcement — it tends to move before removal totals do. It is a stock, not a flow, and cannot be added to arrests or removals.",
    group: "enforcement",
    provenance: "reported",
    trend: "UP",
    periodLabel: `Snapshot · ${DETENTION_NOW.asOf}`,
    href: "/immigration/enforcement-trends",
    ...SRC.ice,
    sourceUpdatedAt: UPDATED.ice_stats,
  });

  // --- 5. F-1 student visa pace (visa, projected) --------------------------
  const f1Ytd = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === CURRENT_FY)?.issued;
  const f1Last = visaRows.find(
    (v) => v.visaClass === "F-1" && v.fiscalYear === LATEST_COMPLETE_FY
  )?.issued;
  if (f1Ytd && f1Last) {
    const f1Proj = Math.round(f1Ytd / FY2026_ELAPSED);
    const f1Pct = pctChange(f1Proj, f1Last);
    out.push({
      key: "f1-pace",
      stat: signedPct(f1Pct),
      headline: `F-1 student visas are running ~${Math.abs(Math.round(f1Pct))}% ${
        f1Pct < 0 ? "below" : "above"
      } last year's pace`,
      detail: `At the current pace, FY${CURRENT_FY} would finish near ${formatCompact(
        f1Proj
      )} issuances vs ${formatCompact(f1Last)} in FY${LATEST_COMPLETE_FY}.`,
      whyItMatters:
        "International students are a leading indicator for universities and the future skilled-worker pipeline — they often respond to policy faster than employment visas.",
      group: "visa",
      provenance: "projected",
      trend: f1Pct < 0 ? "DOWN" : "UP",
      periodLabel: `FY${CURRENT_FY} pace vs FY${LATEST_COMPLETE_FY}`,
      href: "/visa/f1-student-visas",
      ...SRC.dos,
      sourceUpdatedAt: UPDATED.dos_visa,
    });
  }

  // --- 6. Layoffs alongside sponsorship (workforce, reported) -------------
  // Built from the real WARN × USCIS join, not from modeled per-company totals.
  const byLayoffs = warnH1bCrossLink()
    .filter((c) => c.layoffs > 0 && c.approvals > 0)
    .sort((a, b) => b.layoffs - a.layoffs);
  const topLayoff = byLayoffs[0];
  if (topLayoff) {
    out.push({
      key: "layoffs-vs-sponsorship",
      stat: formatCompact(topLayoff.layoffs),
      headline: `${topLayoff.name}: ${formatCompact(topLayoff.layoffs)} employees in WARN notices, alongside ${formatNumber(
        topLayoff.approvals
      )} H-1B approvals`,
      detail:
        `${formatNumber(byLayoffs.length)} employers appear in both the state WARN feed and the USCIS H-1B ` +
        `employer directory. Both figures are reported records from their own agencies. This does NOT prove ` +
        `anyone was replaced — the datasets do not identify the immigration status of affected workers.`,
      whyItMatters:
        "This is the comparison that fuels the loudest claims online. Seeing both reported numbers together — with the causation caveat — is more useful than either in isolation.",
      group: "workforce",
      provenance: "reported",
      periodLabel: `WARN notices · H-1B FY${EMPLOYERS_META.fiscalYear}`,
      href: "/layoffs-vs-h1b",
      sourceName: "USCIS H-1B Employer Data Hub + state WARN portals",
      sourceUrl: WARN_SOURCE.sourceUrl,
      sourceUpdatedAt: WARN_SOURCE.sourceUpdatedAt,
    });
  }

  // --- 7. WARN layoffs across the covered states (workforce, reported) ----
  const warnThisYear = WARN_SUMMARY.byYear.find((y) => y.year === CURRENT_FY);
  const warnLastYear = WARN_SUMMARY.byYear.find((y) => y.year === CURRENT_FY - 1);
  if (warnThisYear) {
    out.push({
      key: "warn-current-year",
      stat: formatCompact(warnThisYear.employees),
      headline: `${formatCompact(warnThisYear.employees)} employees covered by WARN notices so far in ${CURRENT_FY}`,
      detail:
        `${formatNumber(warnThisYear.notices)} notices filed with state agencies across ` +
        `${WARN_SUMMARY.stateCount} states (${WARN_SUMMARY.stateCodes.join(", ")})` +
        (warnLastYear
          ? `. For context, the same states recorded ${formatNumber(warnLastYear.employees)} employees across ` +
            `${formatNumber(warnLastYear.notices)} notices in all of ${CURRENT_FY - 1}.`
          : ".") +
        " This is not a national total — most states do not publish WARN data in a machine-readable form.",
      whyItMatters:
        "WARN notices are the earliest official signal of large layoffs. They are filed with state agencies before the layoffs happen, which makes them a leading indicator of labor stress — separate from visa policy.",
      group: "workforce",
      provenance: "reported",
      periodLabel: `${CURRENT_FY} YTD · ${WARN_SUMMARY.stateCount} states`,
      href: "/layoffs",
      sourceName: WARN_SOURCE.sourceName,
      sourceUrl: WARN_SOURCE.sourceUrl,
      sourceUpdatedAt: WARN_SOURCE.sourceUpdatedAt,
    });
  }

  // --- 8. Live labor-market backdrop (workforce, reported, near-live) ------
  if (LIVE_BLS.value != null) {
    out.push({
      key: "unemployment-backdrop",
      stat: `${LIVE_BLS.value}%`,
      headline: `U.S. unemployment is ${LIVE_BLS.value}% — the labor-market backdrop for the debate`,
      detail: `National seasonally-adjusted unemployment (${
        LIVE_BLS.period ?? "latest release"
      }), fetched live from the BLS Public Data API when this site was last built.`,
      whyItMatters:
        "Arguments about immigration and jobs depend heavily on the underlying labor market. This is the one figure here that is genuinely near-live.",
      group: "workforce",
      provenance: "reported",
      periodLabel: LIVE_BLS.period ?? "Latest release",
      sourceName: LIVE_BLS.sourceName,
      sourceUrl: LIVE_BLS.sourceUrl,
      sourceUpdatedAt: LIVE_BLS.sourceUpdatedAt ?? UPDATED.bls_wages,
    });
  }

  return out;
}
