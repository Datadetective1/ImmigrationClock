// Shared helpers for outbound partner/affiliate links — used by ResourcePanel and
// KeyDates so attribution and analytics behave identically everywhere.

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
 * Fire a lightweight outbound event for whatever analytics is present (GA4 via
 * gtag, or Plausible). No-op when neither is configured — keeps the static build
 * dependency-free.
 */
export function trackPartnerClick(partnerId: string, placement: string) {
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
