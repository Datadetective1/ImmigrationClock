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
 * Fire an outbound commercial-click event. Only ever called for `kind: "partner"`
 * cards on /resources — official/free resources are never tracked as revenue.
 * Delegates to the shared taxonomy in src/lib/analytics.ts.
 */
export function trackPartnerClick(partnerId: string, placement: string) {
  track("partner_click", { partner: partnerId, placement });
}
