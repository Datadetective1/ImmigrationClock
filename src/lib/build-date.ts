// =============================================================================
// THE BUILD'S DATE — one value, read everywhere
//
// Anything computed "as of today" at build time — a signal that counts the
// last 30 days, a card that says how many days remain, the sitemap's list of
// which signals exist — has to use the SAME day, or the card and the page it
// belongs to can disagree, and a signal can exist on a page and be missing as
// a card. `new Date()` evaluated in four modules in separate build workers is
// four clocks; a build that crosses UTC midnight gets two dates.
//
// So the date is the refresh pipeline's own timestamp, committed with the data
// it describes (src/lib/generated/refresh.json). It is fixed before the build
// starts, identical in every module, and it names the day the data is for —
// which is also the day the social publisher compares against before it posts
// a day-relative figure (src/lib/social/select.ts), so a post never states a
// number the page it links to does not show.
// =============================================================================

import refresh from "@/lib/generated/refresh.json";

/** YYYY-MM-DD, UTC, from the refresh pipeline's run. */
export const BUILD_DATE: string = String((refresh as { generatedAt?: string }).generatedAt ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
