// =============================================================================
// INSIGHT ENGINE — auto-generated narrative cards computed from the dataset.
//
// Each insight turns figures we already have into a plain-language claim with a
// source and an integrity label (reported / projected / estimated). Everything
// is computed from the data (never hardcoded prose with stale numbers), so the
// cards update automatically when the snapshot changes. We state direction and
// magnitude — never causation.
// =============================================================================
import { topSponsors, layoffsVsSponsorship, LIVE_BLS } from "./data";
import {
  cbpRows,
  iceByFy,
  H1B_NATIONAL,
  visaByCountry,
  visaRows,
  DETENTION_NOW,
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

  // --- 4. Detention near record (enforcement, reported) --------------------
  const detBase = iceByFy[EMPLOYER_LATEST_FY].detentionAvgDaily;
  const detPct = pctChange(DETENTION_NOW.value, detBase);
  out.push({
    key: "detention-record",
    stat: formatCompact(DETENTION_NOW.value),
    headline: `ICE detention is near a record ~${formatCompact(DETENTION_NOW.value)} — almost double FY${EMPLOYER_LATEST_FY}`,
    detail: `The point-in-time detained population is up ~${Math.round(
      detPct
    )}% from the FY${EMPLOYER_LATEST_FY} average daily count (${formatNumber(detBase)}).`,
    whyItMatters:
      "Detention capacity is a concrete, fundable constraint on enforcement — it tends to move before removal totals do.",
    group: "enforcement",
    provenance: "reported",
    trend: "UP",
    periodLabel: `As of ${DETENTION_NOW.asOf}`,
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

  // --- 6. Layoffs alongside sponsorship (workforce, estimated) -------------
  const byLayoffs = layoffsVsSponsorship()
    .filter((c) => c.layoffs > 0 && c.approvals > 0)
    .sort((a, b) => b.layoffs - a.layoffs);
  const topLayoff = byLayoffs[0];
  if (topLayoff) {
    out.push({
      key: "layoffs-vs-sponsorship",
      stat: formatCompact(topLayoff.layoffs),
      headline: `${topLayoff.name}: ~${formatCompact(topLayoff.layoffs)} layoffs alongside ${formatNumber(
        topLayoff.approvals
      )} H-1B approvals`,
      detail: `Tracked layoffs and H-1B sponsorship at the same firm, shown side by side. This does NOT prove anyone was replaced — layoffs and sponsorship are separate events.`,
      whyItMatters:
        "This is the comparison that fuels the loudest claims online. Seeing both real numbers together — with the causation caveat — is more useful than either in isolation.",
      group: "workforce",
      provenance: "estimated",
      periodLabel: `Layoffs since 2023 · H-1B FY${EMPLOYER_LATEST_FY}`,
      href: "/layoffs-vs-h1b",
      sourceName: "USCIS + public WARN / layoff notices",
      sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
      sourceUpdatedAt: UPDATED.warn_layoffs,
    });
  }

  // --- 7. Live labor-market backdrop (workforce, reported, near-live) ------
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
