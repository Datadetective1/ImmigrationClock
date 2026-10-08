// =============================================================================
// scripts/check-health.ts — is production fresh, and is it fresh for the right
// reason?
//
//   npm run health:check                 evaluate repo + live health
//   npm run health:check -- --probe      also list the Federal Register directly
//                                        and report documents we did not ingest
//
// Run by .github/workflows/pipeline-health.yml every six hours. Reads:
//   • the committed health record (what the last ingestion found),
//   • the LIVE https://immigrationclock.com/api/health.json (what production
//     actually deployed), and with --probe,
//   • the Federal Register API itself, independently of the adapter.
//
// Writes a step summary and, under GITHUB_OUTPUT, `state`, `alert`, `title`,
// `body` for the workflow to act on. Exit code is always 0: deciding whether to
// alert is the workflow's job, and a monitor that fails its own run on a quiet
// day teaches people to ignore it.
// =============================================================================

import { appendFileSync, readFileSync } from "node:fs";
import { evaluateHealth, type HealthVerdict, type PipelineHealth } from "../src/lib/pipeline-health";
import { __testing as FR } from "../src/domains/graph/adapters/federal-register";
import { FR_API, FR_UA } from "../src/domains/graph/adapters/federal-register-api";

const SITE = process.env.SITE_URL || "https://immigrationclock.com";
const PROBE = process.argv.includes("--probe");
const PROBE_DAYS = Number(process.env.PROBE_DAYS) || 10;
/** A document younger than this may simply not have been picked up yet. */
const PROBE_GRACE_DAYS = 2;

const now = new Date().toISOString();
const out: string[] = [];
const log = (s = "") => {
  out.push(s);
  console.log(s);
};

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { headers: { ...FR_UA, ...headers }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: (err as Error).message };
  }
}

interface ProbeDoc {
  document_number: string;
  title: string;
  type: string;
  publication_date: string;
  abstract: string | null;
}

/** Independent re-listing of the Federal Register, compared with the archive. */
async function probeFederalRegister(archiveIds: Map<string, string>): Promise<{ missing: ProbeDoc[]; error?: string }> {
  const since = new Date(Date.now() - PROBE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ per_page: "200", order: "newest", "conditions[publication_date][gte]": since });
  for (const slug of Object.keys(FR.__agencySlugs)) params.append("conditions[agencies][]", slug);
  for (const f of ["document_number", "title", "type", "publication_date", "abstract"]) params.append("fields[]", f);
  const r = await fetchJson<{ count: number; results: ProbeDoc[] }>(`${FR_API}?${params}`);
  if (!r.ok || !r.data) return { missing: [], error: `Federal Register API answered ${r.status || r.error}` };

  const graceCutoff = new Date(Date.now() - PROBE_GRACE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const missing: ProbeDoc[] = [];
  log(`### Federal Register, direct (${r.data.count} tracked-agency documents since ${since})`);
  log("");
  log("| Published | Type | Document | In archive | Severity | Title |");
  log("|---|---|---|---|---|---|");
  for (const d of r.data.results ?? []) {
    const relevant = FR.isImmigrationRelevant({ title: d.title, abstract: d.abstract });
    const id = `federal_register:${d.document_number}`;
    const sev = archiveIds.get(id);
    const status = sev ? "yes" : relevant ? "**MISSING**" : "not immigration";
    if (!sev && relevant && d.publication_date <= graceCutoff) missing.push(d);
    log(`| ${d.publication_date} | ${d.type} | ${d.document_number} | ${status} | ${sev ?? ""} | ${d.title.replace(/\|/g, "/").slice(0, 110)} |`);
  }
  log("");
  return { missing };
}


/** Plain text of an HTML page, enough to find a title in it. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

/**
 * Does the LIVE homepage show what the live health file says is newest?
 * A deploy can succeed while a stale page is still served (cache, wrong alias);
 * this checks the thing a reader actually sees.
 */
async function checkHomepage(expectedTitle: string | undefined): Promise<{ ok: boolean; note: string }> {
  try {
    const res = await fetch(`${SITE}/`, { headers: { ...FR_UA, "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, note: `Homepage answered ${res.status}.` };
    const text = pageText(await res.text());
    const at = text.indexOf("Latest immigration changes");
    log("### Live homepage, latest changes");
    log("");
    log("> " + (at >= 0 ? text.slice(at, at + 1200) : "(section not found)"));
    log("");
    if (!expectedTitle) return { ok: true, note: "No significant record to look for." };
    const shown = at >= 0 && text.slice(at, at + 4000).includes(pageText(expectedTitle).trim());
    return shown
      ? { ok: true, note: `Homepage shows the newest significant change: ${expectedTitle}` }
      : { ok: false, note: `Homepage does not show the newest significant change (${expectedTitle}).` };
  } catch (err) {
    return { ok: false, note: `Homepage unreachable: ${(err as Error).message}` };
  }
}

async function main() {
  const repo = JSON.parse(readFileSync("src/lib/generated/pipeline-health.json", "utf8")) as PipelineHealth;
  const live = await fetchJson<PipelineHealth>(`${SITE}/api/health.json`, { "Cache-Control": "no-cache" });

  log(`## Pipeline health — ${now}`);
  log("");
  if (!live.ok) {
    log(
      `Live health file not readable (${live.status || live.error}). Before the first deploy that ships ` +
        "/api/health.json this is expected; after it, a persistent failure here means production is not serving the current build."
    );
  }

  let verdict: HealthVerdict = evaluateHealth(repo, now, live.data);

  // Only judged once production serves a health file; before that, there is no
  // statement of what the page should show.
  if (live.data) {
    const home = await checkHomepage(live.data.latestSignificantRecord?.title);
    log(`- Homepage check: ${home.note}`);
    if (!home.ok && !verdict.alert) {
      verdict = { state: "publish_failure", alert: true, reasons: [home.note] };
    }
  }

  if (PROBE) {
    const store = JSON.parse(readFileSync("src/lib/generated/events.json", "utf8")) as {
      events: { id: string; severity: string }[];
    };
    const ids = new Map(store.events.map((e) => [e.id, e.severity]));
    const probe = await probeFederalRegister(ids);
    if (probe.error) log(`Probe skipped: ${probe.error}`);
    if (probe.missing.length && (verdict.state === "healthy_new" || verdict.state === "healthy_quiet")) {
      verdict = {
        state: "source_failure",
        alert: true,
        reasons: [
          `${probe.missing.length} immigration-relevant Federal Register document(s) older than ${PROBE_GRACE_DAYS} days are not in the archive:`,
          ...probe.missing.map((d) => `${d.publication_date} ${d.document_number} — ${d.title}`),
        ],
      };
    }
  }

  log(`**State: \`${verdict.state}\`**${verdict.alert ? " — action needed" : ""}`);
  for (const r of verdict.reasons) log(`- ${r}`);
  log("");
  log("| Source | OK | Last success | Failures in a row | In window | New | Newest published |");
  log("|---|---|---|---|---|---|---|");
  for (const s of repo.sources) {
    log(
      `| ${s.name}${s.configured ? "" : " (not configured)"} | ${s.ok ? "yes" : "**no**"} | ${s.lastSuccessAt ?? "never"} | ` +
        `${s.consecutiveFailures} | ${s.recordsInWindow} | ${s.newRecords} | ${s.latestPublishedAt ?? ""} |`
    );
  }
  log("");
  log(`- Last attempted ingestion (repo): ${repo.lastAttemptedIngestion}`);
  log(`- Last successful source check (repo): ${repo.lastSuccessfulSourceCheck ?? "never"}`);
  log(`- Last accepted record: ${repo.lastAcceptedRecord ? `${repo.lastAcceptedRecord.id} (accepted ${repo.lastAcceptedRecord.acceptedAt})` : "none recorded yet"}`);
  log(`- Newest significant change: ${repo.latestSignificantRecord ? `${repo.latestSignificantRecord.publishedAt} — ${repo.latestSignificantRecord.title}` : "none"}`);
  log(`- Live build: ${live.data?.lastBuildAt ?? "unknown"}`);

  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
  if (process.env.GITHUB_OUTPUT) {
    const body = [
      `State: \`${verdict.state}\` (checked ${now}).`,
      "",
      ...verdict.reasons.map((r) => `- ${r}`),
      "",
      "Run details: see the linked workflow run's summary. Close this issue once the next check reports healthy.",
    ].join("\n");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `state=${verdict.state}\nalert=${verdict.alert}\ntitle=[pipeline-health] ${verdict.state.replace(/_/g, " ")}\nbody<<__HEALTH_EOF__\n${body}\n__HEALTH_EOF__\n`
    );
  }
}

main().catch((err) => {
  console.error(`[check-health] could not evaluate: ${(err as Error).stack ?? err}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "state=unknown\nalert=false\n");
});
