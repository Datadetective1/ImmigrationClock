#!/usr/bin/env tsx
/**
 * BACKFILL — put existing contacts into the segment their LANGUAGE routes to.
 *
 * WHY THIS EXISTS
 * ---------------
 * A Resend contact is account-level and belongs to no list by itself; a
 * Broadcast targets a segment. Until /api/subscribe started assigning one,
 * every address this site collected was stored and unreachable.
 *
 * WHY IT WAS REWRITTEN
 * --------------------
 * The first version predated language routing. It read one variable —
 * RESEND_NEWSLETTER_SEGMENT_ID — and added EVERY subscribed contact to it.
 * Run today, that would sweep Spanish, French and Arabic subscribers into the
 * English segment, and the next Thursday send would mail them an English
 * newsletter they did not ask for and cannot read. Worse, it would look like it
 * worked: a green run, a rising recipient count, and no error anywhere.
 *
 * So the destination is now derived per contact from the `language` property,
 * through the SAME resolver signup and sending use. There is no single target
 * segment and no way to pass one.
 *
 * A contact with NO language property is a legacy English subscriber — one of
 * the three who signed up before the choice existed. Absent means English, and
 * that is what keeps them receiving what they already receive.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 *   • Never re-subscribes anyone. unsubscribed=true is skipped and reported.
 *   • Never puts a contact in a segment that is not their language's.
 *   • Never guesses a language. No property means English by rule, not by
 *     inference from a name, a domain, or anything else.
 *   • Never creates a duplicate. Membership is read first.
 *   • Never deletes, never edits a contact, never sends email.
 *
 * DRY RUN BY DEFAULT, like send-newsletter.ts. Writing requires --apply.
 *
 *   npx tsx scripts/backfill-segment.ts            # report only
 *   npx tsx scripts/backfill-segment.ts --apply    # perform the additions
 */
import { LOCALES, type Locale } from "../src/lib/newsletter/types";
import {
  effectiveLocale,
  segmentEnvVar,
  segmentIdFor,
  segmentSourceName,
} from "../src/lib/newsletter/subscriber-language";

const KEY = process.env.RESEND_API_KEY;
const BASE = process.env.RESEND_API_BASE || "https://api.resend.com";
const APPLY = process.argv.includes("--apply");

const green = (m: string) => `\x1b[32m${m}\x1b[0m`;
const red = (m: string) => `\x1b[31m${m}\x1b[0m`;
const dim = (m: string) => `\x1b[2m${m}\x1b[0m`;

if (!KEY) {
  console.error("RESEND_API_KEY is not set.\n");
  console.error("  RESEND_API_KEY=re_xxx npx tsx scripts/backfill-segment.ts");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Contact {
  id?: string;
  email: string;
  unsubscribed?: boolean;
  properties?: Record<string, unknown> | null;
}

/**
 * Read every page of a list endpoint.
 *
 * An unpaginated read would backfill only the first page and report success,
 * which is the quiet partial failure this codebase keeps being bitten by.
 */
async function listAll(path: string, label: string): Promise<Contact[]> {
  const rows: Contact[] = [];
  let after: string | undefined;
  for (let page = 1; page <= 500; page++) {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, { headers: auth });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${label}: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const body = (await res.json()) as { data?: Contact[]; has_more?: boolean };
    const data = Array.isArray(body?.data) ? body.data : [];
    rows.push(...data);
    if (!body?.has_more || data.length === 0) return rows;
    after = data[data.length - 1]?.id;
    if (!after) return rows;
    await nap(120);
  }
  throw new Error(`${label}: pagination did not terminate`);
}

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

async function main() {
  console.log("\nBackfilling per-language segments");
  console.log(APPLY ? red("MODE: APPLY — this will modify segments\n") : green("MODE: DRY RUN — nothing will be changed\n"));

  // Resolve every destination up front, so the plan is visible before any write
  // and a missing language is reported rather than silently redirected.
  const targets = new Map<Locale, string | null>();
  for (const l of LOCALES) targets.set(l, segmentIdFor(l));

  console.log("  Destinations");
  for (const l of LOCALES) {
    const id = targets.get(l);
    const via = id ? segmentSourceName(l) : null;
    console.log(
      `    ${l}  ${id ? `${id}  ${dim(`[${via}]`)}` : dim(`no ${segmentEnvVar(l)} — these contacts will be SKIPPED, never redirected`)}`
    );
  }
  console.log("");

  if ([...targets.values()].every((v) => !v)) {
    console.error(red("No segment is configured for any language. Nothing to back-fill into.\n"));
    process.exit(1);
  }

  const contacts = await listAll("/contacts", "list contacts");

  // Membership, per distinct destination. Fetched once each — several languages
  // could legitimately share a segment id mid-migration.
  const membership = new Map<string, Set<string>>();
  for (const id of new Set([...targets.values()].filter(Boolean) as string[])) {
    const members = await listAll(`/segments/${encodeURIComponent(id)}/contacts`, `list segment ${id}`);
    membership.set(id, new Set(members.map((c) => norm(c.email))));
  }

  const unsubscribed = contacts.filter((c) => c.unsubscribed === true);
  const subscribed = contacts.filter((c) => c.unsubscribed !== true);

  // The routing decision, per contact. `effectiveLocale` is the shared rule:
  // a missing property means English, by rule rather than by inference.
  const planned = subscribed.map((c) => {
    const locale = effectiveLocale(c.properties);
    const legacy = !c.properties?.language;
    const target = targets.get(locale) ?? null;
    const already = target ? membership.get(target)?.has(norm(c.email)) === true : false;
    return { contact: c, locale, legacy, target, already };
  });

  const byLocale = new Map<Locale, typeof planned>();
  for (const l of LOCALES) byLocale.set(l, planned.filter((p) => p.locale === l));

  console.log(`  contacts in account      : ${contacts.length}`);
  console.log(`  ├─ subscribed            : ${subscribed.length}`);
  console.log(`  └─ unsubscribed (skipped): ${unsubscribed.length}`);
  console.log("");

  let totalToAdd = 0;
  for (const l of LOCALES) {
    const group = byLocale.get(l)!;
    if (group.length === 0) continue;
    const legacyCount = group.filter((p) => p.legacy).length;
    const toAdd = group.filter((p) => p.target && !p.already);
    totalToAdd += toAdd.length;
    console.log(
      `  ${l}: ${group.length} contact(s)` +
        (legacyCount ? dim(`  (${legacyCount} with no language property — treated as English)`) : "")
    );
    console.log(`      already a member : ${group.filter((p) => p.already).length}`);
    if (!targets.get(l)) {
      console.log(red(`      SKIPPED          : ${group.length} — no segment for "${l}"; their preference is recorded and they stay unrouted`));
    } else {
      console.log(`      to add           : ${toAdd.length}`);
    }
  }
  console.log("");

  if (totalToAdd === 0) {
    console.log(green("Nothing to do — every routable contact is already in the right segment.\n"));
    return;
  }

  if (!APPLY) {
    console.log(`Re-run with ${red("--apply")} to perform ${totalToAdd} addition(s).\n`);
    return;
  }

  let added = 0;
  let alreadyThere = 0;
  let failed = 0;

  for (const p of planned) {
    if (!p.target || p.already) continue;
    const path = `/contacts/${encodeURIComponent(p.contact.email)}/segments/${encodeURIComponent(p.target)}`;
    try {
      const res = await fetch(`${BASE}${path}`, { method: "POST", headers: auth });
      if (res.ok) {
        added++;
      } else {
        const detail = await res.text().catch(() => "");
        if (res.status === 409 || /already|exists|duplicate/i.test(detail)) alreadyThere++;
        else {
          failed++;
          console.error(red(`  FAIL ${p.contact.email} -> ${p.locale}: HTTP ${res.status} ${detail.slice(0, 160)}`));
        }
      }
    } catch (err) {
      failed++;
      console.error(red(`  FAIL ${p.contact.email}: ${(err as Error)?.message}`));
    }
    await nap(120);
  }

  console.log("");
  console.log("─".repeat(64));
  console.log(`  added this run     : ${added}`);
  console.log(`  already a member   : ${alreadyThere}`);
  console.log(`  failed             : ${failed}`);
  console.log("─".repeat(64) + "\n");
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(red(`\nbackfill failed: ${err?.stack || err?.message || err}\n`));
  process.exit(1);
});
