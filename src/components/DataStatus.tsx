"use client";

import Link from "next/link";
import { SOURCE_BY_KEY, monthsSinceVerified } from "@/lib/sources";
import { ProvenanceTag } from "./ProvenanceTag";
import { trackSourceClick } from "@/lib/analytics";
import { formatDate } from "@/lib/format";
import type { Provenance } from "@/lib/types";

/**
 * THE DATA-FRESHNESS CONTRACT.
 *
 * Founder Directive Part 4: "Every major page should communicate: Source · Last
 * refreshed · Data-through date · Published date · Methodology. Users should
 * always know how current the information is."
 *
 * This component is that contract in one place, so no page can accidentally ship
 * a partial version of it. It reads from the canonical source registry rather
 * than accepting free-text, which means a page cannot invent a source name or
 * quietly drift from what the registry says.
 *
 * The five dates it distinguishes are genuinely different things, and conflating
 * them is the most common way a data site misleads without lying:
 *
 *   Published    — when the agency released this figure.
 *   Data through — the last period the figure actually covers.
 *   Refreshed    — when our pipeline last pulled it.
 *   Verified     — when a human last confirmed the source is still what we claim.
 *   Classified   — reported / projected / estimated / modeled.
 */
export function DataStatus({
  sourceKey,
  dataThrough,
  publishedAt,
  refreshedAt,
  provenance,
  surface = "unknown",
  className = "",
}: {
  /** Key into the canonical source registry (src/lib/sources.ts). */
  sourceKey: string;
  /** Last period the figures on this page cover, e.g. "FY2023" or "2026-07-29". */
  dataThrough?: string | null;
  /** When the agency published. Falls back to the registry's verification date. */
  publishedAt?: string | null;
  /** When our pipeline last fetched. Omit for curated sources. */
  refreshedAt?: string | null;
  /** Classification of the figures on this page. */
  provenance?: Provenance;
  surface?: string;
  className?: string;
}) {
  const src = SOURCE_BY_KEY[sourceKey];
  if (!src) return null;

  const staleMonths = monthsSinceVerified(sourceKey) ?? 0;
  const verificationOverdue = staleMonths >= 6;

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Source",
      value: (
        <a
          href={src.datasetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSourceClick(src.key, surface)}
          className="link-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {src.name} ↗
        </a>
      ),
    },
    { label: "Publisher", value: src.agency },
  ];

  if (dataThrough) rows.push({ label: "Data through", value: formatDate(dataThrough) });
  if (publishedAt) rows.push({ label: "Published", value: formatDate(publishedAt) });
  if (refreshedAt && src.ingestion !== "curated") {
    rows.push({ label: "Refreshed", value: formatDate(refreshedAt) });
  }
  rows.push({
    label: "Verified",
    value: (
      <span className={verificationOverdue ? "text-status-amber" : undefined}>
        {formatDate(src.lastVerifiedAt)}
        {verificationOverdue ? ` · ${staleMonths} months ago` : null}
      </span>
    ),
  });
  if (provenance) {
    rows.push({ label: "Classification", value: <ProvenanceTag provenance={provenance} /> });
  }
  rows.push({
    label: "How it arrives",
    value:
      src.ingestion === "curated"
        ? "Transcribed by hand from the published report"
        : src.ingestion === "planned"
          ? "Registered, not yet ingested"
          : "Fetched automatically",
  });

  return (
    <section
      aria-label="Data source and freshness"
      className={`rounded-xl border border-white/10 bg-white/[0.02] p-4 ${className}`}
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Where this data comes from
      </h2>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <dt className="shrink-0 text-slate-500">{r.label}</dt>
            <dd className="text-slate-300">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-white/5 pt-3 text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-slate-400">Known limitations: </span>
        {src.limitations}{" "}
        <Link href="/methodology" className="link-accent">
          Full methodology →
        </Link>
      </p>
    </section>
  );
}
