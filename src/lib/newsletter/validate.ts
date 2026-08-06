// =============================================================================
// VALIDATION — the gate between the archive and a hundred thousand inboxes
//
// An email cannot be recalled. Everything checkable before send is checked
// here, and the workflow treats any error as fatal.
//
// The checks are deliberately about the failures that are INVISIBLE in a
// browser preview: a relative link that resolves against the mail client, an
// empty text part that trips spam filters, a proposal rendered without its
// "not in force" warning, an untranslated string leaking into a Spanish issue.
// =============================================================================

import type { Issue, Locale } from "./types";
import { LOCALES, RESEND_UNSUBSCRIBE_TOKEN } from "./types";
import { stringsFor } from "./locales";
import type { RenderedEmail } from "./render";
import { unsubscribeFlags } from "./preflight";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Structural checks on the issue, before rendering. */
export function validateIssue(issue: Issue): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  if (!issue.id) errors.push("issue has no id");
  if (!iso.test(issue.from) || !iso.test(issue.to)) errors.push(`${issue.id}: window dates must be ISO`);
  if (issue.from > issue.to) errors.push(`${issue.id}: window starts after it ends`);
  if (!LOCALES.includes(issue.segment.locale)) {
    errors.push(`${issue.id}: unknown locale "${issue.segment.locale}"`);
  }

  for (const it of issue.items) {
    const where = `${issue.id}/${it.id}`;
    if (!it.title.trim()) errors.push(`${where}: empty title`);
    if (!it.summary.trim()) errors.push(`${where}: empty summary`);
    // The single most consequential field in the email. A card whose button
    // does not reach the government document is the product's core promise
    // broken in the one place a reader cannot check it against the site.
    if (!/^https?:\/\//.test(it.sourceUrl)) errors.push(`${where}: sourceUrl is not absolute`);
    if (!iso.test(it.publishedAt)) errors.push(`${where}: publishedAt is not ISO`);
    if (it.publishedAt < issue.from || it.publishedAt > issue.to) {
      errors.push(`${where}: published ${it.publishedAt} is outside the issue window`);
    }
  }

  const ids = issue.items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) errors.push(`${issue.id}: the same story appears twice`);

  // A quiet week is legitimate and the template says so. Worth a warning so an
  // operator notices a pipeline failure that merely LOOKS like a quiet week.
  if (issue.items.length === 0) {
    warnings.push(`${issue.id}: no items — will send the "quiet week" edition`);
  }
  return { errors, warnings };
}

/** Checks on the rendered output, per locale. */
export function validateRendered(
  issue: Issue,
  rendered: RenderedEmail,
  baseUrl: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const locale = issue.segment.locale;
  const t = stringsFor(locale);
  const where = `${issue.id}/${locale}`;

  if (!rendered.subject.trim()) errors.push(`${where}: empty subject`);
  if (rendered.subject.length > 78) {
    warnings.push(`${where}: subject is ${rendered.subject.length} chars and will truncate on mobile`);
  }

  // A missing or trivial text/plain part is a strong spam signal and is what
  // screen readers often read.
  if (rendered.text.trim().length < 200) errors.push(`${where}: plain-text part is too short`);
  if (/<[a-z/][^>]*>/i.test(rendered.text)) errors.push(`${where}: markup leaked into the plain-text part`);

  // Email clients resolve relative URLs against themselves, not the site.
  //
  // The Resend unsubscribe token is the one exception: it is not a URL at all
  // until Resend substitutes a per-contact link at send time. Exempting it here
  // is safe only because preflight requires it to be present and correct — the
  // two rules are a pair, and neither is sound alone.
  const hrefs = [...rendered.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    if (h === RESEND_UNSUBSCRIBE_TOKEN) continue;
    if (!/^(https?:\/\/|mailto:)/.test(h)) errors.push(`${where}: relative link "${h}"`);
  }
  if (hrefs.length === 0) errors.push(`${where}: no links at all`);

  // THE OPT-OUT GATE. Blocking, and reported as an error rather than a warning
  // so that every consumer of this result — the build script, CI, the send
  // script — refuses the edition without needing to know the rule.
  for (const f of unsubscribeFlags(rendered, locale)) {
    if (f.blocking) errors.push(`${where}: ${f.message}`);
    else warnings.push(`${where}: ${f.message}`);
  }

  // Client-compatibility invariants the renderer is supposed to guarantee.
  if (/<style[\s>]/i.test(rendered.html)) errors.push(`${where}: <style> block will be stripped by Gmail`);
  if (/<img[\s>]/i.test(rendered.html)) errors.push(`${where}: images are blocked by default in most clients`);
  if (/display:\s*(flex|grid)/i.test(rendered.html)) errors.push(`${where}: flex/grid does not render in Outlook`);

  // RTL locales must actually declare direction, or Arabic renders left-aligned
  // with punctuation in the wrong place.
  if (locale === "ar" && !/dir="rtl"/.test(rendered.html)) {
    errors.push(`${where}: Arabic issue is missing dir="rtl"`);
  }

  // The trust statement is required on every edition, in every language.
  if (!rendered.html.includes(t.trust.statement.slice(0, 40))) {
    errors.push(`${where}: trust statement missing`);
  }

  // A proposal must carry its warning wherever it appears.
  for (const it of issue.items.filter((i) => i.notInForce)) {
    if (!rendered.html.includes(t.item.notInForce)) {
      errors.push(`${where}: "${it.id}" is a proposal but the not-in-force badge is absent`);
      break;
    }
  }

  // Every story's document link must survive into the HTML.
  for (const it of issue.items) {
    if (!rendered.html.includes(it.sourceUrl)) {
      errors.push(`${where}: source link for "${it.id}" did not render`);
    }
  }

  // Catch a locale that silently fell back to English.
  if (locale !== "en" && rendered.html.includes("Read the official document")) {
    errors.push(`${where}: English chrome leaked into a ${locale} issue`);
  }

  // The reassurance section is the most dangerous thing in the issue: a reader
  // acts on "nothing changed". Every claimed-quiet topic must have a label in
  // this locale, or an untranslated key leaks into the email as a bare slug.
  for (const w of issue.unchanged) {
    if (!t.unchanged.topics[w.key]) {
      errors.push(`${where}: watchlist key "${w.key}" has no label in this locale`);
    }
  }

  // A "no change" claim rendered for a topic that DID change would be a false
  // reassurance. Cross-check against the stories actually in the issue.
  const shownIds = new Set([...(issue.lead?.items ?? []), ...issue.items].map((i) => i.id));
  if (shownIds.size > 0 && issue.unchanged.length > 0) {
    for (const w of issue.unchanged) {
      const label = t.unchanged.topics[w.key];
      if (label && rendered.html.includes(label) && issue.totalInWindow === 0 && issue.items.length > 0) {
        errors.push(`${where}: claims "${w.key}" was quiet in a window with items`);
      }
    }
  }

  // Reading time must be a real estimate, not a default.
  if (issue.readingMinutes < 1) errors.push(`${where}: reading time is not a positive number`);

  // Internal links carry analytics tags; government links must NOT be rewritten,
  // because altering a citation URL breaks the product's core promise.
  for (const it of [...(issue.lead?.items ?? []), ...issue.items]) {
    if (!rendered.html.includes(it.sourceUrl)) {
      errors.push(`${where}: source URL for "${it.id}" was altered or dropped`);
    }
  }

  if (!rendered.html.includes(baseUrl.replace(/\/$/, ""))) {
    warnings.push(`${where}: no link back to ${baseUrl}`);
  }
  return { errors, warnings };
}

export function mergeResults(...rs: ValidationResult[]): ValidationResult {
  return {
    errors: rs.flatMap((r) => r.errors),
    warnings: rs.flatMap((r) => r.warnings),
  };
}

export type { Locale };
