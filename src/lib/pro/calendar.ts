// =============================================================================
// THE PRIVATE CALENDAR FEED — stated effective dates, in the subscriber's own calendar
//
// An iCalendar (RFC 5545) feed of the effective dates on the Briefing
// timeline: followed or saved changes whose record STATES a date still ahead.
// All-day events, because the documents give a date, not a time.
//
// THE LINK IS THE CREDENTIAL. Calendar apps fetch a URL with no cookie, so the
// URL carries the subscriber key, a version, and an HMAC over both. Bumping
// the version in Briefing preferences revokes every copy of the old link. The
// feed is re-checked against the subscription on every fetch, so a lapsed
// subscriber's calendar empties rather than going on forever.
//
// Only public data is in the feed: the dates come from government documents,
// not from the subscriber. Nothing personal is ever written into a calendar.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import type { TimelineItem } from "./feed";

export function calendarSignature(key: string, version: number, secret: string): string {
  return createHmac("sha256", secret).update(`briefing-calendar:${key}:${version}`).digest("base64url").slice(0, 32);
}

/** The opaque token in the feed URL: key.version.signature */
export function calendarToken(key: string, version: number, secret: string): string {
  return `${key}.${version}.${calendarSignature(key, version, secret)}`;
}

export function parseCalendarToken(token: string): { key: string; version: number; signature: string } | null {
  const m = /^([A-Za-z0-9_-]{16,64})\.(\d{1,6})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  return { key: m[1], version: Number(m[2]), signature: m[3] };
}

export function verifyCalendarToken(
  token: string,
  secret: string,
  currentVersion: (key: string) => Promise<number>
): Promise<string | null> {
  const parsed = parseCalendarToken(token);
  if (!parsed || !secret) return Promise.resolve(null);
  const expected = Buffer.from(calendarSignature(parsed.key, parsed.version, secret));
  const given = Buffer.from(parsed.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return Promise.resolve(null);
  return currentVersion(parsed.key).then((v) => (v === parsed.version ? parsed.key : null));
}

export function calendarUrl(origin: string, key: string, version: number, secret: string): string {
  return `${origin.replace(/\/$/, "")}/api/pro/calendar/${calendarToken(key, version, secret)}.ics`;
}

/** RFC 5545 text escaping. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets, continuation lines starting with a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function icsDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

function nextDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildCalendar(items: readonly TimelineItem[], options: { origin: string; now: Date }): string {
  const origin = options.origin.replace(/\/$/, "");
  const host = origin.replace(/^https?:\/\//, "") || "immigrationclock.com";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ImmigrationClock//Briefing//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ImmigrationClock — effective dates",
    "X-WR-CALDESC:Stated effective dates of changes you follow or saved. Verify against the official source.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];
  for (const item of items) {
    const description = [
      `Stated effective date in the published record. Status: ${item.status}.`,
      `Source: ${item.sourceName} — ${item.sourceUrl}`,
      `Record: ${origin}${item.path}`,
      "Information about published government material, not legal advice. Verify against the official source.",
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(`effective-${item.recordId}-${icsDate(item.effectiveDate)}`)}@${host}`,
      `DTSTAMP:${stamp(options.now)}`,
      `DTSTART;VALUE=DATE:${icsDate(item.effectiveDate)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(item.effectiveDate))}`,
      `SUMMARY:${icsText(`Takes effect: ${item.title}`)}`,
      `DESCRIPTION:${icsText(description)}`,
      `URL:${origin}${item.path}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
