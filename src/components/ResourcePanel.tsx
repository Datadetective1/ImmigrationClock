"use client";

import Link from "next/link";
import type { ResolvedPartner } from "@/lib/partners";

// Append a placement subid so affiliate dashboards can attribute revenue to the
// exact module that drove it (most programs read ?subid= / &subid=). Safe on URLs
// that already carry a query string; never throws.
function withPlacement(href: string, placement: string): string {
  if (!placement) return href;
  try {
    const url = new URL(href);
    if (!url.searchParams.has("subid")) url.searchParams.set("subid", `ic-${placement}`);
    return url.toString();
  } catch {
    return href;
  }
}

// Fire a lightweight outbound event for whatever analytics is present (GA4 via
// gtag, or Plausible). No-op when neither is configured — keeps the static build
// dependency-free.
function trackClick(partnerId: string, placement: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    plausible?: (event: string, opts?: Record<string, unknown>) => void;
  };
  try {
    w.gtag?.("event", "partner_click", { partner_id: partnerId, placement });
    w.plausible?.("Partner Click", { props: { partner: partnerId, placement } });
  } catch {
    /* analytics not ready — ignore */
  }
}

function PartnerCard({ partner, placement }: { partner: ResolvedPartner; placement: string }) {
  return (
    <a
      href={withPlacement(partner.href, placement)}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      onClick={() => trackClick(partner.id, placement)}
      className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className="text-xl">
          {partner.icon}
        </span>
        {partner.badge ? (
          <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-soft">
            {partner.badge}
          </span>
        ) : null}
      </div>
      <h4 className="mt-2 text-sm font-semibold text-white">{partner.name}</h4>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{partner.blurb}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        <span className="font-medium text-slate-400">Use it when:</span> {partner.useWhen}
      </p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors group-hover:text-accent-soft">
        {partner.cta}
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </a>
  );
}

/**
 * Contextual "Helpful services" module — the site's main revenue surface. Renders
 * a clearly-labelled set of partner resources beside (never inside) the data.
 *
 * `placement` is a short slug identifying where this rendered (e.g. "for-you-h1b",
 * "company", "country") so affiliate revenue can be attributed per surface.
 */
export function ResourcePanel({
  partners,
  placement,
  title = "Helpful services for your situation",
  subtitle,
  compact = false,
}: {
  partners: ResolvedPartner[];
  placement: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  if (!partners.length) return null;

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/50 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow mb-1 flex items-center gap-2 text-accent">
            Resources
            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">
              Partner
            </span>
          </div>
          <h3 className="text-base font-bold text-white sm:text-lg">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      </div>

      <div
        className={`mt-4 grid gap-3 ${
          compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {partners.map((p) => (
          <PartnerCard key={p.id} partner={p} placement={placement} />
        ))}
      </div>

      <p className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
        These are independent third-party services. Some links are partnerships that may earn
        ImmigrationClock a commission at no extra cost to you — it helps keep the data free. We only list
        services newcomers actually use, and nothing here is legal or financial advice.{" "}
        <Link href="/disclosure" className="link-accent">
          How this works →
        </Link>
      </p>
    </section>
  );
}
