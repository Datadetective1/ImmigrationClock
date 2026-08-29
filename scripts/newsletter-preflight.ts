#!/usr/bin/env tsx
/**
 * NEWSLETTER PREFLIGHT — decide whether this issue is safe to broadcast.
 *
 * Delivery is automatic, which means no human sees the issue before it reaches
 * subscribers. The safety mechanism is therefore not review; it is this file.
 *
 * The failure this guards against is not "the job crashed" — a crash is loud
 * and stops the send by itself. It is the quiet one: an agency changes its page
 * structure, the adapter keeps returning HTTP 200, the parser extracts nothing,
 * and a cheerful, empty, authoritative-looking newsletter goes out to every
 * subscriber. That email cannot be recalled, and a data publication that mails
 * confident nonsense has spent the only thing it has.
 *
 * So the rule is inverted from the usual one: silence is treated as failure.
 * An adapter that reports success while producing nothing is more suspicious
 * than one that throws.
 *
 * Exit code is always 0 — the workflow branches on the `safe` output rather
 * than on the process failing, so an unsafe issue still gets archived and
 * deployed. Only the delivery is withheld.
 *
 *   npm run newsletter:preflight
 */
import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  parseLocale,
  segmentIdFor,
  segmentSources,
  type EnvLookup,
} from "../src/lib/newsletter/subscriber-language";
import { contactPaths, liveContactCount } from "../src/lib/newsletter/resend";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Warning text that means a parser met something it did not recognise. */
const STRUCTURE_CHANGE =
  /parse|selector|structure|schema|unexpected|malformed|could not find|no rows|shape/i;

/**
 * An adapter failure that is the network, not the source.
 *
 * This distinction is the whole point. Preflight was written to catch the
 * SILENT failure — a source quietly changes shape, the parser yields nothing,
 * and we mail confident nonsense. A timeout is the opposite kind of failure:
 * loud, self-announcing, and gone by the next run.
 *
 * On 2026-08-06 the two were treated identically. One CourtListener request
 * aborted, `ok:false` was recorded, and a perfectly good issue — six stories in
 * each of four languages, drawn from an archive of 697 events and seven other
 * healthy adapters — was withheld from every subscriber. Nothing retried it and
 * nothing was wrong with it.
 *
 * A transient failure means we may have missed some stories. A structural
 * failure means we may PRINT something false. Only the second is worth
 * withholding an issue over.
 */
const TRANSIENT_FAILURE =
  /fetch failed|abort|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|connection reset|HTTP (429|5\d\d)/i;

/**
 * How much of the pipeline may be transiently down before it stops being a
 * blip and starts being an outage.
 *
 * At two thirds healthy, the issue still rests on most of its sources. Below
 * that, "we probably missed a few stories" is no longer an honest description
 * of what happened, and delivery should wait.
 */
const MIN_HEALTHY_ADAPTER_RATIO = 2 / 3;

/** Warnings that are ordinary operating conditions, not defects. */
const BENIGN = /offline: skipped|not configured|unconfigured|no api key|rate limit/i;

/**
 * A spamFlag that concerns the opt-out. Matching one is disqualifying.
 *
 * Deliberately broad: every phrasing build-newsletter.ts can emit mentions
 * unsubscribing in one of the four shipped languages, and a flag this misses
 * would be a flag that silently stops blocking.
 */
const UNSUBSCRIBE_FLAG = /unsubscrib|opt.?out|désabonn|desabonn|cancelar suscri|إلغاء الاشتراك/i;

export interface RefreshReport {
  ok?: boolean;
  errors?: string[];
  bls?: { ok?: boolean; stale?: boolean };
  cbp?: { ok?: boolean; stale?: boolean };
  warn?: { ok?: boolean; stale?: boolean };
}

export interface EventsReport {
  adapters?: Array<{
    key: string;
    name?: string;
    status?: string;
    ok?: boolean;
    eventCount?: number;
    warnings?: string[];
  }>;
  events?: Array<{ id: string }>;
}

export interface NewsletterManifest {
  today?: string;
  editions?: Array<{
    segment: string;
    locale: string;
    items?: number;
    errors?: string[];
    warnings?: string[];
    /** Deliverability findings from build-newsletter.ts. */
    spamFlags?: string[];
    /** Preflight codes the build already judged blocking. */
    blockingFlags?: string[];
    safeToSend?: boolean;
  }>;
}

export interface Verdict {
  safe: boolean;
  blocking: string[];
  warnings: string[];
}

export interface AssessOptions {
  /** Locales the issue must contain. A missing language is a blocking defect. */
  expectedLocales?: string[];
}

/**
 * Pure so it can be unit-tested against synthetic failures — the real ones are
 * rare by construction and cannot be waited for.
 */
export function assess(
  refresh: RefreshReport,
  events: EventsReport,
  newsletter: NewsletterManifest,
  opts: AssessOptions = {}
): Verdict {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const expected = opts.expectedLocales ?? ["en", "es", "fr", "ar"];

  // ── 1. Upstream data sources ──────────────────────────────────────────
  if (refresh.ok === false) blocking.push("refresh.json reports ok=false");
  for (const e of refresh.errors ?? []) blocking.push(`refresh error: ${e}`);
  for (const key of ["bls", "cbp", "warn"] as const) {
    const src = refresh[key];
    if (!src) continue;
    if (src.ok === false) blocking.push(`${key.toUpperCase()} feed failed`);
    // Stale is survivable: the site labels it, and last-good data is still true
    // data. It should not silence a whole issue.
    else if (src.stale) warnings.push(`${key.toUpperCase()} is serving last-good (stale) data`);
  }

  // ── 2. Event adapters — where a page-structure change shows up ────────
  const adapters = events.adapters ?? [];
  if (adapters.length === 0) blocking.push("events.json lists no adapters at all");

  // Failures are triaged before any of them is called blocking, because the
  // verdict on a transient one depends on how many others also failed.
  const failed = adapters.filter((a) => a.ok === false);
  const transientFailures = failed.filter((a) =>
    (a.warnings ?? []).some((w) => TRANSIENT_FAILURE.test(w) && !STRUCTURE_CHANGE.test(w))
  );
  const structuralFailures = failed.filter((a) => !transientFailures.includes(a));
  const healthyRatio = adapters.length ? (adapters.length - failed.length) / adapters.length : 0;
  const mostlyHealthy = healthyRatio >= MIN_HEALTHY_ADAPTER_RATIO;

  for (const a of structuralFailures) {
    blocking.push(`adapter "${a.name || a.key}" failed`);
  }

  for (const a of transientFailures) {
    const label = a.name || a.key;
    const why = (a.warnings ?? []).find((w) => TRANSIENT_FAILURE.test(w)) ?? "network failure";
    if (mostlyHealthy) {
      // Survivable. The archive is cumulative, so anything this source
      // published will be picked up by the next run and is not lost.
      warnings.push(`${label}: transient network failure, tolerated (${why})`);
    } else {
      blocking.push(
        `adapter "${label}" failed (${why}) — and only ${Math.round(healthyRatio * 100)}% of sources are healthy, ` +
          `which is an outage rather than a blip`
      );
    }
  }

  for (const a of adapters) {
    const label = a.name || a.key;
    if (a.ok === false) continue; // already triaged above
    for (const w of a.warnings ?? []) {
      if (BENIGN.test(w)) {
        warnings.push(`${label}: ${w}`);
        continue;
      }
      if (STRUCTURE_CHANGE.test(w)) {
        // The USCIS-changed-its-HTML case. Reported as a warning by the
        // adapter, treated as blocking here: a parser that no longer
        // understands its source is not a source.
        blocking.push(`adapter "${label}" may have hit a source format change: ${w}`);
      } else {
        warnings.push(`${label}: ${w}`);
      }
    }
  }

  // Every adapter succeeding while the archive is empty is the exact silent
  // failure this file exists for.
  if ((events.events ?? []).length === 0) {
    blocking.push("event archive is empty — nothing to write an issue about");
  }

  // ── 3. The issue itself ───────────────────────────────────────────────
  const editions = newsletter.editions ?? [];
  if (editions.length === 0) blocking.push("no editions were built");

  const built = new Set(editions.map((e) => e.locale));
  for (const locale of expected) {
    if (!built.has(locale)) blocking.push(`missing ${locale.toUpperCase()} edition`);
  }

  for (const ed of editions) {
    for (const err of ed.errors ?? []) blocking.push(`${ed.segment}: ${err}`);
    if ((ed.items ?? 0) === 0) {
      blocking.push(`${ed.segment} has zero items — an empty issue must not go out`);
    }

    // ── Unsubscribe: blocking, always ───────────────────────────────────
    // spamFlags used to be computed and then ignored, so "no unsubscribe link"
    // was reported to nobody and stopped nothing. Every other deliverability
    // heuristic stays advisory — a long subject is a nuisance, a missing
    // opt-out is mail we must not send.
    //
    // Read from BOTH shapes: `blockingFlags` is the structured verdict from
    // build-newsletter.ts, and the spamFlags scan is the belt-and-braces path
    // for a manifest written before that field existed, or by a build whose
    // gate regressed.
    for (const code of ed.blockingFlags ?? []) {
      blocking.push(`${ed.segment}: blocked by preflight (${code})`);
    }
    for (const flag of ed.spamFlags ?? []) {
      if (UNSUBSCRIBE_FLAG.test(flag)) blocking.push(`${ed.segment}: ${flag}`);
      else warnings.push(`${ed.segment}: ${flag}`);
    }
    if (ed.safeToSend === false && !(ed.blockingFlags ?? []).length) {
      blocking.push(`${ed.segment}: build marked this edition unsafe to send`);
    }

    for (const w of ed.warnings ?? []) warnings.push(`${ed.segment}: ${w}`);
  }

  return { safe: blocking.length === 0, blocking, warnings };
}

/* ── Delivery preflight: is Resend actually able to receive this? ─────── */

const RESEND_API = process.env.RESEND_API_BASE || "https://api.resend.com";

/**
 * Everything this check reads from the outside world, injected.
 *
 * Exported and parameterised because it was previously untestable — it read
 * `process.env` and the global `fetch` directly, so the only way to exercise it
 * was to run it against a live Resend account. Two defects lived in here for
 * weeks as a direct result, and neither could have been caught by a test that
 * did not exist.
 */
export interface DeliveryChecks {
  /** Plain record, not ProcessEnv — see EnvLookup in subscriber-language.ts. */
  env: EnvLookup;
  fetch: typeof globalThis.fetch;
  apiBase: string;
}

export async function checkAudiences(
  locales: string[],
  deps: DeliveryChecks = { env: process.env, fetch: globalThis.fetch, apiBase: RESEND_API }
): Promise<Verdict> {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const key = deps.env.RESEND_API_KEY || "";

  // ── Reply-To, fail-safe ─────────────────────────────────────────────
  // Blocking, not a warning. Unset, this variable silently costs the broadcast
  // its Reply-To header AND strips the "Contact" link out of the archived
  // edition at build time — a quietly different newsletter that nobody can
  // reply to. It was found by diffing the deployed edition against a local
  // rebuild, which is not a check that runs every week.
  //
  // The site publishes a contact address; a newsletter that discards replies to
  // it is worse than one that fails to send.
  if (!deps.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()) {
    blocking.push(
      "NEXT_PUBLIC_CONTACT_EMAIL is not set — the broadcast would carry no Reply-To and the " +
        "archived edition would drop its Contact link"
    );
  }

  if (!key) {
    // Not a defect at preflight time — send-newsletter.ts fails loudly if a
    // live send is attempted without a key. Reported so the log is honest.
    warnings.push("RESEND_API_KEY not set — audience sizes not verified");
    return { safe: blocking.length === 0, blocking, warnings };
  }

  let reachable = 0;
  for (const locale of locales) {
    const parsed = parseLocale(locale);
    if (!parsed) {
      warnings.push(`unrecognised locale "${locale}" in the manifest — skipped`);
      continue;
    }

    // THE SAME RESOLVER THE SENDER USES, not a second copy of the rule.
    //
    // This read `RESEND_AUDIENCE_<LOCALE>` directly while send-newsletter.ts
    // resolved through segmentIdFor(), which prefers the canonical
    // RESEND_SEGMENT_<LOCALE> and falls back to the alias. So a migration to the
    // canonical names — the migration the whole env-var family exists to
    // support — would have made this check silently stop verifying anything:
    // every locale "unset", nothing probed, and a green preflight that had
    // confirmed nothing at all.
    const id = segmentIdFor(parsed, deps.env);
    if (!id) {
      warnings.push(
        `${locale} has no segment configured (set ${segmentSources(parsed).join(" or ")}) — it will be skipped`
      );
      continue;
    }

    const outcome = await probeContacts(id, key, deps);
    if (outcome.kind === "unreachable") {
      blocking.push(`Resend segment ${locale.toUpperCase()} unreachable (${outcome.detail})`);
      continue;
    }
    if (outcome.kind === "unexpected-shape") {
      blocking.push(`Resend segment ${locale.toUpperCase()} returned an unexpected shape`);
      continue;
    }
    if (outcome.live === 0) {
      warnings.push(`${locale.toUpperCase()} segment has 0 subscribed contacts`);
    } else {
      reachable++;
    }
  }

  // Every configured audience failing means the integration is down, not that
  // one language is quiet.
  if (reachable === 0 && blocking.length > 0) {
    blocking.push("no Resend segment could be verified — treating delivery as unsafe");
  }

  return { safe: blocking.length === 0, blocking, warnings };
}

type Probe =
  | { kind: "ok"; live: number }
  | { kind: "unreachable"; detail: string }
  | { kind: "unexpected-shape" };

/**
 * Read a segment's live contact count, trying both API generations.
 *
 * THE DEFECT THIS REPLACES WOULD HAVE WITHHELD DELIVERY ON A HEALTHY ACCOUNT.
 * The old code probed `/audiences/{id}/contacts` and nothing else, and treated
 * any non-OK response as blocking. Resend has retired that path from its
 * reference in favour of `/segments/{id}/contacts` — which the SENDER was
 * already updated for and this file was not. The first week RESEND_API_KEY was
 * set, every locale would have 404'd, every 404 would have been recorded as
 * "unreachable", and the run would have concluded "no Resend audience could be
 * verified — treating delivery as unsafe": an outage reported at Resend on a
 * week when Resend was fine.
 *
 * Both paths come from contactPaths() so the sender and this check cannot drift
 * apart again. A path is only "unreachable" when EVERY path failed; the detail
 * carries what each one said, because "HTTP 404" alone would send an operator
 * looking at the wrong system.
 */
async function probeContacts(id: string, key: string, deps: DeliveryChecks): Promise<Probe> {
  const failures: string[] = [];

  for (const path of contactPaths(id)) {
    try {
      const res = await deps.fetch(`${deps.apiBase}${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        failures.push(`${path} → HTTP ${res.status}`);
        continue;
      }
      const live = liveContactCount(await res.json());
      // A 200 with a body we cannot read is NOT something to retry on the older
      // path: the endpoint answered, it simply answered something unexpected,
      // and that is a finding rather than a reason to keep looking.
      if (live === null) return { kind: "unexpected-shape" };
      return { kind: "ok", live };
    } catch (err) {
      failures.push(`${path} → ${(err as Error)?.message ?? err}`);
    }
  }

  return { kind: "unreachable", detail: failures.join("; ") };
}

async function loadJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(`${ROOT}${rel}`, "utf8")) as T;
}

async function main() {
  const refresh = await loadJson<RefreshReport>("src/lib/generated/refresh.json");
  const events = await loadJson<EventsReport>("src/lib/generated/events.json");
  const newsletter = await loadJson<NewsletterManifest>(
    "src/lib/generated/newsletter-latest.json"
  );

  const content = assess(refresh, events, newsletter);
  const locales = (newsletter.editions ?? []).map((e) => e.locale);
  const delivery = await checkAudiences(locales);

  const blocking = [...content.blocking, ...delivery.blocking];
  const warnings = [...content.warnings, ...delivery.warnings];
  const safe = blocking.length === 0;

  console.log("::group::Newsletter preflight");
  console.log(`issue        : ${newsletter.today ?? "unknown"}`);
  console.log(`editions     : ${(newsletter.editions ?? []).length}`);
  console.log(`adapters     : ${(events.adapters ?? []).length}`);
  console.log(`archive size : ${(events.events ?? []).length} event(s)`);
  console.log(`verdict      : ${safe ? "SAFE TO SEND" : "UNSAFE — DELIVERY WITHHELD"}`);
  if (blocking.length) {
    console.log("\nBlocking:");
    for (const b of blocking) console.log(`  ✗ ${b}`);
  }
  if (warnings.length) {
    console.log("\nWarnings (not blocking):");
    for (const w of warnings) console.log(`  · ${w}`);
  }
  console.log("::endgroup::");

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `safe=${safe}\nblocking_count=${blocking.length}\n` +
        `reason=${blocking.slice(0, 3).join("; ").replace(/\n/g, " ").slice(0, 400)}\n`
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "## Newsletter preflight",
      "",
      safe
        ? "**SAFE TO SEND** — no anomalies detected."
        : "**DELIVERY WITHHELD** — the issue was built, archived and deployed, but not mailed.",
      "",
    ];
    if (blocking.length) {
      lines.push("### Blocking", ...blocking.map((b) => `- ${b}`), "");
    }
    if (warnings.length) {
      lines.push("### Warnings", ...warnings.map((w) => `- ${w}`), "");
    }
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }

  // Always exit 0. The workflow branches on `safe`; an unsafe issue must still
  // archive and deploy, so failing the process here would be wrong.
}

// Only run when invoked directly, so the test suite can import `assess`.
const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[preflight] FAILED: ${err?.stack || err?.message || err}`);
    // A preflight that cannot run is itself an anomaly: withhold delivery.
    if (process.env.GITHUB_OUTPUT) {
      void appendFile(process.env.GITHUB_OUTPUT, `safe=false\nreason=preflight crashed\n`);
    }
    process.exit(0);
  });
}
