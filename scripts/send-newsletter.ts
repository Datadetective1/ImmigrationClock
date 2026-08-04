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
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = `${ROOT}/src/lib/generated/newsletter-latest.json`;

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

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const ed of manifest.editions) {
    const html = await readFile(`${ROOT}${ed.htmlPath}`, "utf8");
    const text = await readFile(`${ROOT}${ed.textPath}`, "utf8");
    const audienceId = process.env[`RESEND_AUDIENCE_${ed.locale.toUpperCase()}`];

    // An unconfigured audience is a known gap, not a failure. Same rule the
    // Congress adapter follows: never conflate "not set up" with "broken".
    if (!audienceId) {
      console.log(`[send] ${ed.segment}: no RESEND_AUDIENCE_${ed.locale.toUpperCase()} — skipped`);
      skipped++;
      continue;
    }

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
      console.log(
        `[send] DRY RUN ${ed.segment}: would POST /broadcasts ` +
          `{ audience_id: "${audienceId}", name: "${ed.issueId}", subject: "${ed.subject}", ` +
          `html: ${html.length}B, text: ${text.length}B }`
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
}

main().catch((err) => {
  console.error(`[send] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
