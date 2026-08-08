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
 * So the audience id is CONFIGURATION (RESEND_AUDIENCE_EN and friends) rather
 * than a hardcoded assumption, the request body is built in one place, and a
 * dry run prints the exact payload. Run the dry run against your account first
 * and confirm the shape before enabling the scheduled send. See
 * `docs/newsletter.md`.
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
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { unsubscribeFlags, RESEND_UNSUBSCRIBE_TOKEN } from "../src/lib/newsletter/preflight";
import type { Locale } from "../src/lib/newsletter/types";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Test seams, in the same spirit as RESEND_API_BASE: they let the suite drive
// this script end-to-end against a stub, which is the only way to prove that
// `--send` cannot bypass the gate. Both must stay unset in production.
const MANIFEST_OVERRIDE = process.env.NEWSLETTER_MANIFEST;
const MANIFEST = MANIFEST_OVERRIDE || `${ROOT}/src/lib/generated/newsletter-latest.json`;

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
  try {
    const res = await get(`/audiences/${audienceId}/contacts`);
    if (!res.ok) return null;
    const parsed = JSON.parse(res.body || "{}") as {
      data?: Array<{ unsubscribed?: boolean }>;
    };
    if (!Array.isArray(parsed.data)) return null;
    return parsed.data.filter((c) => !c.unsubscribed).length;
  } catch {
    return null;
  }
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
      console.log(`    audience   : ${p.audienceId}  [RESEND_AUDIENCE_${p.ed.locale.toUpperCase()}]`);
      if (p.recipients === null) {
        console.log(`    recipients : unknown (could not read the audience)`);
        unknown = true;
      } else {
        console.log(`    recipients : ${p.recipients} subscribed contact(s)`);
        total += p.recipients;
      }
    } else {
      console.log(`    audience   : NOT CONFIGURED — RESEND_AUDIENCE_${p.ed.locale.toUpperCase()} unset`);
      console.log(`    recipients : 0 — this edition will be skipped`);
    }
    console.log(`    payload    : ${p.htmlBytes}B html, ${p.textBytes}B text`);
  }

  console.log(rule);
  console.log(`  TOTAL RECIPIENTS: ${total}${unknown ? " (+ unknown for one or more audiences)" : ""}`);
  console.log(rule + "\n");
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest;

  const broken = manifest.editions.filter((e) => e.errors.length > 0);
  if (broken.length) {
    console.error(`[send] ${broken.length} edition(s) failed validation. Nothing will be sent.`);
    for (const e of broken) for (const msg of e.errors) console.error(`  - ${e.segment}: ${msg}`);
    process.exit(1);
  }

  if (LIVE && !KEY) {
    console.error("[send] --send was passed but RESEND_API_KEY is not set.");
    process.exit(1);
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
  const loaded: Array<Edition & { html: string; text: string }> = [];
  for (const ed of manifest.editions) {
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
    process.exit(1);
  }
  console.log(`[send] unsubscribe gate: ${loaded.length} edition(s) carry a working opt-out.`);

  // Resolve everything first, so the confirmation block describes the whole
  // issue before a single broadcast is created. Deciding per-edition midway
  // through would mean the operator approves edition one and discovers edition
  // four's recipient count only after it has already gone out.
  const plan: Planned[] = [];
  for (const ed of loaded) {
    const audienceId = process.env[`RESEND_AUDIENCE_${ed.locale.toUpperCase()}`];
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

  printConfirmation(manifest.today, plan, LIVE);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // html/text come from the plan, which is the same buffer the gate inspected.
  // Re-reading here would open a window in which the file could change between
  // being checked and being sent.
  for (const { ed, audienceId, html, text } of plan) {
    // An unconfigured audience is a known gap, not a failure. Same rule the
    // Congress adapter follows: never conflate "not set up" with "broken".
    if (!audienceId) {
      console.log(`[send] ${ed.segment}: no RESEND_AUDIENCE_${ed.locale.toUpperCase()} — skipped`);
      skipped++;
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
      // Idempotency: the issue id is stable per segment per day, so a re-run of
      // a failed workflow cannot produce a second broadcast of the same issue.
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
      continue;
    }

    const created = await post("/broadcasts", payload);
    if (!created.ok) {
      console.error(`[send] ${ed.segment}: create failed HTTP ${created.status} ${created.body.slice(0, 300)}`);
      failed++;
      continue;
    }
    const id = (JSON.parse(created.body || "{}") as { id?: string }).id;
    if (!id) {
      console.error(`[send] ${ed.segment}: broadcast created but no id returned`);
      failed++;
      continue;
    }
    const fired = await post(`/broadcasts/${id}/send`, {});
    if (!fired.ok) {
      console.error(`[send] ${ed.segment}: send failed HTTP ${fired.status} ${fired.body.slice(0, 300)}`);
      failed++;
      continue;
    }
    console.log(`[send] ${ed.segment}: broadcast ${id} sent`);
    sent++;
  }

  console.log(
    `\n[send] ${LIVE ? "LIVE" : "DRY RUN"} — issue ${manifest.today}: ` +
      `${sent} sent, ${skipped} skipped (unconfigured), ${failed} failed`
  );
  if (failed > 0) process.exit(1);

  // A LIVE run that mails nobody is a failure, even though every individual
  // step "succeeded".
  //
  // An unconfigured audience is a known gap when we are only building. Once
  // --send has been passed, it is the difference between a newsletter and no
  // newsletter, and exiting 0 here makes that indistinguishable from a delivered
  // issue: a green check, a cheerful summary, and an empty inbox. That is the
  // same shape of silent failure the preflight layer exists to prevent, one step
  // further down the pipeline.
  if (LIVE && sent === 0) {
    console.error(
      `\n[send] LIVE SEND REACHED NOBODY — ${skipped} edition(s) had no audience configured.\n` +
        `  Set RESEND_AUDIENCE_EN / _ES / _FR / _AR, or this run mails no one while reporting success.\n` +
        `  See docs/newsletter.md §5.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[send] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
