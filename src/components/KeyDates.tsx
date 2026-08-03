"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  type KeyDate,
  CATEGORY_LABEL,
  nextOccurrence,
  daysUntil,
} from "@/lib/key-dates";
import { partnersByIds } from "@/lib/partners";
import { withPlacement, trackPartnerClick } from "@/lib/partner-link";

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

interface Row {
  d: KeyDate;
  next: Date | null;
  dleft: number | null;
}

function Countdown({ row }: { row: Row }) {
  const { d, next, dleft } = row;
  // Cadence-only items (monthly bulletin, per-student OPT) show their cadence.
  if (dleft == null || next == null) {
    return (
      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300">
        {d.cadence ?? "Recurring"}
      </span>
    );
  }
  const urgent = dleft <= 14;
  const soon = dleft <= 45;
  const tone = urgent
    ? "border-status-red/40 bg-status-red/15 text-status-red"
    : soon
      ? "border-status-amber/40 bg-status-amber/15 text-status-amber"
      : "border-accent/30 bg-accent/10 text-accent-soft";
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
        {dleft === 0 ? "Today" : dleft === 1 ? "Tomorrow" : `In ${dleft} days`}
      </span>
      <span className="text-xs text-slate-500">
        {d.approx ? "~" : ""}
        {fmt(next)}
      </span>
    </span>
  );
}

/**
 * "Key immigration dates" — the honest urgency module. Countdown is computed on
 * the client from the visitor's real date, so it stays accurate on a static build.
 * Each date links its official source and the partner that helps you act on it.
 */
export function KeyDates({
  dates,
  placement,
  title = "Key immigration dates",
  subtitle = "Real deadlines, counted down. Don't miss the window.",
  limit,
}: {
  dates: KeyDate[];
  placement: string;
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const rows: Row[] = dates.map((d) => {
    if (now && d.month && d.day) {
      const next = nextOccurrence(d.month, d.day, now);
      return { d, next, dleft: daysUntil(next, now) };
    }
    return { d, next: null, dleft: null };
  });

  // Before mount (and on the server) keep catalog order to avoid a hydration
  // mismatch; once we know "today", sort soonest-first with cadence items last.
  if (now) rows.sort((a, b) => (a.dleft ?? Infinity) - (b.dleft ?? Infinity));
  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-status-amber/60 to-transparent" />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow mb-1 flex items-center gap-1.5 text-status-amber">
            <span aria-hidden>⏳</span> Key dates
          </div>
          <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
        </div>
        <Link href="/key-dates" className="text-xs font-semibold text-accent hover:text-accent-soft">
          All dates →
        </Link>
      </div>

      <ul className="mt-3 space-y-2">
        {shown.map(({ d, next, dleft }) => {
          const partners = partnersByIds(d.partnerIds).slice(0, 2);
          const place = `${placement}-${d.id}`;
          return (
            <li
              key={d.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {CATEGORY_LABEL[d.category]}
                    </span>
                    <h3 className="text-sm font-semibold text-white">{d.title}</h3>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{d.detail}</p>
                </div>
                <Countdown row={{ d, next, dleft }} />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/5 pt-2">
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-slate-400 hover:text-white"
                >
                  {d.sourceName} ↗
                </a>
                {partners.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Get help:</span>
                    {partners.map((p) => (
                      <a
                        key={p.id}
                        href={withPlacement(p.href, place)}
                        target="_blank"
                        rel="sponsored nofollow noopener noreferrer"
                        onClick={() => trackPartnerClick(p.id, place)}
                        className="font-semibold text-accent hover:text-accent-soft"
                      >
                        {p.name}
                      </a>
                    ))}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Dates recur each year; exact windows (H-1B registration, the DV lottery, the Visa Bulletin) are set
        by the agency annually — always confirm with the official source. Not legal or tax advice. Some
        &ldquo;get help&rdquo; links are partnerships.{" "}
        <Link href="/disclosure" className="link-accent">
          How this works →
        </Link>
      </p>
    </section>
  );
}
