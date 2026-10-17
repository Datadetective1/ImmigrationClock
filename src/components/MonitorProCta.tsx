"use client";

// The paid step on /monitor: the page professionals land on had no route to
// Pro at all. One panel, in the page's own style, after the inbox it extends.

import Link from "next/link";
import { trackPremiumInterest } from "@/lib/analytics";
import { PLAN_BY_ID } from "@/lib/billing/plans";

export function MonitorProCta() {
  const pro = PLAN_BY_ID.get("pro")!;
  return (
    <section aria-labelledby="monitor-pro-heading" className="mt-8 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
      <h2 id="monitor-pro-heading" className="text-sm font-semibold text-white">
        Get this for your own watchlist
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
        Pro turns this inbox into your Briefing: the visas, countries and agencies your clients care about,
        an email when a recorded change touches them, upcoming effective dates in your calendar, and briefs
        you can download. ${pro.monthlyUsd} a month or ${pro.annualUsd} a year; cancel any time.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/briefing/example"
          onClick={() => trackPremiumInterest("pro_briefing", "monitor_example")}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-slate-100 hover:border-accent/40"
        >
          See an example Briefing
        </Link>
        <Link
          href="/pricing"
          onClick={() => trackPremiumInterest("pro_briefing", "monitor")}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 hover:bg-accent-soft"
        >
          See Pro pricing
        </Link>
      </div>
    </section>
  );
}
