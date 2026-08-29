// =============================================================================
// SUBSCRIBER LANGUAGE — the preference, and where it is delivered
//
// TWO SEPARATE FACTS, deliberately.
//
//   1. WHAT THE SUBSCRIBER CHOSE. Stored as a Resend contact property. This is
//      the canonical record and it is always written, for every language.
//   2. WHERE THAT LANGUAGE IS DELIVERED. A Resend segment, and segments are a
//      billing-limited resource — the current plan allows three, spent on EN,
//      ES and FR.
//
// Conflating them would mean an Arabic subscriber either cannot subscribe or is
// quietly filed as English. Keeping them apart means the preference is recorded
// truthfully today and delivery begins the day a segment exists, with no
// migration and no code change: set RESEND_SEGMENT_AR and the next signup
// routes. Everyone who chose Arabic in the meantime is already on record and
// can be reconciled by a script that reads the property.
//
// NEVER FALL BACK. An unconfigured language routes to NO segment. It must never
// borrow another language's, because the failure that produces — a French
// subscriber receiving English mail they cannot read, from a list they cannot
// find themselves on — is worse than not being delivered to at all.
// =============================================================================

import { LOCALES, type Locale } from "./types";

/**
 * What these functions need from an environment: string lookup, nothing more.
 *
 * Deliberately a plain record rather than NodeJS.ProcessEnv. This project's
 * ProcessEnv requires NODE_ENV, so every caller wanting to resolve one variable
 * has to construct a whole environment or cast through `unknown` — the existing
 * tests do the latter nine times. src/lib/social/copy-engine.ts and
 * src/lib/social/platforms/x.ts already made this choice for the same reason;
 * this brings the newsletter side in line.
 *
 * Strictly wider than ProcessEnv, so every existing caller is unaffected.
 */
export type EnvLookup = Record<string, string | undefined>;

/** The contact property that carries the choice. One key, one place. */
export const LANGUAGE_PROPERTY = "language";

/** The canonical env var holding the segment for a language. */
export function segmentEnvVar(locale: Locale): string {
  return `RESEND_SEGMENT_${locale.toUpperCase()}`;
}

/**
 * Where a language resolves from, most preferred first.
 *
 * ONE FAMILY, TWO LEGACY ALIASES. Signup wrote RESEND_SEGMENT_<LOCALE> while
 * the sender read RESEND_AUDIENCE_<LOCALE> — two independent names for one
 * Resend destination. Nothing enforced that they matched, so a subscriber could
 * be added to one segment while the newsletter broadcast to another, and the
 * symptom would be silence: a signup that works, a send that reports success,
 * and an inbox that never receives anything.
 *
 * The aliases are read, never written, and only when the canonical name is
 * unset. They exist so the currently-deployed configuration keeps working
 * through the cutover:
 *
 *   • RESEND_AUDIENCE_<LOCALE>       what the sender used, and what the first
 *                                    production send actually targeted
 *   • RESEND_NEWSLETTER_SEGMENT_ID   English only — the single pre-language
 *                                    segment holding the three existing
 *                                    subscribers, who chose nothing
 */
export function segmentSources(locale: Locale): string[] {
  const names = [segmentEnvVar(locale), `RESEND_AUDIENCE_${locale.toUpperCase()}`];
  if (locale === "en") names.push("RESEND_NEWSLETTER_SEGMENT_ID");
  return names;
}

/**
 * The segment a language delivers to, or null when none is configured.
 *
 * Null is a real answer, not a failure: it means "recorded, not yet delivered".
 * It must NEVER be substituted with another language's segment.
 */
export function segmentIdFor(locale: Locale, env: EnvLookup = process.env): string | null {
  for (const name of segmentSources(locale)) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** Which variable actually supplied the value, for logs an operator must trust. */
export function segmentSourceName(locale: Locale, env: EnvLookup = process.env): string | null {
  return segmentSources(locale).find((name) => env[name]?.trim()) ?? null;
}

/**
 * The language a contact is treated as, given whatever property it carries.
 *
 * A contact with no `language` is a LEGACY ENGLISH subscriber — one of the
 * three who signed up before the choice existed. Treating absent as English is
 * what keeps them receiving what they already receive; treating it as unknown
 * would silently drop them from every future send.
 */
export function effectiveLocale(properties: Record<string, unknown> | null | undefined): Locale {
  const stored = parseLocale(properties?.[LANGUAGE_PROPERTY]);
  return stored ?? "en";
}

/** Every language that currently has somewhere to deliver to. */
export function configuredSegments(env: EnvLookup = process.env): Map<Locale, string> {
  const out = new Map<Locale, string>();
  for (const l of LOCALES) {
    const id = segmentIdFor(l, env);
    if (id) out.set(l, id);
  }
  return out;
}

/** Narrow an unknown value to a supported language. No coercion, no default. */
export function parseLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
}

export interface SegmentPlan {
  /** The segment to add the contact to. Null when this language has none yet. */
  join: string | null;
  /**
   * Segments to remove the contact from.
   *
   * Re-subscribing with a different language must MOVE the contact, not add a
   * second membership: two memberships means two copies of the newsletter in
   * two languages, which reads as a bug to the reader and doubles their send
   * cost to us. The stored property is authoritative and membership reconciles
   * to it, so every other configured language segment is left.
   */
  leave: string[];
}

/**
 * What membership should look like for a subscriber who chose `locale`.
 *
 * Pure, so the reconciliation rule is testable without a network. De-duplicated
 * because two languages could legitimately point at the same segment id during
 * a migration, and joining then leaving the same id would strip the contact.
 */
export function planSegments(locale: Locale, env: EnvLookup = process.env): SegmentPlan {
  const configured = configuredSegments(env);
  const join = configured.get(locale) ?? null;
  const leave = [...configured.entries()]
    .filter(([l, id]) => l !== locale && id !== join)
    .map(([, id]) => id);
  return { join, leave: [...new Set(leave)] };
}
