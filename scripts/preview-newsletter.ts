#!/usr/bin/env tsx
/**
 * NEWSLETTER PREVIEW — render one edition to a folder of your choice.
 *
 * Unlike build:newsletter this never touches public/newsletter, so it cannot
 * overwrite the archived copy of an issue that was already mailed. It sends
 * nothing and needs no key.
 *
 * Usage:
 *   npm run preview:newsletter -- <outDir>
 *   NEWSLETTER_DATE=2026-11-26 npm run preview:newsletter -- /tmp/pulse
 */
import { mkdir, writeFile } from "node:fs/promises";
import { SITE } from "../src/lib/site";
import { LOCALES, type Locale } from "../src/lib/newsletter/types";
import { selectIssue } from "../src/lib/newsletter/select";
import { renderIssue } from "../src/lib/newsletter/render";
import { validateIssue, validateRendered, mergeResults } from "../src/lib/newsletter/validate";
import { preflight } from "../src/lib/newsletter/preflight";

const out = process.argv[2] || "newsletter-preview";
const today = process.env.NEWSLETTER_DATE || new Date().toISOString().slice(0, 10);

async function main() {
  await mkdir(out, { recursive: true });
  for (const locale of LOCALES as Locale[]) {
    const issue = selectIssue({ segment: { id: `weekly-${locale}`, locale, cadence: "weekly" }, today });
    const r = renderIssue(issue, SITE.url, process.env.NEXT_PUBLIC_CONTACT_EMAIL || "");
    const { errors, warnings } = mergeResults(validateIssue(issue), validateRendered(issue, r, SITE.url));
    const pre = preflight(r, locale);
    await writeFile(`${out}/${locale}.html`, r.html, "utf8");
    await writeFile(`${out}/${locale}.txt`, `Subject: ${r.subject}\n\n${r.text}`, "utf8");
    console.log(`${locale}  ${r.subject}  (${r.subject.length} chars)`);
    for (const e of errors) console.log(`  ERROR ${e}`);
    for (const w of warnings) console.log(`  warn  ${w}`);
    if (!pre.safeToSend) console.log(`  BLOCKED ${pre.blocking.map((b) => b.code).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
