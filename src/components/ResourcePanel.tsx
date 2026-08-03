"use client";

import Link from "next/link";
import type { ResolvedPartner } from "@/lib/partners";
import { withPlacement, trackPartnerClick } from "@/lib/partner-link";

function PartnerCard({ partner, placement }: { partner: ResolvedPartner; placement: string }) {
  // An official/nonprofit resource has no commercial relationship, so it must not
  // carry rel="sponsored" (that would misdescribe it to search engines), must not
  // get a tracking parameter, and must not fire a revenue event. Only genuine
  // commercial partners get any of those.
  const isPartner = partner.kind === "partner";
  return (
    <a
      href={isPartner ? withPlacement(partner.href, placement) : partner.href}
      target="_blank"
      rel={isPartner ? "sponsored nofollow noopener noreferrer" : "noopener noreferrer"}
      onClick={isPartner ? () => trackPartnerClick(partner.id, placement) : undefined}
      className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className="text-xl">
          {partner.icon}
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {partner.badge ? (
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-soft">
              {partner.badge}
            </span>
          ) : null}
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isPartner
                ? "border-white/15 bg-white/5 text-slate-400"
                : "border-status-green/20 bg-status-green/10 text-status-green"
            }`}
          >
            {isPartner ? "Partner" : "Free · official"}
          </span>
        </span>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-white">{partner.name}</h3>
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
 * Resources module. Renders ONLY on /resources — never on a data page, employer
 * page, topic page, or methodology page. See src/lib/partners.ts for why.
 *
 * Each card is labelled either "Free · official" (a government or nonprofit
 * resource with no commercial relationship) or "Partner" (commercial, disclosed),
 * so a reader can tell which is which before clicking rather than after.
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
          <div className="eyebrow mb-1 text-accent">Resources</div>
          <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>
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
        Cards marked <span className="font-medium text-status-green">Free · official</span> are government or
        nonprofit resources with no commercial relationship to us. Cards marked{" "}
        <span className="font-medium text-slate-400">Partner</span> are independent commercial services that
        may pay ImmigrationClock a commission, at no extra cost to you. Compensation never affects what our
        data shows or how anything is ranked, and these appear only here — never inside the data. Nothing
        here is legal, immigration, or financial advice.{" "}
        <Link href="/disclosure" className="link-accent">
          How this works →
        </Link>
      </p>
    </section>
  );
}
