// Shared helpers for outbound partner/affiliate links — used by ResourcePanel and
// KeyDates so attribution and analytics behave identically everywhere.
import { track } from "./analytics";

/**
 * The placement as a sub-id value: `ic_` plus the placement, lowercased, with
 * anything outside [a-z0-9_] turned into `_`. Affiliate dashboards differ in
 * what they accept, and letters, digits and underscores survive all of them.
 */
export function placementSubId(placement: string): string {
  return `ic_${placement.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

/**
 * Append the placement so the affiliate dashboard can attribute revenue to the
 * exact module that drove the click. `param` is the partner's own sub-id
 * parameter: most programs read `subid`, ImmiTranslate reads `sub`. Existing
 * parameters — above all the referral id itself — are kept untouched. Never
 * throws; an unparseable href is returned as is.
 */
export function withPlacement(href: string, placement: string, param = "subid"): string {
  if (!placement) return href;
  try {
    const url = new URL(href);
    if (!url.searchParams.has(param)) url.searchParams.set(param, placementSubId(placement));
    return url.toString();
  } catch {
    return href;
  }
}

/**
 * Fire an outbound commercial-click event. Only ever called for `kind: "affiliate"`
 * cards on /resources — official/free resources are never tracked as revenue.
 * Delegates to the shared taxonomy in src/lib/analytics.ts.
 */
export function trackPartnerClick(partnerId: string, placement: string) {
  track("partner_click", { partner: partnerId, placement });
}

/** What a listing is to us, as a reader sees it. Nothing more than we can show. */
export const RELATIONSHIP_LABEL = {
  official: "Free · official",
  service: "Independent",
  affiliate: "Affiliate",
} as const;

/**
 * The outbound link for a listing. Only a verified affiliate is placement-
 * tracked, counted as a commercial click and marked rel="sponsored"; an
 * official resource or an independent service we have no agreement with gets
 * a plain link, because describing it as sponsored would claim a relationship
 * that does not exist.
 */
export function listingLink(
  p: { id: string; href: string; kind: "official" | "service" | "affiliate"; subParam?: string },
  placement: string
): { href: string; rel: string; onClick?: () => void } {
  if (p.kind !== "affiliate") return { href: p.href, rel: "noopener noreferrer" };
  return {
    href: withPlacement(p.href, placement, p.subParam),
    rel: "sponsored nofollow noopener noreferrer",
    onClick: () => trackPartnerClick(p.id, placement),
  };
}
