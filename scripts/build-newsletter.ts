#!/usr/bin/env tsx
/**
 * NEWSLETTER BUILD — generate, validate, render, archive.
 *
 * Produces one issue per configured segment, rendered into every language, and
 * writes them to a public archive so every email can link to a web copy that
 * outlives the inbox.
 *
 * SENDING IS A SEPARATE SCRIPT ON PURPOSE. This one is pure and idempotent:
 * running it twice writes the same bytes and mails nobody. That means CI can
 * build and validate a newsletter on every pull request without any risk of a
 * test run reaching a subscriber.
 *
 * Usage:
 *   npm run build:newsletter                 # today's issue, all locales
 *   NEWSLETTER_DATE=2026-08-01 npm run build:newsletter
 *   NEWSLETTER_CADENCE=daily npm run build:newsletter
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { SITE } from "../src/lib/site";
import { LOCALES, type Cadence, type Locale, type Segment } from "../src/lib/newsletter/types";
import { selectIssue } from "../src/lib/newsletter/select";
import { renderIssue } from "../src/lib/newsletter/render";
import { validateIssue, validateRendered, mergeResults } from "../src/lib/newsletter/validate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

const cadence = (process.env.NEWSLETTER_CADENCE as Cadence) || "weekly";
const today = process.env.NEWSLETTER_DATE || new Date().toISOString().slice(0, 10);

/**
 * The editions we currently send: one per language, same content.
 *
 * Segment-specific editions (H-1B only, India only, personalized) are the same
 * shape with `entityIds` set — see src/lib/newsletter/types.ts. They are not
 * enabled here because nothing yet collects the preferences that would populate
 * them; adding one is a line in this array once that exists.
 */
function segments(): Segment[] {
  return LOCALES.map((locale: Locale) => ({
    id: `${cadence}-${locale}`,
    locale,
    cadence,
    // The audience each edition broadcasts to. Absent until configured, which
    // the send script treats as "build but do not send".
    audienceId: process.env[`RESEND_AUDIENCE_${locale.toUpperCase()}`] || undefined,
  }));
}

async function write(rel: string, contents: string) {
  const path = `${ROOT}${rel}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function main() {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const manifest: Record<string, unknown>[] = [];

  for (const segment of segments()) {
    const issue = selectIssue({ segment, today });
    const issueResult = validateIssue(issue);

    const rendered = renderIssue(issue, SITE.url, CONTACT);
    const renderResult = validateRendered(issue, rendered, SITE.url);
    const { errors, warnings } = mergeResults(issueResult, renderResult);

    allErrors.push(...errors);
    allWarnings.push(...warnings);

    // Archive even when invalid: an operator debugging a failed build wants to
    // see what was produced, and nothing here is sent by writing a file.
    const dir = `/public/newsletter/${issue.id}`;
    await write(`${dir}/${segment.locale}.html`, rendered.html);
    await write(`${dir}/${segment.locale}.txt`, rendered.text);

    manifest.push({
      issueId: issue.id,
      segment: segment.id,
      locale: segment.locale,
      cadence,
      from: issue.from,
      to: issue.to,
      items: issue.items.length,
      totalInWindow: issue.totalInWindow,
      subject: rendered.subject,
      htmlPath: `${dir}/${segment.locale}.html`,
      textPath: `${dir}/${segment.locale}.txt`,
      audienceConfigured: Boolean(segment.audienceId),
      errors,
      warnings,
    });

    console.log(
      `[newsletter] ${segment.id}: ${issue.items.length} item(s) of ${issue.totalInWindow} in window` +
        `${errors.length ? ` — ${errors.length} ERROR(S)` : ""}${warnings.length ? ` — ${warnings.length} warning(s)` : ""}`
    );
  }

  // The send script reads this; it never re-derives the issue, so what gets
  // sent is exactly what was validated.
  await write(
    "/src/lib/generated/newsletter-latest.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), cadence, today, editions: manifest }, null, 2) + "\n"
  );

  for (const w of allWarnings) console.warn(`[newsletter] warning: ${w}`);
  if (allErrors.length) {
    console.error(`\n[newsletter] ${allErrors.length} validation error(s) — NOTHING WILL BE SENT:`);
    for (const e of allErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`[newsletter] built ${manifest.length} edition(s) for ${today}, all valid`);
}

main().catch((err) => {
  console.error(`[newsletter] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
