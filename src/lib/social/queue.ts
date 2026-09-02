// =============================================================================
// THE EDITORIAL QUEUE — what the account could say, and what became of it
//
// THE FAILURE THIS FILE ANSWERS
// -----------------------------
// A major court order was recorded on 2026-08-28. The two windows that could
// have carried it never ran (the crons fired late), the evening window was
// spent on a candidate that could not post, and by the time a run reached it
// the order was three days old and outranked. Nothing in the system remembered
// that it had been worth publishing. Good stories were disappearing because
// they were not published in the exact run that found them.
//
// So every candidate the selector produces is written to a committed queue
// with a status, and the queue survives across runs:
//
//   candidate    the selector produced it, from verified data
//   verified     it clears the reader-value floor and has a share page
//   ready        copy was generated and validated, and is stored here — a run
//                that fails to publish it leaves it ready for the next window,
//                which then publishes the stored copy without a second call
//   scheduled    the cadence policy chose it but a rule deferred it to a later
//                window (spacing, or the tier this window does not take)
//   published    it went out; the ledger row is the record of the text
//   rejected     it was considered and refused, with the reason
//   superseded   a newer record replaced it — a final rule after its proposal
//
// THE LEDGER IS STILL THE GUARD
// -----------------------------
// The queue is a memory, not a lock. Every rerun guard and every cooldown reads
// the ledger's POSTED rows; the queue can be deleted and rebuilt from the data
// without changing what may publish. That is why a corrupt queue is a warning
// and a corrupt ledger halts everything.
// =============================================================================

import { createHash } from "node:crypto";
import { ogImagePath, type OgKind } from "@/lib/share";
import { TIER_FOR_TYPE, type CadenceTier, type ContentType } from "./content-types";
import type { Candidate, GeneratedCopy, Platform, SlotId } from "./types";

export const QUEUE_VERSION = 1 as const;

export type QueueStatus =
  | "candidate"
  | "verified"
  | "ready"
  | "scheduled"
  | "published"
  | "rejected"
  | "superseded";

export interface QueueTransition {
  at: string;
  status: QueueStatus;
  reason: string;
}

export interface QueueItem {
  /** `${subjectId}::${contentType}` — one row per treatment of one record. */
  id: string;
  subjectId: string;
  contentType: ContentType;
  tier: CadenceTier;
  status: QueueStatus;
  /** The record's own title. Never model-written. */
  headline: string;
  /** A short headline the writer proposed, when copy exists. Not published. */
  suggestedHeadline: string | null;
  sourceName: string;
  sourceUrl: string | null;
  /** The archive event id, for a recorded change. */
  eventId: string | null;
  /** The category, topic and score the selector assigned. */
  category: string;
  topicKey: string;
  priority: number;
  readerValue: number;
  /** Hash of the fact set the item was last verified against. */
  factsHash: string;
  /** The derived implications — the why-it-matters context, as restated fields. */
  whyItMatters: string[];
  /** The validated copy, when the item is ready. Byte for byte what would ship. */
  suggestedPost: { x: string; linkedin: string; structure: string | null } | null;
  /** The clean canonical URL of the record. */
  shareUrl: string;
  /** The Open Graph card for the record. */
  ogImage: string;
  freshness: {
    publishedAt: string | null;
    discoveredAt: string;
    /** After this the item is rejected as expired rather than published. */
    expiresAt: string;
  };
  /** The window the item was deferred to, when scheduled. */
  scheduledFor: SlotId | null;
  publishedAt: string | null;
  externalUrl: string | null;
  history: QueueTransition[];
}

export interface EditorialQueue {
  version: typeof QUEUE_VERSION;
  updatedAt: string;
  items: QueueItem[];
}

export const EMPTY_QUEUE: EditorialQueue = { version: QUEUE_VERSION, updatedAt: "1970-01-01T00:00:00.000Z", items: [] };

/** How long each kind of item stays publishable, in days from discovery. */
export const QUEUE_TTL_DAYS: Record<ContentType, number> = {
  breaking_change: 3,
  what_changed: 10,
  why_it_matters: 21,
  effective_date: 90,
  key_date: 7,
  data_signal: 45,
  explainer: 365,
  data_discovery: 365,
};

export function queueItemId(subjectId: string, contentType: ContentType): string {
  return `${subjectId}::${contentType}`;
}

export function hashFactsForQueue(facts: unknown): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 16);
}

/**
 * Parse, tolerating a missing file but flagging a corrupt one.
 *
 * Unlike the ledger, a corrupt queue does not halt publishing: nothing the
 * queue holds is a guard. The caller starts from empty and says so.
 */
export function parseQueue(raw: string | null): EditorialQueue | null {
  if (raw === null || raw.trim() === "") return EMPTY_QUEUE;
  try {
    const parsed = JSON.parse(raw) as Partial<EditorialQueue>;
    if (parsed.version !== QUEUE_VERSION || !Array.isArray(parsed.items)) return null;
    for (const item of parsed.items) {
      if (typeof item?.id !== "string" || typeof item?.status !== "string") return null;
    }
    return { version: QUEUE_VERSION, updatedAt: parsed.updatedAt ?? EMPTY_QUEUE.updatedAt, items: parsed.items as QueueItem[] };
  } catch {
    return null;
  }
}

/** Stable on disk: by status group, then priority, so a diff reads as a change of state. */
export function serializeQueue(queue: EditorialQueue): string {
  const order: Record<QueueStatus, number> = {
    ready: 0,
    scheduled: 1,
    verified: 2,
    candidate: 3,
    published: 4,
    superseded: 5,
    rejected: 6,
  };
  const items = [...queue.items].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      b.priority - a.priority ||
      a.id.localeCompare(b.id)
  );
  return `${JSON.stringify({ version: QUEUE_VERSION, updatedAt: queue.updatedAt, items }, null, 2)}\n`;
}

function isoShift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function ogKindFor(subjectId: string): OgKind {
  if (subjectId.startsWith("explainer:")) return "explainer";
  if (subjectId.startsWith("signal:")) return "signal";
  if (subjectId.startsWith("event:")) return "change";
  return "page";
}

function ogKeyFor(candidate: Candidate): string {
  const kind = ogKindFor(candidate.subjectId);
  if (kind === "change") return candidate.deepLink.replace(/^\/what-changed\//, "");
  if (kind === "explainer") return candidate.deepLink.replace(/^\/explained\//, "");
  if (kind === "signal") return candidate.deepLink.replace(/^\/insights\//, "");
  // Hub pages: the page key is the last path segment, or the whole path for
  // nested ones, matching the OG_PAGES registry on the app side.
  const PAGE_KEYS: Record<string, string> = {
    "/what-changed": "what-changed",
    "/h1b/employers": "h1b-employers",
    "/h1b/top-sponsors": "h1b-top-sponsors",
    "/layoffs": "layoffs",
    "/layoffs-vs-h1b": "layoffs-vs-h1b",
    "/border/encounters": "border-encounters",
    "/key-dates": "key-dates",
    "/immigration/enforcement-trends": "enforcement-trends",
    "/visa/f1-student-visas": "f1-student-visas",
    "/following": "following",
    "/explained": "explained",
    "/insights": "insights",
    "/migration-map": "migration-map",
    "/work-visas": "work-visas",
    "/developers": "developers",
    "/timeline": "timeline",
    "/pulse": "pulse",
    "/enforcement": "enforcement",
  };
  return PAGE_KEYS[candidate.deepLink] ?? candidate.deepLink.replace(/^\//, "").replace(/\//g, "-");
}

/** The Open Graph card a candidate's share page carries. */
export function ogImageFor(candidate: Candidate): string {
  return ogImagePath(ogKindFor(candidate.subjectId), ogKeyFor(candidate));
}

function transition(item: QueueItem, status: QueueStatus, reason: string, at: string): QueueItem {
  if (item.status === status && item.history[item.history.length - 1]?.reason === reason) return item;
  return { ...item, status, history: [...item.history, { at, status, reason }] };
}

/** Title stem used to detect a newer record that supersedes an older one. */
function titleStem(title: string): string {
  return title
    .replace(/^Policy alert:\s*/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
}

export interface RefreshResult {
  queue: EditorialQueue;
  added: number;
  superseded: number;
  expired: number;
}

/**
 * Bring the queue up to date with today's candidates.
 *
 *   • every candidate is upserted as `verified` (the selector already applied
 *     the reader-value floor), keeping a `ready` item's stored copy when its
 *     fact set has not moved
 *   • a `ready` item whose facts moved drops back to `verified`, because the
 *     stored copy may state a figure that is no longer current
 *   • an item whose record has aged out of the candidates, and was never
 *     published, is `rejected` as expired
 *   • an older recorded change with the same title stem as a newer one is
 *     `superseded` — a proposed rule by its final rule, a policy by its reversal
 *
 * Published rows are never touched: they are history.
 */
export function refreshQueue(
  queue: EditorialQueue,
  candidates: Candidate[],
  now: Date,
  today: string,
  hashFacts: (facts: Candidate["facts"]) => string = hashFactsForQueue
): RefreshResult {
  const at = now.toISOString();
  const byId = new Map(queue.items.map((i) => [i.id, i]));
  let added = 0;
  let superseded = 0;
  let expired = 0;

  const seen = new Set<string>();

  for (const c of candidates) {
    const id = queueItemId(c.subjectId, c.contentType);
    seen.add(id);
    const factsHash = hashFacts(c.facts);
    const existing = byId.get(id);

    if (!existing) {
      added++;
      byId.set(id, {
        id,
        subjectId: c.subjectId,
        contentType: c.contentType,
        tier: c.tier,
        status: "verified",
        headline: c.label,
        suggestedHeadline: null,
        sourceName: c.facts.sourceName,
        sourceUrl: c.sourceUrl,
        eventId: c.event?.id ?? null,
        category: c.category,
        topicKey: c.topicKey,
        priority: c.score,
        readerValue: c.readerValue.score,
        factsHash,
        whyItMatters: c.facts.implications ?? [],
        suggestedPost: null,
        shareUrl: c.facts.shareUrl ?? c.facts.deepLink,
        ogImage: ogImageFor(c),
        freshness: {
          publishedAt: c.facts.publishedAt,
          discoveredAt: today,
          expiresAt:
            c.contentType === "effective_date" && c.facts.effectiveAt
              ? c.facts.effectiveAt
              : isoShift(today, QUEUE_TTL_DAYS[c.contentType]),
        },
        scheduledFor: null,
        publishedAt: null,
        externalUrl: null,
        history: [
          { at, status: "candidate", reason: "produced by the selector from verified data" },
          { at, status: "verified", reason: `reader value ${c.readerValue.score}/100 clears the floor; share page ${c.facts.shareUrl ?? c.facts.deepLink}` },
        ],
      });
      continue;
    }

    if (existing.status === "published" || existing.status === "superseded") continue;

    let next: QueueItem = { ...existing, priority: c.score, readerValue: c.readerValue.score, whyItMatters: c.facts.implications ?? [] };
    if (existing.factsHash !== factsHash) {
      next = { ...next, factsHash, suggestedPost: existing.status === "ready" ? null : existing.suggestedPost };
      if (existing.status === "ready") {
        next = transition(next, "verified", `fact set changed (${existing.factsHash} → ${factsHash}); stored copy discarded`, at);
      }
    }
    if (existing.status === "rejected" && /expired/.test(existing.history[existing.history.length - 1]?.reason ?? "")) {
      // Back in the candidates after an expiry means the record's timing moved
      // — an effective date announced, say. It earns its place again.
      next = transition(next, "verified", "re-entered the candidates", at);
    }
    byId.set(id, next);
  }

  // Expire what the selector no longer produces.
  for (const item of byId.values()) {
    if (seen.has(item.id)) continue;
    if (item.status === "published" || item.status === "superseded" || item.status === "rejected") continue;
    expired++;
    byId.set(item.id, transition(item, "rejected", `expired: no longer a candidate on ${today}`, at));
  }

  // Supersede older changes whose title stem a newer change repeats.
  const changes = [...byId.values()].filter((i) => i.eventId && i.status !== "published" && i.status !== "superseded");
  const newestByStem = new Map<string, QueueItem>();
  for (const item of changes) {
    const stem = titleStem(item.headline);
    const current = newestByStem.get(stem);
    if (!current || (item.freshness.publishedAt ?? "") > (current.freshness.publishedAt ?? "")) {
      newestByStem.set(stem, item);
    }
  }
  for (const item of changes) {
    const newest = newestByStem.get(titleStem(item.headline));
    if (newest && newest.eventId !== item.eventId && (newest.freshness.publishedAt ?? "") > (item.freshness.publishedAt ?? "")) {
      superseded++;
      byId.set(item.id, transition(item, "superseded", `superseded by ${newest.eventId} (${newest.freshness.publishedAt})`, at));
    }
  }

  // Past its own expiry date, whatever the selector says.
  for (const item of byId.values()) {
    if (item.status === "published" || item.status === "superseded" || item.status === "rejected") continue;
    if (item.freshness.expiresAt < today) {
      expired++;
      byId.set(item.id, transition(item, "rejected", `expired on ${item.freshness.expiresAt}`, at));
    }
  }

  return { queue: { version: QUEUE_VERSION, updatedAt: at, items: [...byId.values()] }, added, superseded, expired };
}

/** The stored, validated copy for a candidate, when its facts have not moved. */
export function readyCopy(
  queue: EditorialQueue,
  candidate: Candidate,
  factsHash: string
): { x: string; linkedin: string; structure: string | null } | null {
  const item = queue.items.find((i) => i.id === queueItemId(candidate.subjectId, candidate.contentType));
  if (!item || item.status !== "ready" || !item.suggestedPost || item.factsHash !== factsHash) return null;
  return item.suggestedPost;
}

export function markReady(
  queue: EditorialQueue,
  candidate: Candidate,
  copy: GeneratedCopy,
  factsHash: string,
  now: Date
): EditorialQueue {
  return update(queue, candidate, (item) =>
    transition(
      {
        ...item,
        factsHash,
        suggestedPost: { x: copy.x, linkedin: copy.linkedin, structure: copy.structure ?? null },
        suggestedHeadline: copy.headline ?? item.suggestedHeadline,
      },
      "ready",
      "copy generated and validated",
      now.toISOString()
    )
  );
}

export function markScheduled(queue: EditorialQueue, candidate: Candidate, slot: SlotId, reason: string, now: Date): EditorialQueue {
  return update(queue, candidate, (item) => transition({ ...item, scheduledFor: slot }, "scheduled", reason, now.toISOString()));
}

export function markPublished(
  queue: EditorialQueue,
  candidate: Candidate,
  result: { platform: Platform; externalUrl: string | null },
  now: Date
): EditorialQueue {
  return update(queue, candidate, (item) =>
    transition(
      { ...item, publishedAt: now.toISOString(), externalUrl: result.externalUrl ?? item.externalUrl, scheduledFor: null },
      "published",
      `published on ${result.platform}`,
      now.toISOString()
    )
  );
}

export function markRejected(queue: EditorialQueue, candidate: Candidate, reason: string, now: Date): EditorialQueue {
  return update(queue, candidate, (item) => transition(item, "rejected", reason, now.toISOString()));
}

function update(queue: EditorialQueue, candidate: Candidate, fn: (item: QueueItem) => QueueItem): EditorialQueue {
  const id = queueItemId(candidate.subjectId, candidate.contentType);
  let found = false;
  const items = queue.items.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return fn(item);
  });
  if (!found) return queue;
  return { version: QUEUE_VERSION, updatedAt: new Date().toISOString(), items };
}

/** A one-screen summary, for the preflight and the queue script. */
export function summarizeQueue(queue: EditorialQueue): Record<QueueStatus, number> {
  const out: Record<QueueStatus, number> = {
    candidate: 0,
    verified: 0,
    ready: 0,
    scheduled: 0,
    published: 0,
    rejected: 0,
    superseded: 0,
  };
  for (const item of queue.items) out[item.status] += 1;
  return out;
}

/** The tier a stored item belongs to, for the cadence policy's benefit. */
export function tierOfItem(item: QueueItem): CadenceTier {
  return TIER_FOR_TYPE[item.contentType];
}
