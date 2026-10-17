"use client";

// =============================================================================
// RESOURCES DIRECTORY — one grid, filtered by need
//
// Renders ONLY on /resources — never on a data page, employer page, topic page
// or methodology page (see src/lib/partners.ts for why).
//
// Every card says what the listing is to us, before anyone clicks:
//   • Free · official — government or nonprofit; no commercial relationship.
//   • Independent     — a commercial service we list because readers need it;
//                       no agreement, no commission, a plain link.
//   • Affiliate       — a verified program we are enrolled in; it may pay us a
//                       commission, so it is tracked and rel="sponsored".
// Order is by need, then catalog order. Compensation never moves a card up.
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORY_META, type PartnerCategory, type ResolvedPartner } from "@/lib/partners";
import { listingLink, RELATIONSHIP_LABEL } from "@/lib/partner-link";

const LABEL_TONE: Record<ResolvedPartner["kind"], string> = {
  official: "border-status-green/25 bg-status-green/10 text-status-green",
  service: "border-white/15 text-slate-400",
  affiliate: "border-accent/30 bg-accent/10 text-accent",
};

function ResourceCard({ partner, placement }: { partner: ResolvedPartner; placement: string }) {
  const link = listingLink(partner, placement);
  return (
    <a
      href={link.href}
      target="_blank"
      rel={link.rel}
      onClick={link.onClick}
      className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{CATEGORY_META[partner.category].label}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LABEL_TONE[partner.kind]}`}>
          {RELATIONSHIP_LABEL[partner.kind]}
        </span>
      </div>
      <h3 className="mt-2 flex items-center gap-2 text-[15px] font-semibold text-white">
        <span aria-hidden>{partner.icon}</span>
        {partner.name}
      </h3>
      <p className="mt-1 text-[13px] leading-snug text-slate-400">{partner.blurb}</p>
      <p className="mt-2 text-xs leading-snug text-slate-500">
        <span className="text-slate-400">Use it when</span> {partner.useWhen.charAt(0).toLowerCase() + partner.useWhen.slice(1)}
      </p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-accent group-hover:text-accent-soft">
        {partner.cta} <span aria-hidden>↗</span>
      </span>
    </a>
  );
}

export function ResourceDirectory({ partners }: { partners: ResolvedPartner[] }) {
  const needs = Array.from(new Set(partners.map((p) => p.category))) as PartnerCategory[];
  const [need, setNeed] = useState<PartnerCategory | "all">("all");
  // /resources?need=legal — the For You hub links straight to one need.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("need");
    if (wanted && (needs as string[]).includes(wanted)) setNeed(wanted as PartnerCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = need === "all" ? partners : partners.filter((p) => p.category === need);

  const chip = (value: PartnerCategory | "all", label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={need === value}
      onClick={() => setNeed(value)}
      className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-sm transition-colors ${
        need === value ? "border-accent/60 bg-accent/10 text-white" : "border-white/10 text-slate-300 hover:border-accent/40"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter by need" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chip("all", "All")}
        {needs.map((c) => chip(c, CATEGORY_META[c].label))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <ResourceCard key={p.id} partner={p} placement={`resources-${p.category}`} />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-status-green">Free · official</span>: government or nonprofit, no
        commercial relationship. <span className="font-medium text-slate-400">Independent</span>: a commercial
        service we list because readers need it; we have no agreement with it and earn nothing.{" "}
        <span className="font-medium text-accent">Affiliate</span>: may pay us a commission if you buy, at no extra
        cost to you. Compensation never affects our data or the order of this list. Nothing here is legal,
        immigration, tax or financial advice.{" "}
        <Link href="/disclosure" className="link-accent">
          Disclosure
        </Link>
      </p>
    </div>
  );
}
