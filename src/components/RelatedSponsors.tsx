// =============================================================================
// RELATED SPONSORS — the way out of an employer page
//
// The 2,614 /employer/* pages are the site's largest family and its most common
// organic landing point, and not one of them linked to another employer. The
// only routes out were the breadcrumb, /layoffs, and the USCIS source: a reader
// who arrived on Wipro and wanted Infosys had to go back to the directory and
// search again.
//
// WHAT MAKES THESE LINKS HONEST
// -----------------------------
// Both groupings are facts about the committed snapshot, not inferred affinity.
// EMPLOYERS is pre-sorted by approvals, so a window around this employer's rank
// really is "the sponsors either side of you by volume"; and topState is a
// recorded field on all 2,614 rows. Nothing here claims two employers are
// similar in industry, hiring, or practice — only that the data puts them next
// to each other, and each heading says which.
// =============================================================================

import Link from "next/link";
import { displayEmployer, type DirectoryEmployer, type RelatedSponsors as Related } from "@/lib/employers";
import { formatNumber } from "@/lib/format";
import { TrackedLink } from "./TrackedLink";

function SponsorList({
  heading,
  note,
  employers,
  relation,
}: {
  heading: string;
  note: string;
  employers: DirectoryEmployer[];
  /** Why these were offered, for the click event. */
  relation: string;
}) {
  if (employers.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{heading}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>
      <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {employers.map((e) => (
          <li key={e.slug}>
            <TrackedLink
              href={`/employer/${e.slug}`}
              surface="related-sponsors"
              relation={relation}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-white/[0.04]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">
                  {displayEmployer(e.name)}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {formatNumber(e.approvals)} approvals · {e.topState}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-accent">
                →
              </span>
            </TrackedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RelatedSponsors({ related, name }: { related: Related; name: string }) {
  if (related.byVolume.length === 0 && related.byState.length === 0) return null;
  return (
    <section className="panel panel-pad space-y-5">
      <div>
        <span className="eyebrow text-accent">Compare sponsors</span>
        <h2 className="mt-1 text-base font-semibold text-white">
          Other employers in the same H-1B record
        </h2>
      </div>
      <SponsorList
        heading="Nearest by sponsorship volume"
        note={`Ranked immediately above and below ${name} by FY approvals in the USCIS Data Hub.`}
        employers={related.byVolume}
        relation="volume"
      />
      {related.state ? (
        <SponsorList
          heading={`Also concentrated in ${related.state}`}
          note={`Sponsors whose approvals are recorded mainly in ${related.state}, the same state as ${name}.`}
          employers={related.byState}
          relation="state"
        />
      ) : null}
      <p className="text-xs text-slate-500">
        Proximity here is sponsorship volume and worksite state — not a claim about industry, hiring
        practice, or similarity.{" "}
        <Link href="/h1b/employers" className="link-accent">
          Search all sponsors
        </Link>
        .
      </p>
    </section>
  );
}
