#!/usr/bin/env tsx
/**
 * NEWSLETTER SEND — broadcast the editions that build-newsletter.ts validated.
 *
 * Reads src/lib/generated/newsletter-latest.json and the archived HTML/text.
 * It never re-derives an issue, so what goes out is byte-for-byte what was
 * validated. If the manifest reports any errors, nothing sends.
 *
 * DRY RUN BY DEFAULT. Sending requires --send explicitly, so no accidental
 * invocation — a mistyped npm script, a CI job that fires on the wrong event —
 * can reach a subscriber. An email cannot be recalled.
 *
 * Usage:
 *   npm run send:newsletter                 # dry run: prints what WOULD send
 *   npm run send:newsletter -- --send       # actually broadcasts
 *
 * ---------------------------------------------------------------------------
 * A NOTE ON THE RESEND API SHAPE
 * ---------------------------------------------------------------------------
 * Contacts are account-level: `POST /contacts` takes no audience id. Broadcasts
 * historically targeted an audience. Those two facts are in tension, and this
 * script cannot resolve it without a live key.
 *
 * So the segment id is CONFIGURATION (RESEND_SEGMENT_EN and friends) rather
 * than a hardcoded assumption, the request body is built in one place, and a
 * dry run prints the exact payload. Run the dry run against your account first
 * and confirm the shape before enabling the scheduled send. See
 * `docs/newsletter.md`.
 *
 * ONE VARIABLE FAMILY. Signup and sending resolve the destination through the
 * SAME function, src/lib/newsletter/subscriber-language.ts. They were separate
 * — signup wrote RESEND_SEGMENT_<LOCALE>, this read RESEND_AUDIENCE_<LOCALE> —
 * and nothing checked that they agreed. RESEND_AUDIENCE_* is still read as a
 * deprecated alias so the deployed configuration survives the cutover.
 *
 * ---------------------------------------------------------------------------
 * UNSUBSCRIBE, AND WHY THERE IS NO List-Unsubscribe HEADER HERE
 * ---------------------------------------------------------------------------
 * `POST /broadcasts` accepts: segment_id (formerly audience_id), from, subject,
 * reply_to, html, text, react, name, topic_id, send, scheduled_at. There is no
 * `headers` field — unlike `POST /emails`, which has one. So this script CANNOT
 * set List-Unsubscribe or List-Unsubscribe-Post on a broadcast, and inventing a
 * URL to put in one would be worse than omitting it: a header pointing at a
 * page that cannot unsubscribe the recipient is a false opt-out, and under
 * RFC 8058 it must accept a POST and take effect within 48 hours.
 *
 * The supported mechanism is the `{{{RESEND_UNSUBSCRIBE_URL}}}` token in the
 * body. Resend substitutes a per-contact link, records the unsubscribe against
 * the contact, and manages the List-Unsubscribe headers on the outgoing message
 * itself. Confirm the headers on the first real send by viewing the raw source
 * of a received copy — that is the only place they are observable.
 *
 * The gate below re-runs the opt-out check on the exact bytes about to be
 * POSTed, not on what the manifest claims. `--send` does not skip it.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { unsubscribeFlags, RESEND_UNSUBSCRIBE_TOKEN } from "../src/lib/newsletter/preflight";
import type { Locale } from "../src/lib/newsletter/types";
import {
  alreadySent,
  parseLedger,
  recordSend,
  serializeLedger,
  type SendLedger,
} from "../src/lib/newsletter/send-ledger";
import { segmentEnvVar, segmentIdFor, segmentSourceName } from "../src/lib/newsletter/subscriber-language";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Test seams, in the same spirit as RESEND_API_BASE: they let the suite drive
// this script end-to-end against a stub, which is the only way to prove that
// `--send` cannot bypass the gate. All must stay unset in production.
const MANIFEST_OVERRIDE = process.env.NEWSLETTER_MANIFEST;
const MANIFEST = MANIFEST_OVERRIDE || `${ROOT}/src/lib/generated/newsletter-latest.json`;
const LEDGER = process.env.NEWSLETTER_SEND_LEDGER || `${ROOT}/src/lib/generated/newsletter-sent.json`;

/**
 * Where an edition's archived HTML and text actually live.
 *
 * The real manifest records paths from the repo root ("/public/newsletter/…").
 * A fixture manifest describes files sitting next to itself. NOT decided with
 * isAbsolute(): on Windows `isAbsolute("/public/…")` is true, which silently
 * resolved every real path to C:\public\… .
 */
const resolve = (p: string) => (MANIFEST_OVERRIDE ? join(dirname(MANIFEST_OVERRIDE), p) : `${ROOT}${p}`);

const RESEND_API = process.env.RESEND_API_BASE || "https://api.resend.com";
const KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";
const REPLY_TO = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
const LIVE = process.argv.includes("--send");

/**
 * `--only <locale>` restricts the run to one edition.
 *
 * This exists for the controlled test send: point one audience id at a segment
 * containing only your own address and mail yourself the real thing. Without it
 * the safety of that test rests on remembering to unset three environment
 * variables, and a stale RESEND_SEGMENT_FR in a shell is all it would take to
 * broadcast to everyone in French.
 *
 * Narrowing only. It cannot cause an edition to send that would not otherwise
 * have sent, so there is no way to widen the blast radius with it.
 */
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i !== -1 ? process.argv[i + 1]?.trim().toLowerCase() : undefined;
})();

/**
 * `--resend` deliberately re-sends an edition the ledger already records.
 *
 * The escape hatch, and the ONLY way past the duplicate-send guard. It requires
 * `--only <locale>`, so re-sending is always one stated edition rather than a
 * blanket instruction that could re-mail four languages because a ledger was
 * restored from an old commit. The friction is the point: this is the flag that
 * mails people a second copy.
 */
const RESEND_OVERRIDE = process.argv.includes("--resend");

interface Edition {
  issueId: string;
  segment: string;
  locale: string;
  subject: string;
  htmlPath: string;
  textPath: string;
  audienceConfigured: boolean;
  errors: string[];
  warnings: string[];
  /** Written by build-newsletter.ts. Absent on a manifest built before the gate existed. */
  safeToSend?: boolean;
  blockingFlags?: string[];
}

interface Manifest {
  generatedAt: string;
  today: string;
  editions: Edition[];
}

async function post(path: string, payload: unknown): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${RESEND_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
  } finally {
    clearTimeout(timer);
  }
}

/** Read-only. Used solely to count an audience before showing the confirmation. */
async function get(path: string): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${RESEND_API}${path}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How many contacts would actually receive this.
 *
 * Unsubscribed contacts are excluded — the operator is confirming a number of
 * inboxes, and a total that quietly includes people who opted out is the wrong
 * number to confirm against. Returns null when it cannot be established, which
 * prints as "unknown" rather than a reassuring zero.
 */
async function audienceCount(audienceId: string): Promise<number | null> {
  if (!KEY) return null;

  // SEGMENTS FIRST, audiences second.
  //
  // Resend renamed Audiences to Segments, and the API reference no longer
  // documents any /audiences/* endpoint — only /segments/* and /contacts/*.
  // Probing the old path against a segment id returns 404, which this function
  // reports as `null` and the confirmation block prints as "unknown".
  //
  // That is the wrong failure for the one number an operator is confirming
  // before an irreversible send. "Unknown" next to a live send prompt is how
  // somebody approves a blast radius they never actually saw. Both paths are
  // read-only GETs, so trying the new one and falling back costs nothing.
  for (const path of [`/segments/${audienceId}/contacts`, `/audiences/${audienceId}/contacts`]) {
    try {
      const res = await get(path);
      if (!res.ok) continue;
      const parsed = JSON.parse(res.body || "{}") as { data?: Array<{ unsubscribed?: boolean }> };
      if (!Array.isArray(parsed.data)) continue;
      return parsed.data.filter((c) => !c.unsubscribed).length;
    } catch {
      // Try the next path; a network fault on one is not evidence about the other.
    }
  }
  return null;
}

const LANGUAGE: Record<string, string> = {
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  ar: "Arabic (العربية)",
};

interface Planned {
  ed: Edition;
  audienceId: string | undefined;
  recipients: number | null;
  /** The exact bytes the opt-out gate inspected, carried through to the POST. */
  html: string;
  text: string;
  htmlBytes: number;
  textBytes: number;
}

/**
 * The confirmation block. Printed before anything is broadcast, in both dry-run
 * and live mode, so what the operator approves in a dry run is the same summary
 * they see when they authorise the send.
 *
 * It lives here rather than in the workflow because a workflow step can be
 * bypassed by invoking the script directly; this cannot.
 */
function printConfirmation(issueDate: string, plan: Planned[], live: boolean) {
  const rule = "─".repeat(72);
  console.log(`\n${rule}`);
  console.log(live ? "  LIVE SEND — CONFIRM BEFORE THIS PROCEEDS" : "  DRY RUN — nothing will be sent");
  console.log(rule);
  console.log(`  Edition date : ${issueDate}`);
  console.log(`  Editions     : ${plan.length}`);
  console.log(`  From         : ${FROM}`);
  if (REPLY_TO) console.log(`  Reply-to     : ${REPLY_TO}`);
  console.log(rule);

  let total = 0;
  let unknown = false;
  for (const p of plan) {
    const lang = LANGUAGE[p.ed.locale] ?? p.ed.locale;
    console.log(`  ${p.ed.segment}`);
    console.log(`    language   : ${lang} (${p.ed.locale})`);
    console.log(`    subject    : ${p.ed.subject}`);
    if (p.audienceId) {
      // Name the variable that ACTUALLY supplied this, not the canonical one —
      // an operator debugging a wrong destination needs to know whether it came
      // from RESEND_SEGMENT_EN or a lingering RESEND_AUDIENCE_EN.
      console.log(
        `    audience   : ${p.audienceId}  [${segmentSourceName(p.ed.locale as Locale) ?? segmentEnvVar(p.ed.locale as Locale)}]`
      );
      if (p.recipients === null) {
        console.log(`    recipients : unknown (could not read the audience)`);
        unknown = true;
      } else {
        console.log(`    recipients : ${p.recipients} subscribed contact(s)`);
        total += p.recipients;
      }
    } else {
      console.log(`    audience   : NOT CONFIGURED — ${segmentEnvVar(p.ed.locale as Locale)} unset`);
      console.log(`    recipients : 0 — this edition will be skipped`);
    }
    console.log(`    payload    : ${p.htmlBytes}B html, ${p.textBytes}B text`);
  }

  console.log(rule);
  console.log(`  TOTAL RECIPIENTS: ${total}${unknown ? " (+ unknown for one or more audiences)" : ""}`);
  console.log(rule + "\n");
}

/**
 * Fail without calling process.exit().
 *
 * `process.exit()` tears the process down while libuv handles are still
 * closing, and on Windows that aborts with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exit code
 * 3221226505 instead of 1. It surfaced the moment a send failed mid-run — a
 * failed fetch leaves handles in flight — which is exactly the path a caller
 * most needs a truthful exit code from.
 *
 * Setting exitCode and returning lets the event loop drain, so the code is
 * whatever we said it was.
 */
function fail(): void {
  process.exitCode = 1;
}

/** What actually happened to one edition. Recorded as the loop runs. */
interface Outcome {
  locale: string;
  status: "sent" | "skipped" | "already-sent" | "failed" | "preview";
  recipients: number | null;
  broadcastId?: string;
  reason?: string;
}

/**
 * The operator-facing summary.
 *
 * An unattended pipeline is only as good as what it says afterwards. This is
 * the block someone reads in the Actions log — or in an alert — to answer "did
 * it go, to how many, and which languages were skipped".
 *
 * Prints broadcast ids, which are safe. Never prints the API key, and never
 * prints an audience id, because a summary is the kind of thing that gets
 * pasted into a ticket.
 */
function printReport(issueDate: string, plan: Planned[], outcomes: Outcome[], live: boolean) {
  const LANG = { en: "English", es: "Spanish", fr: "French", ar: "Arabic" } as const;
  const byLocale = new Map(outcomes.map((o) => [o.locale, o]));

  const rule = "═".repeat(58);
  console.log(`\n${rule}`);
  console.log("  IMMIGRATIONCLOCK NEWSLETTER");
  console.log(`  Edition: ${issueDate}`);
  const anySent = outcomes.some((o) => o.status === "sent");
  const anyFailed = outcomes.some((o) => o.status === "failed");
  console.log(
    `  Status: ${!live ? "DRY RUN — NOTHING SENT" : anyFailed ? "PARTIAL — SEE FAILURES" : anySent ? "SENT" : "NOTHING SENT"}`
  );
  console.log(rule);

  let total = 0;
  let failedCount = 0;
  for (const p of plan) {
    const o = byLocale.get(p.ed.locale);
    const name = LANG[p.ed.locale as keyof typeof LANG] ?? p.ed.locale;
    console.log(`\n${name}:`);
    if (!o) {
      console.log("  Status: not attempted");
      continue;
    }
    console.log(`  Recipients: ${o.recipients === null ? "unknown" : o.recipients}`);
    if (o.broadcastId) console.log(`  Broadcast ID: ${o.broadcastId}`);
    console.log(`  Status: ${o.status}${o.reason ? ` (${o.reason})` : ""}`);
    if (o.status === "sent" && typeof o.recipients === "number") total += o.recipients;
    if (o.status === "failed") failedCount++;
  }

  console.log(`\n${rule}`);
  console.log(`  Total recipients: ${total}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`${rule}\n`);
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest;

  if (ONLY && !manifest.editions.some((e) => e.locale === ONLY)) {
    console.error(
      `[send] --only "${ONLY}" matches no edition. Available: ` +
        manifest.editions.map((e) => e.locale).join(", ")
    );
    return fail();
  }
  if (ONLY) console.log(`[send] --only ${ONLY}: every other edition will be skipped.`);

  // --resend is the only route past the duplicate guard, so it may not be a
  // blanket instruction. Requiring --only means an operator names the single
  // edition they intend to mail twice.
  if (RESEND_OVERRIDE && !ONLY) {
    console.error(
      "[send] --resend requires --only <locale>. Re-sending is a deliberate act on one\n" +
        "       named edition, not a blanket override across every language."
    );
    return fail();
  }
  if (RESEND_OVERRIDE) {
    console.warn(`[send] --resend: the duplicate-send guard is OVERRIDDEN for ${ONLY}. Recipients may receive a second copy.`);
  }

  // ---- REPLY-TO, FAIL-SAFE -------------------------------------------------
  // Omitting reply_to used to be silent. The archived HTML also drops its
  // "Contact" footer link when this is unset at BUILD time, so a run without it
  // produced a quietly different newsletter AND a broadcast nobody could reply
  // to — discovered only by diffing the deployed edition against a local one.
  //
  // A live send now refuses. A dry run warns loudly rather than failing, so the
  // preview still works on a laptop, which is where it is most often run.
  if (!REPLY_TO) {
    const message =
      "NEXT_PUBLIC_CONTACT_EMAIL is not set — the broadcast would carry no Reply-To and " +
      "the archived edition drops its Contact link.";
    if (LIVE) {
      console.error(`[send] ${message}\n       Refusing to send. Set it and rebuild with \`npm run build:newsletter\`.`);
      return fail();
    }
    console.warn(`[send] WARNING: ${message} A live send would refuse.`);
  }

  const broken = manifest.editions.filter((e) => e.errors.length > 0);
  if (broken.length) {
    console.error(`[send] ${broken.length} edition(s) failed validation. Nothing will be sent.`);
    for (const e of broken) for (const msg of e.errors) console.error(`  - ${e.segment}: ${msg}`);
    return fail();
  }

  if (LIVE && !KEY) {
    console.error("[send] --send was passed but RESEND_API_KEY is not set.");
    return fail();
  }

  // ---- THE OPT-OUT GATE ----------------------------------------------------
  // Re-checked here, against the bytes this script is about to POST, even
  // though build-newsletter.ts and newsletter-preflight.ts both checked the
  // same thing. The manifest and the archived HTML are separate files that a
  // rerun, a partial commit or a hand edit can put out of step, and the file is
  // what reaches the inbox.
  //
  // It runs before the audience lookup and before anything is printed, so a dry
  // run reports the same verdict a real send would get. `--send` is not
  // consulted: there is no operator override, because the failure it would
  // override is one that cannot be undone once the mail is out.
  //
  // --only narrows BEFORE the gate, so the gate inspects exactly the set that
  // will be POSTed — no more, no less. A full run still checks all four.
  const loaded: Array<Edition & { html: string; text: string }> = [];
  for (const ed of manifest.editions) {
    if (ONLY && ed.locale !== ONLY) continue;
    loaded.push({
      ...ed,
      html: await readFile(resolve(ed.htmlPath), "utf8"),
      text: await readFile(resolve(ed.textPath), "utf8"),
    });
  }

  const ungated = loaded.flatMap((ed) => {
    const blocking = unsubscribeFlags({ subject: ed.subject, html: ed.html, text: ed.text }, ed.locale as Locale)
      .filter((f) => f.blocking)
      .map((f) => `${ed.segment}: ${f.message}`);
    // A manifest that already knows it is unsafe is not overridden by a file
    // that happens to look fine.
    if (ed.safeToSend === false && blocking.length === 0) {
      blocking.push(
        `${ed.segment}: manifest marks this edition unsafe (${(ed.blockingFlags ?? []).join(", ") || "no reason recorded"})`
      );
    }
    return blocking;
  });

  if (ungated.length) {
    console.error(`[send] UNSUBSCRIBE GATE FAILED — nothing will be sent, and --send does not override this.`);
    for (const m of ungated) console.error(`  - ${m}`);
    console.error(
      `\n  Every edition must carry ${RESEND_UNSUBSCRIBE_TOKEN} as a visible, localized link\n` +
        `  in both the HTML and the plain-text part. Rebuild with \`npm run build:newsletter\`.`
    );
    return fail();
  }
  console.log(`[send] unsubscribe gate: ${loaded.length} edition(s) carry a working opt-out.`);

  // Resolve everything first, so the confirmation block describes the whole
  // issue before a single broadcast is created. Deciding per-edition midway
  // through would mean the operator approves edition one and discovers edition
  // four's recipient count only after it has already gone out.
  const plan: Planned[] = [];
  for (const ed of loaded) {
    // ONE CANONICAL FAMILY. Signup writes RESEND_SEGMENT_<LOCALE>; this reads
    // the same name, through the same resolver, so the two can no longer drift.
    // They were separate before — signup wrote one variable and the sender read
    // another, and nothing enforced that they matched. A subscriber added to
    // one segment while the broadcast targeted another produces no error
    // anywhere: the signup works, the send reports success, and the inbox stays
    // empty. RESEND_AUDIENCE_* is still honoured as a read-only alias.
    const audienceId = segmentIdFor(ed.locale as Locale) ?? undefined;
    plan.push({
      ed,
      audienceId,
      recipients: audienceId ? await audienceCount(audienceId) : 0,
      html: ed.html,
      text: ed.text,
      htmlBytes: ed.html.length,
      textBytes: ed.text.length,
    });
  }

  // ---- THE DUPLICATE-SEND GUARD --------------------------------------------
  // Read before the confirmation block, so an operator approving a live send
  // sees which editions are already spoken for.
  //
  // A ledger that will not parse is NOT treated as empty. Doing so would
  // silently unlock every edition it exists to protect, which is precisely the
  // failure mode of the `name`-based idempotency it replaces.
  const rawLedger = await readFile(LEDGER, "utf8").catch(() => null);
  const ledgerAtStart = parseLedger(rawLedger);
  if (ledgerAtStart === null) {
    console.error(
      `[send] the send ledger at ${LEDGER} is unreadable or malformed.\n` +
        "       Refusing to send: an unparseable ledger cannot prove an edition has not\n" +
        "       already gone out. Repair or delete it deliberately, then re-run."
    );
    return fail();
  }
  let ledger: SendLedger = ledgerAtStart;

  const duplicates = plan
    .filter((p) => p.audienceId && alreadySent(ledger, p.ed.issueId, p.ed.locale, p.audienceId))
    .map((p) => ({ p, record: alreadySent(ledger, p.ed.issueId, p.ed.locale, p.audienceId!)! }));

  for (const { p, record } of duplicates) {
    console.log(
      `[send] ${p.ed.segment}: ALREADY SENT to ${p.audienceId} at ${record.sentAt} ` +
        `(broadcast ${record.broadcastId})${RESEND_OVERRIDE ? " — overridden by --resend" : " — will be skipped"}`
    );
  }

  printConfirmation(manifest.today, plan, LIVE);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let duplicatesSkipped = 0;
  const outcomes: Outcome[] = [];

  // html/text come from the plan, which is the same buffer the gate inspected.
  // Re-reading here would open a window in which the file could change between
  // being checked and being sent.
  for (const { ed, audienceId, html, text } of plan) {
    // An unconfigured audience is a known gap, not a failure. Same rule the
    // Congress adapter follows: never conflate "not set up" with "broken".
    if (!audienceId) {
      console.log(`[send] ${ed.segment}: no ${segmentEnvVar(ed.locale as Locale)} — skipped`);
      outcomes.push({ locale: ed.locale, status: "skipped", recipients: 0, reason: "no audience configured" });
      skipped++;
      continue;
    }

    // NEVER SEND INTO THE DARK.
    //
    // `recipients` is null when the count could not be read — a 404, a
    // permission error, an unexpected shape. Sending anyway means broadcasting
    // to an audience of unknown size and unknown composition, which is the one
    // thing an operator cannot undo or even assess afterwards. A skipped
    // language is recoverable; an unbounded send is not.
    const planned = plan.find((p) => p.ed.locale === ed.locale)!;
    if (LIVE && planned.recipients === null) {
      console.error(
        `[send] ${ed.segment}: recipient count is UNKNOWN for audience ${audienceId} — refusing to send.\n` +
          `       The key may lack contact-read permission, or the audience may not exist.`
      );
      outcomes.push({ locale: ed.locale, status: "failed", recipients: null, reason: "recipient count unknown" });
      failed++;
      continue;
    }
    if (LIVE && planned.recipients === 0) {
      console.log(`[send] ${ed.segment}: audience has 0 subscribed contacts — skipped`);
      outcomes.push({ locale: ed.locale, status: "skipped", recipients: 0, reason: "no subscribed contacts" });
      skipped++;
      continue;
    }

    // THE GUARD. One edition, one language, one destination, at most once.
    //
    // Checked inside the loop against the ledger as it stands NOW, not against
    // the snapshot taken before the confirmation block — so a send earlier in
    // this same loop is already visible here.
    const prior = alreadySent(ledger, ed.issueId, ed.locale, audienceId);
    if (prior && !RESEND_OVERRIDE) {
      console.log(
        `[send] ${ed.segment}: already sent ${prior.sentAt} (broadcast ${prior.broadcastId}) — skipped.\n` +
          `       Use --only ${ed.locale} --resend to deliberately send it again.`
      );
      outcomes.push({
        locale: ed.locale,
        status: "already-sent",
        recipients: planned.recipients,
        broadcastId: prior.broadcastId,
        reason: `sent ${prior.sentAt}`,
      });
      duplicatesSkipped++;
      continue;
    }

    // NOTE ON `audience_id`: Resend has renamed Audiences to Segments, and the
    // current Create Broadcast reference documents `segment_id`. Existing
    // audience ids continue to resolve, so this stays as it is until a dry run
    // against the live account proves otherwise — sending both keys risks a 422
    // on an unknown field, which is a worse failure than the one it guards.
    // See docs/newsletter.md.
    const payload: Record<string, unknown> = {
      audience_id: audienceId,
      from: FROM,
      subject: ed.subject,
      html,
      text,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      // A LABEL, NOT AN IDEMPOTENCY KEY. Resend documents `name` as "only used
      // for internal reference", and its real idempotency feature — the
      // Idempotency-Key header — is supported on POST /emails and
      // /emails/batch, NOT on /broadcasts. This script used to claim otherwise
      // and a workflow retry could double-send. The guarantee now comes from
      // the ledger above; this stays only so a human can find the broadcast in
      // the Resend dashboard.
      name: ed.issueId,
    };

    if (!LIVE) {
      // Print the payload as it will actually be serialised, with the two large
      // fields elided. An operator confirming the shape against their account
      // needs to see the real keys, not a summary of them.
      const shape = {
        ...payload,
        html: `<${html.length} bytes, unsubscribe token present: ${html.includes(RESEND_UNSUBSCRIBE_TOKEN)}>`,
        text: `<${text.length} bytes, unsubscribe token present: ${text.includes(RESEND_UNSUBSCRIBE_TOKEN)}>`,
      };
      console.log(`[send] DRY RUN ${ed.segment}: would POST /broadcasts`);
      console.log(
        JSON.stringify(shape, null, 2)
          .split("\n")
          .map((l) => `         ${l}`)
          .join("\n")
      );
      console.log(
        `         headers: none — POST /broadcasts has no \`headers\` field; Resend owns\n` +
          `                  List-Unsubscribe for broadcasts, driven by the token above.`
      );
      outcomes.push({ locale: ed.locale, status: "preview", recipients: planned.recipients });
      continue;
    }

    const created = await post("/broadcasts", payload);
    if (!created.ok) {
      console.error(`[send] ${ed.segment}: create failed HTTP ${created.status} ${created.body.slice(0, 300)}`);
      outcomes.push({ locale: ed.locale, status: "failed", recipients: planned.recipients, reason: `create HTTP ${created.status}` });
      failed++;
      continue;
    }
    const id = (JSON.parse(created.body || "{}") as { id?: string }).id;
    if (!id) {
      console.error(`[send] ${ed.segment}: broadcast created but no id returned`);
      outcomes.push({ locale: ed.locale, status: "failed", recipients: planned.recipients, reason: "no broadcast id returned" });
      failed++;
      continue;
    }
    const fired = await post(`/broadcasts/${id}/send`, {});
    if (!fired.ok) {
      console.error(`[send] ${ed.segment}: send failed HTTP ${fired.status} ${fired.body.slice(0, 300)}`);
      outcomes.push({ locale: ed.locale, status: "failed", recipients: planned.recipients, broadcastId: id, reason: `send HTTP ${fired.status}` });
      failed++;
      continue;
    }
    // RECORD IMMEDIATELY, before the next locale is attempted.
    //
    // The whole point is surviving a partial failure: English delivered,
    // Spanish threw, the workflow retried. If the ledger were written once at
    // the end, that crash would lose English's record and the retry would mail
    // it twice — the exact bug this replaces. Written here, the file on disk is
    // correct the instant the broadcast fires.
    //
    // A write failure is fatal. Continuing would mean sending further editions
    // with no durable record of the ones already out.
    ledger = recordSend(ledger, {
      issueId: ed.issueId,
      locale: ed.locale,
      audienceId,
      broadcastId: id,
      sentAt: new Date().toISOString(),
      ...(prior ? { override: true } : {}),
    });
    try {
      await writeFile(LEDGER, serializeLedger(ledger), "utf8");
    } catch (err) {
      console.error(
        `[send] ${ed.segment}: broadcast ${id} WAS SENT but the ledger could not be written ` +
          `(${(err as Error)?.message}).\n` +
          `       Stopping: continuing would risk re-sending this edition on the next run.`
      );
      return fail();
    }

    outcomes.push({ locale: ed.locale, status: "sent", recipients: planned.recipients, broadcastId: id });
    console.log(`[send] ${ed.segment}: broadcast ${id} sent — recorded in the ledger`);
    sent++;
  }

  // ---- POST-SEND REPORT ----------------------------------------------------
  // Written from the outcomes recorded during this run, not from intent, so it
  // cannot claim a delivery that did not happen. Broadcast ids are safe to
  // print; the API key and audience ids of other languages never appear.
  printReport(manifest.today, plan, outcomes, LIVE);

  console.log(
    `\n[send] ${LIVE ? "LIVE" : "DRY RUN"} — issue ${manifest.today}: ` +
      `${sent} sent, ${skipped} skipped (unconfigured), ` +
      `${duplicatesSkipped} skipped (already sent), ${failed} failed`
  );
  if (failed > 0) return fail();

  // A LIVE run that mails nobody is a failure, even though every individual
  // step "succeeded".
  //
  // An unconfigured audience is a known gap when we are only building. Once
  // --send has been passed, it is the difference between a newsletter and no
  // newsletter, and exiting 0 here makes that indistinguishable from a delivered
  // issue: a green check, a cheerful summary, and an empty inbox. That is the
  // same shape of silent failure the preflight layer exists to prevent, one step
  // further down the pipeline.
  //
  // Editions skipped as ALREADY SENT are the exception, and the difference
  // matters: that is a workflow retry finding the work already done, which is
  // success. Failing it would turn every successful retry into a red run and
  // train an operator to ignore the alert.
  if (LIVE && sent === 0 && duplicatesSkipped === 0) {
    console.error(
      `\n[send] LIVE SEND REACHED NOBODY — ${skipped} edition(s) had no audience configured.\n` +
        `  Set RESEND_SEGMENT_EN / _ES / _FR / _AR, or this run mails no one while reporting success.\n` +
        `  See docs/newsletter.md §5.`
    );
    return fail();
  }
  if (LIVE && sent === 0 && duplicatesSkipped > 0) {
    console.log(
      `[send] nothing new to send: all ${duplicatesSkipped} edition(s) were already delivered. ` +
        `This is a retry finding its work complete.`
    );
  }
}

main().catch((err) => {
  console.error(`[send] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
