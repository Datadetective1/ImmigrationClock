#!/usr/bin/env node
/**
 * BACKFILL — put existing contacts into the Immigration Pulse segment.
 *
 * WHY THIS EXISTS
 * ---------------
 * A Resend contact is account-level and belongs to no list by itself; a
 * Broadcast targets a segment. Until /api/subscribe started assigning one,
 * every address this site collected was stored and unreachable. Those contacts
 * are still there and still expecting a newsletter. This puts them where the
 * broadcast can find them.
 *
 * It is a ONE-OFF that is safe to run repeatedly — after the first pass there is
 * simply nothing left to do.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 *   • It never re-subscribes anyone. A contact with unsubscribed=true is
 *     skipped and reported, never touched. Adding someone who opted out back
 *     into a sending segment is the single worst thing this script could do,
 *     so the check is explicit rather than implied by the segment API.
 *   • It never creates a duplicate. Membership is read first and only the
 *     genuine absentees are added; re-adding an existing member is a no-op at
 *     Resend anyway, so this is belt and braces.
 *   • It never deletes, never edits a contact, never sends email.
 *
 * DRY RUN BY DEFAULT, like scripts/send-newsletter.ts. Writing requires --apply.
 *
 *   node scripts/backfill-segment.mjs            # report only, changes nothing
 *   node scripts/backfill-segment.mjs --apply    # perform the additions
 */

const KEY = process.env.RESEND_API_KEY;
const SEGMENT = process.env.RESEND_NEWSLETTER_SEGMENT_ID?.trim();
const BASE = process.env.RESEND_API_BASE || "https://api.resend.com";
const APPLY = process.argv.includes("--apply");

const green = (m) => `\x1b[32m${m}\x1b[0m`;
const red = (m) => `\x1b[31m${m}\x1b[0m`;
const dim = (m) => `\x1b[2m${m}\x1b[0m`;

if (!KEY) {
  console.error("RESEND_API_KEY is not set.\n");
  console.error("  RESEND_API_KEY=re_xxx RESEND_NEWSLETTER_SEGMENT_ID=... node scripts/backfill-segment.mjs");
  process.exit(1);
}
if (!SEGMENT) {
  console.error("RESEND_NEWSLETTER_SEGMENT_ID is not set — there is no segment to backfill into.");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Read every page of a list endpoint.
 *
 * Resend returns `has_more` and pages by the id of the last row. An unpaginated
 * read would silently backfill only the first page and report success, which is
 * exactly the kind of quiet partial failure this codebase keeps getting bitten
 * by — so the loop is explicit and bounded.
 */
async function listAll(path, label) {
  const rows = [];
  let after;
  for (let page = 1; page <= 500; page++) {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, { headers: auth });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${label}: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const body = await res.json();
    const data = Array.isArray(body?.data) ? body.data : [];
    rows.push(...data);
    if (!body?.has_more || data.length === 0) return rows;
    after = data[data.length - 1]?.id;
    if (!after) return rows;
    await nap(120); // stay well inside the rate limit
  }
  throw new Error(`${label}: pagination did not terminate`);
}

async function main() {
  console.log(`\nBackfilling segment ${SEGMENT}`);
  console.log(APPLY ? red("MODE: APPLY — this will modify the segment\n") : green("MODE: DRY RUN — nothing will be changed\n"));

  const contacts = await listAll("/contacts", "list contacts");
  const members = await listAll(`/segments/${encodeURIComponent(SEGMENT)}/contacts`, "list segment contacts");

  // Match on email, lowercased. The signup route lowercases before storing, but
  // contacts created by other means (an import, the dashboard) may not be, and
  // a case mismatch here would re-add someone who is already a member.
  const memberEmails = new Set(members.map((c) => String(c.email ?? "").trim().toLowerCase()));

  const unsubscribed = contacts.filter((c) => c.unsubscribed === true);
  const subscribed = contacts.filter((c) => c.unsubscribed !== true);
  const alreadyIn = subscribed.filter((c) => memberEmails.has(String(c.email).trim().toLowerCase()));
  const toAdd = subscribed.filter((c) => !memberEmails.has(String(c.email).trim().toLowerCase()));

  // An unsubscribed contact that is somehow already in the segment is worth
  // naming: it will not receive mail (Resend honours the global flag) but it
  // makes the recipient count read high, and someone will eventually act on
  // that number.
  const unsubInSegment = unsubscribed.filter((c) => memberEmails.has(String(c.email).trim().toLowerCase()));

  console.log(`  contacts in account      : ${contacts.length}`);
  console.log(`  ├─ subscribed            : ${subscribed.length}`);
  console.log(`  └─ unsubscribed (skipped): ${unsubscribed.length}`);
  console.log(`  already in segment       : ${alreadyIn.length}`);
  console.log(`  TO ADD                   : ${toAdd.length}`);
  if (unsubInSegment.length) {
    console.log(dim(`  note: ${unsubInSegment.length} unsubscribed contact(s) are in the segment already.`));
    console.log(dim(`        Resend will not mail them; they are left exactly as they are.`));
  }
  console.log("");

  if (toAdd.length === 0) {
    console.log(green("Nothing to do — every subscribed contact is already a member.\n"));
    return report(subscribed.length, alreadyIn.length, 0, 0);
  }

  if (!APPLY) {
    for (const c of toAdd.slice(0, 20)) console.log(`  would add  ${c.email}`);
    if (toAdd.length > 20) console.log(`  … and ${toAdd.length - 20} more`);
    console.log(`\nRe-run with ${red("--apply")} to perform ${toAdd.length} addition(s).\n`);
    return;
  }

  let added = 0;
  let alreadyThere = 0;
  let failed = 0;

  for (const c of toAdd) {
    const path = `/contacts/${encodeURIComponent(c.email)}/segments/${encodeURIComponent(SEGMENT)}`;
    try {
      const res = await fetch(`${BASE}${path}`, { method: "POST", headers: auth });
      if (res.ok) {
        added++;
      } else {
        const detail = await res.text().catch(() => "");
        if (res.status === 409 || /already|exists|duplicate/i.test(detail)) {
          alreadyThere++; // raced, or listed stale — either way the end state is right
        } else {
          failed++;
          console.error(red(`  FAIL ${c.email}: HTTP ${res.status} ${detail.slice(0, 160)}`));
        }
      }
    } catch (err) {
      failed++;
      console.error(red(`  FAIL ${c.email}: ${err?.message ?? err}`));
    }
    await nap(120);
  }

  console.log("");
  report(subscribed.length, alreadyIn.length + alreadyThere, added, failed);
  if (failed > 0) process.exit(1);
}

function report(subscribed, already, added, failed) {
  console.log("─".repeat(64));
  console.log(`  subscribed contacts : ${subscribed}`);
  console.log(`  already in segment  : ${already}`);
  console.log(`  added this run      : ${added}`);
  console.log(`  failed              : ${failed}`);
  console.log(`  SEGMENT RECIPIENTS  : ${already + added}`);
  console.log("─".repeat(64) + "\n");
}

main().catch((err) => {
  console.error(red(`\nbackfill failed: ${err?.stack || err?.message || err}\n`));
  process.exit(1);
});
