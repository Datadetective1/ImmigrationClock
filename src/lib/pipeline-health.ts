// =============================================================================
// PIPELINE HEALTH — is the archive quiet because nothing happened, or because
// something broke?
//
// WHY THIS EXISTS
// ---------------
// On 2026-10-08 the homepage's newest change had read "September 30" for a week
// while every workflow was green. Ingestion was fine; a severity rule was hiding
// what it ingested. Nothing in the system could tell the difference between
// "healthy and quiet", "healthy but filtering wrongly", "a source is down", and
// "the deploy never happened", so a person had to.
//
// This module makes that distinction machine-readable. It is pure — no fetch,
// no disk — so every state below is pinned by tests:
//
//   healthy_new      sources checked recently, and a significant change was
//                    published within NEW_WINDOW_DAYS
//   healthy_quiet    sources checked recently, all core sources OK, nothing
//                    significant in the window. A legitimate answer, NOT a fault.
//   stale            the last successful check is older than STALE_AFTER_HOURS
//   source_failure   a core source failed repeatedly or has not succeeded for
//                    SOURCE_DOWN_AFTER_HOURS
//   publish_failure  the repository holds a newer successful check than the
//                    live site serves, by more than PUBLISH_LAG_HOURS
//
// WHAT IT MUST NEVER DO
// ---------------------
// Imply a policy event. "Last checked" is when we looked; the newest change is
// when the government acted. They are separate fields and separate sentences.
// The public file carries counts and timestamps, never warning text, tokens or
// environment names.
// =============================================================================

export const STALE_AFTER_HOURS = 36; // daily cron + observed GitHub queue delay (up to ~8h)
export const SOURCE_DOWN_AFTER_HOURS = 72;
export const SOURCE_FAILURES_BEFORE_ALERT = 2; // one blip is not an incident
export const PUBLISH_LAG_HOURS = 6;
export const NEW_WINDOW_DAYS = 7;

export type HealthState = "healthy_new" | "healthy_quiet" | "stale" | "source_failure" | "publish_failure";

export interface AdapterRun {
  key: string;
  name: string;
  status?: string;
  lastRunAt: string | null;
  ok: boolean;
  eventCount: number;
  newCount?: number;
  latestPublishedAt?: string | null;
  warnings: string[];
}

export interface SourceHealth {
  key: string;
  name: string;
  /** False for a source that is deliberately not running (e.g. missing API key). */
  configured: boolean;
  ok: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  recordsInWindow: number;
  newRecords: number;
  latestPublishedAt: string | null;
  warningCount: number;
}

export interface RecordRef {
  id: string;
  title: string;
  publishedAt: string;
  severity?: string;
  /** When this pipeline first stored it. Distinct from publishedAt. */
  acceptedAt?: string;
}

export interface PipelineHealth {
  schema: 1;
  /** When this file was produced (= the last ingestion attempt). */
  generatedAt: string;
  lastAttemptedIngestion: string;
  /** At least one source produced a usable result. */
  lastSuccessfulIngestion: string | null;
  /** Every configured source succeeded. */
  lastSuccessfulSourceCheck: string | null;
  /** When this build was produced. Equal to generatedAt in the build; the monitor compares it with the live copy. */
  lastBuildAt: string;
  lastAcceptedRecord: RecordRef | null;
  latestSignificantRecord: RecordRef | null;
  latestRecord: RecordRef | null;
  counts: {
    archive: number;
    significant: number;
    sourcesConfigured: number;
    sourcesFailing: number;
    errorCount: number;
  };
  sources: SourceHealth[];
  thresholds: {
    staleAfterHours: number;
    sourceDownAfterHours: number;
    sourceFailuresBeforeAlert: number;
    publishLagHours: number;
    newWindowDays: number;
  };
}

interface EventLike {
  id: string;
  title: string;
  publishedAt: string;
  severity: string;
}

/** A source that is not running by design, not because it broke. */
export function isUnconfigured(a: AdapterRun): boolean {
  return a.ok && a.eventCount === 0 && a.warnings.some((w) => /\bis not set\b|not configured/i.test(w));
}

const ref = (e: EventLike, acceptedAt?: string): RecordRef => ({
  id: e.id,
  title: e.title,
  publishedAt: e.publishedAt,
  severity: e.severity,
  ...(acceptedAt ? { acceptedAt } : {}),
});

/**
 * Build the health record for one ingestion run.
 *
 * `previous` is the last committed health file. Last-success timestamps and
 * failure streaks are carried forward from it, because a single run only knows
 * about itself.
 */
export function buildHealth(input: {
  now: string;
  adapters: AdapterRun[];
  events: EventLike[];
  /** Ids this run added to the store (build-events records them). */
  addedIds: ReadonlySet<string>;
  previous: PipelineHealth | null;
}): PipelineHealth {
  const { now, adapters, events, addedIds, previous } = input;
  const prevByKey = new Map((previous?.sources ?? []).map((s) => [s.key, s]));

  const sources: SourceHealth[] = adapters.map((a) => {
    const prev = prevByKey.get(a.key);
    const configured = !isUnconfigured(a);
    return {
      key: a.key,
      name: a.name,
      configured,
      ok: a.ok,
      lastAttemptAt: a.lastRunAt ?? now,
      lastSuccessAt: a.ok ? a.lastRunAt ?? now : prev?.lastSuccessAt ?? null,
      consecutiveFailures: a.ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
      recordsInWindow: a.eventCount,
      newRecords: a.newCount ?? 0,
      latestPublishedAt: a.latestPublishedAt ?? prev?.latestPublishedAt ?? null,
      warningCount: a.warnings.length,
    };
  });

  const configured = sources.filter((s) => s.configured);
  const failing = configured.filter((s) => !s.ok);
  const anyOk = configured.some((s) => s.ok);

  // Events are stored newest-first, but do not rely on it.
  const byNewest = [...events].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const significant = byNewest.filter((e) => e.severity !== "routine");
  const added = byNewest.filter((e) => addedIds.has(e.id));

  return {
    schema: 1,
    generatedAt: now,
    lastAttemptedIngestion: now,
    lastSuccessfulIngestion: anyOk ? now : previous?.lastSuccessfulIngestion ?? null,
    lastSuccessfulSourceCheck:
      configured.length > 0 && failing.length === 0 ? now : previous?.lastSuccessfulSourceCheck ?? null,
    lastBuildAt: now,
    lastAcceptedRecord: added.length ? ref(added[0], now) : previous?.lastAcceptedRecord ?? null,
    latestSignificantRecord: significant.length ? ref(significant[0]) : null,
    latestRecord: byNewest.length ? ref(byNewest[0]) : null,
    counts: {
      archive: events.length,
      significant: significant.length,
      sourcesConfigured: configured.length,
      sourcesFailing: failing.length,
      errorCount: failing.length,
    },
    sources,
    thresholds: {
      staleAfterHours: STALE_AFTER_HOURS,
      sourceDownAfterHours: SOURCE_DOWN_AFTER_HOURS,
      sourceFailuresBeforeAlert: SOURCE_FAILURES_BEFORE_ALERT,
      publishLagHours: PUBLISH_LAG_HOURS,
      newWindowDays: NEW_WINDOW_DAYS,
    },
  };
}

const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;

export interface HealthVerdict {
  state: HealthState;
  /** True for the three states a person must act on. */
  alert: boolean;
  reasons: string[];
}

/**
 * Classify a health record at time `now`.
 *
 * `live` is the copy the production site serves, when the caller could fetch it.
 * Order matters: a failure that explains staleness is reported as itself.
 */
export function evaluateHealth(health: PipelineHealth, now: string, live?: PipelineHealth | null): HealthVerdict {
  const reasons: string[] = [];

  const down = health.sources.filter(
    (s) =>
      s.configured &&
      !s.ok &&
      (s.consecutiveFailures >= SOURCE_FAILURES_BEFORE_ALERT ||
        !s.lastSuccessAt ||
        hoursBetween(s.lastSuccessAt, now) > SOURCE_DOWN_AFTER_HOURS)
  );
  if (down.length) {
    for (const s of down) {
      reasons.push(
        `${s.name} has failed ${s.consecutiveFailures} run(s) in a row; last success ${s.lastSuccessAt ?? "never"}.`
      );
    }
    return { state: "source_failure", alert: true, reasons };
  }

  if (live && live.lastBuildAt && health.lastSuccessfulIngestion) {
    const lag = hoursBetween(live.lastBuildAt, health.lastSuccessfulIngestion);
    if (lag > PUBLISH_LAG_HOURS) {
      reasons.push(
        `The repository holds an ingestion from ${health.lastSuccessfulIngestion}, but the live site was built at ` +
          `${live.lastBuildAt} (${lag.toFixed(1)}h behind). The commit did not reach production.`
      );
      return { state: "publish_failure", alert: true, reasons };
    }
  }

  // Judge staleness by the freshest evidence available: a newer live build means
  // the site itself re-checked sources at deploy time.
  const lastCheck = [health.lastSuccessfulIngestion, live?.lastSuccessfulIngestion]
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop();
  if (!lastCheck || hoursBetween(lastCheck, now) > STALE_AFTER_HOURS) {
    reasons.push(
      `No successful source check since ${lastCheck ?? "ever"} (threshold ${STALE_AFTER_HOURS}h). ` +
        "The scheduled refresh has stopped, is queued, or is failing before ingestion."
    );
    return { state: "stale", alert: true, reasons };
  }

  // The newest significant record comes from whichever copy checked sources
  // last. The live build re-ingests at deploy time, so it can be a day ahead
  // of the committed file; judging "new" from the older copy reported
  // healthy_quiet on 2026-10-08 while the live homepage led with a same-day
  // proposed rule.
  const freshest =
    live?.lastSuccessfulIngestion && live.lastSuccessfulIngestion > (health.lastSuccessfulIngestion ?? "")
      ? live
      : health;
  const sig = freshest.latestSignificantRecord;
  if (sig && hoursBetween(`${sig.publishedAt}T00:00:00Z`, now) <= NEW_WINDOW_DAYS * 24) {
    reasons.push(`Newest significant change published ${sig.publishedAt}: ${sig.title}`);
    return { state: "healthy_new", alert: false, reasons };
  }
  reasons.push(
    `Sources checked ${lastCheck}; no significant change published in the last ${NEW_WINDOW_DAYS} days` +
      (sig ? ` (newest: ${sig.publishedAt}).` : ".")
  );
  return { state: "healthy_quiet", alert: false, reasons };
}

/**
 * Reader-facing sentence for "when did we last look". Deliberately says what it
 * is NOT, because the date sits next to a list of policy changes and must never
 * be read as one of them. Null when there is no successful check to report.
 */
export function lastCheckedSentence(health: Pick<PipelineHealth, "lastSuccessfulSourceCheck" | "lastSuccessfulIngestion">, format: (iso: string) => string): string | null {
  const at = health.lastSuccessfulSourceCheck ?? health.lastSuccessfulIngestion;
  if (!at) return null;
  return `Official sources last checked ${format(at)} — the date we looked, not the date of a change.`;
}
