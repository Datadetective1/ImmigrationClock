// =============================================================================
// THE CONSENT SENTENCE, AND ITS VERSION
//
// The wording a person agreed to is part of the evidence, not decoration. If
// the copy changes, consents recorded under the old sentence must keep pointing
// at the sentence that was actually on screen — otherwise the record degrades
// from "they agreed to this" into "they once clicked something".
//
// So the text and its version live together, in one place both the UI and the
// stored record read. A test asserts the rendered checkbox matches this string,
// because two copies of one sentence is exactly how they drift.
// =============================================================================

/**
 * Bump this whenever CONSENT_TEXT changes in a way that alters what is being
 * agreed to. A typo fix does not need a bump; adding a second purpose does.
 */
export const NEWSLETTER_CONSENT_VERSION = "2026-09-06.v1";

/** The exact sentence beside the checkbox. */
export const CONSENT_TEXT =
  "Send me Immigration Pulse and important ImmigrationClock updates.";

/**
 * The qualifier shown under it.
 *
 * Says the two things that make the box safe to tick: it is optional, and it is
 * not part of the purchase. Both are enforced in code — checkout succeeds with
 * the box unchecked, and nothing about entitlement reads consent.
 */
export const CONSENT_HINT = "Optional. Your subscription works exactly the same either way.";
