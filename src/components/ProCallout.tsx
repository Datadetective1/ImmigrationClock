"use client";

// =============================================================================
// THE ONE UPGRADE PROMPT, AND THE DEMAND SIGNAL UNDER IT
//
// This is the only in-page mention of Pro anywhere on the site, and it appears
// on exactly the surfaces where the capability it names would live. Not a
// banner, not a modal, not a rail on every page: a line at the bottom of a
// section a reader has already scrolled through, in the site's own voice.
//
// WHAT IT MEASURES, AND WHY THAT IS THE POINT
// -------------------------------------------
// The click fires `premium_interest` with the capability id and the surface.
// That is the only event in the funnel that measures demand BEFORE a price is
// in the way, and it is what should decide which of the paid capabilities gets
// built next — rather than a guess made at design time. A callout that is
// never clicked is a capability nobody wants, which is worth learning for the
// cost of a link.
//
// WHAT IT NEVER SENDS: the entity being viewed, the employer, the search, the
// page's query string. A followed employer or country can imply a person's
// nationality or visa status. The event carries a capability id and a
// placement name, both from a fixed list, and nothing else.
// =============================================================================

import Link from "next/link";
import { trackPremiumInterest } from "@/lib/analytics";
import type { Capability } from "@/lib/billing/plans";

interface Props {
  /** Which paid capability this surface would use. A fixed id, never free text. */
  capability: Capability;
  /** The surface, for the funnel. A fixed name, never a path a reader typed. */
  placement: string;
  /** One sentence, in the site's voice, about what the capability does here. */
  children: React.ReactNode;
}

export function ProCallout({ capability, placement, children }: Props) {
  return (
    <aside className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400">
      <span>{children} </span>
      <Link
        href="/pricing"
        onClick={() => trackPremiumInterest(capability, placement)}
        className="font-medium text-accent hover:underline"
      >
        See what Pro includes
      </Link>
    </aside>
  );
}
