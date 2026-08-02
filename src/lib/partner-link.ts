// Shared helpers for outbound partner/affiliate links — used by ResourcePanel and
// KeyDates so attribution and analytics behave identically everywhere.
import { track } from "./analytics";

/**
 * Append a placement subid so affiliate dashboards can attribute revenue to the
 * exact module that drove the click (most programs read ?subid= / &subid=). Safe
 * on URLs that already carry a query string; never throws.
 */
export function withPlacement(href: string, placement: string): string {
  if (!placement) return href;
  try {
    const url = new URL(href);
    if (!url.searchParams.has("subid")) url.searchParams.set("subid", `ic-${placement}`);
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
