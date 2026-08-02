// =============================================================================
// MINIMAL RSS / ATOM PARSER
//
// Shared by every feed-based adapter: USCIS newsroom, USCIS policy manual, and
// whatever agency feeds follow. Deliberately dependency-free — a regex parser is
// adequate for well-formed agency feeds, and adding an XML library to a static
// site to read a handful of government RSS feeds is not a trade worth making.
//
// It is strict about what it will accept. A field it cannot parse comes back
// null rather than guessed at, and a malformed date becomes null rather than a
// plausible-looking wrong date — the same rule that governs every other date on
// this platform.
// =============================================================================

// Text normalization lives in ./text.ts, shared with the HTML-based adapters so
// the decode ordering is implemented once rather than copied per source.
import { plainText as text, richText } from "./text";

export interface RssItem {
  title: string;
  link: string;
  description: string | null;
  /** ISO yyyy-mm-dd, or null when the feed's date could not be parsed. */
  publishedAt: string | null;
  /** Feed-provided identifier, used to build a stable event id. */
  guid: string | null;
  /** Raw categories, where the feed provides them. */
  categories: string[];
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? m[1] : null;
}

/**
 * Parse an RSS pubDate or Atom timestamp into ISO yyyy-mm-dd.
 *
 * Returns null rather than a guess. USCIS emits two-digit years
 * ("Thu, 30 Jul 26 15:19:32 -0400"), which `Date` interprets as 1926 — a silent
 * century error that would put every event a hundred years in the past. That
 * case is handled explicitly.
 */
export function parseFeedDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  // A date before the modern immigration system, or far in the future, is a
  // parse failure rather than a fact. Applied to EVERY parse path — the
  // two-digit branch used to return early and skip this, so "Jul 99" became a
  // confident 2099 from the one function whose whole contract is refusing that.
  const inRange = (iso: string): string | null => {
    const year = Number(iso.slice(0, 4));
    if (year < 1990 || year > new Date().getUTCFullYear() + 2) return null;
    return iso;
  };

  // "Thu, 30 Jul 26 15:19:32 -0400" — two-digit year.
  const twoDigit = /^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})\s/.exec(s);
  if (twoDigit) {
    const [, day, mon, yy] = twoDigit;
    const year = 2000 + Number(yy);
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = months[mon.toLowerCase()];
    if (mm) return inRange(`${year}-${mm}-${day.padStart(2, "0")}`);
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return inRange(d.toISOString().slice(0, 10));
}

/** Parse RSS 2.0 `<item>` and Atom `<entry>` elements. */
export function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  for (const [, block] of blocks) {
    // Atom puts the URL in an attribute; RSS uses element content.
    const linkTag = tag(block, "link");
    const linkAttr = /<link[^>]*href=["']([^"']+)["']/i.exec(block)?.[1];

    // Normalize BEFORE the emptiness check: a title of "&nbsp;" or an empty
    // CDATA block is non-empty as raw markup but has no content. An item with
    // no title or no link cannot be cited, and an uncitable item must not
    // become an event.
    const title = text(tag(block, "title") ?? "");
    const link = text(linkTag || linkAttr || "");
    if (!title || !link) continue;

    const categories = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map(([, c]) => text(c))
      .filter(Boolean);

    items.push({
      title,
      link,
      description: (() => {
        const d = tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content");
        return d ? richText(d) || null : null;
      })(),
      publishedAt: parseFeedDate(tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated")),
      guid: (() => {
        const g = tag(block, "guid") ?? tag(block, "id");
        return g ? text(g) || null : null;
      })(),
      categories,
    });
  }
  return items;
}

/**
 * Fetch and parse a feed. Never throws — a failing feed reports through the
 * adapter's `failed`/`warnings` contract, so one bad source cannot take down an
 * ingestion run.
 */
export async function fetchFeed(
  url: string,
  userAgent: string,
  timeoutMs = 25_000
): Promise<{ items: RssItem[]; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": userAgent }, signal: controller.signal });
    if (!res.ok) return { items: [], error: `HTTP ${res.status} from ${url}` };
    return { items: parseFeed(await res.text()), error: null };
  } catch (err) {
    return { items: [], error: `fetch failed: ${(err as Error)?.message ?? String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}
