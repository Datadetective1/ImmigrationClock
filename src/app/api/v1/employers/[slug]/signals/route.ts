// =============================================================================
// GET /api/v1/employers/{slug}/signals — the join, as data
//
// This is the endpoint that makes the case for ImmigrationClock as an
// intelligence layer rather than a website, because it is the one thing here
// that no government source publishes: an employer's H-1B sponsorship record
// and its state WARN layoff filings, matched on a normalized name.
//
// Verified against the committed data rather than assumed: 7,457 WARN notices
// across 5,834 employers in five states, 2,614 H-1B sponsors in the FY2023
// USCIS export, and 162 employers present in both. The overlap signal exists
// for those 162; the single-sided signals exist for the rest.
//
// EVERY SIGNAL SHOWS ITS WORKING — the source fact, how the join was made, why
// this employer matched, and the caveat that must travel with it. A consumer
// can render all four, and one that renders only the fact is at least unable to
// claim we did not say so.
//
// Prerendered per employer in the directory: the data changes when a build
// ships, so this is a static file rather than a function invocation.
// =============================================================================

import {
  EMPLOYERS,
  EMPLOYERS_META,
  employerBySlug,
  h1bFilersOnRelatedKeys,
  h1bFilersSharingKey,
} from "@/lib/employers";
import { WARN_META, warnEmployersSharingKey, warnForEmployer } from "@/lib/warn";
import { ATTRIBUTION } from "@/lib/intelligence/change";
import { employerSignals, type H1bSide, type WarnSide } from "@/lib/intelligence/employer-signals";

export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams(): { slug: string }[] {
  return EMPLOYERS.map((e) => ({ slug: e.slug }));
}

export async function GET(_request: Request, { params }: { params: { slug: string } }): Promise<Response> {
  const found = employerBySlug(params.slug);

  if (!found) {
    return Response.json(
      {
        error: "not_found",
        message:
          "No employer has that slug in the H-1B directory. Slugs match the /employer/ URLs; the " +
          "directory covers employers with at least 10 approvals in the USCIS export.",
      },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const employer = found.employer;
  const warn = warnForEmployer(employer.name);

  const h1bSide: H1bSide = {
    slug: employer.slug,
    name: employer.name,
    approvals: employer.approvals,
    denials: employer.denials,
    fiscalYear: String(EMPLOYERS_META.fiscalYear),
    sourceName: EMPLOYERS_META.sourceName,
    sourceUrl: EMPLOYERS_META.sourceUrl,
    // Passed so the overlap signal can say whether this key represents one
    // company or several. Without it the join silently reports one entity's
    // figures under a group's name.
    siblingNames: h1bFilersSharingKey(employer.name),
    relatedFilers: h1bFilersOnRelatedKeys(employer.name),
  };

  const warnSide: WarnSide | null = warn
    ? {
        slug: employer.slug,
        name: employer.name,
        notices: warn.summary.notices,
        employees: warn.summary.employees,
        states: warn.summary.states,
        latestNotice: warn.summary.latestNotice ?? null,
        siblingNames: warnEmployersSharingKey(employer.name),
      }
    : null;

  const signals = employerSignals(
    warnSide,
    h1bSide,
    `Employer slug "${employer.slug}" in the H-1B employer directory.`
  );

  return Response.json(
    {
      data: {
        employer: {
          slug: employer.slug,
          name: employer.name,
          url: `${ATTRIBUTION.publisherUrl}/employer/${employer.slug}`,
          h1bRank: found.rank,
        },
        signals,
        coverage: {
          // What the absence of a signal means. Without this a caller reads
          // "no WARN signal" as "no layoffs", which is false for 45 states.
          warnStates: WARN_META.stateCount,
          warnCoverageNote: WARN_META.coverageNote,
          h1bFiscalYear: String(EMPLOYERS_META.fiscalYear),
          h1bMinimumApprovals: EMPLOYERS_META.minApprovals,
          absenceMeaning:
            "A missing WARN signal means no notice matched this employer name in the states we " +
            "cover, not that no layoff occurred. A missing H-1B signal means the employer is " +
            "below the directory's approval threshold, not that it does not sponsor.",
        },
      },
      attribution: ATTRIBUTION,
    },
    {
      status: 200,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400" },
    }
  );
}
