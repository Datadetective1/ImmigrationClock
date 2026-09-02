// =============================================================================
// THE EDITORIAL QUEUE — a memory, not a lock
//
// What these pin: a candidate the selector produced is remembered with a
// status; validated copy survives a failed publish and is reused without a
// second model call; a newer record supersedes an older one with the same
// title stem; an item that ages out is rejected as expired rather than kept
// forever; and a corrupt queue is reported, never trusted.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  EMPTY_QUEUE,
  QUEUE_VERSION,
  markPublished,
  markReady,
  markRejected,
  markScheduled,
  parseQueue,
  queueItemId,
  readyCopy,
  refreshQueue,
  serializeQueue,
  summarizeQueue,
  ogImageFor,
  type EditorialQueue,
} from "@/lib/social/queue";
import { candidatesFor } from "@/lib/social/select";
import { hashFacts } from "@/lib/social/run";
import type { IndexedEvent } from "@/lib/event-index";
import type { Candidate } from "@/lib/social/types";

const NOW = new Date("2026-09-10T14:05:00Z");
const TODAY = "2026-09-10";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:q-1",
    title: "Fee for Certain H-1B Petitions",
    publishedAt: "2026-09-09",
    effectiveAt: null,
    scheduled: false,
    severity: "notable",
    classification: "proposed_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/q-1",
    summary:
      "The Department of Homeland Security (DHS) proposes to establish a $103,265 fee, payable at the time of filing, for all H-1B cap-subject petitions, including those eligible for the advanced degree exemption.",
    entityIds: ["agency:dhs", "visa:h-1b", "topic:h1b"],
    ...over,
  };
}

function pick(candidates: Candidate[], subjectId: string, contentType: string): Candidate {
  const c = candidates.find((x) => x.subjectId === subjectId && x.contentType === contentType);
  if (!c) throw new Error(`no candidate ${subjectId}::${contentType}`);
  return c;
}

describe("refreshQueue", () => {
  it("adds every candidate as verified, with its share page, card and implications", () => {
    const candidates = candidatesFor([event()], TODAY);
    const { queue, added } = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts);
    expect(added).toBe(candidates.length);
    const item = queue.items.find((i) => i.id === queueItemId("event:federal_register:q-1", "breaking_change"));
    expect(item).toBeDefined();
    expect(item!.status).toBe("verified");
    expect(item!.shareUrl).toMatch(/^https:\/\/immigrationclock\.com\/what-changed\/fee-for-certain-h-1b-petitions-[a-z0-9]{6}$/);
    expect(item!.ogImage).toMatch(/^\/og\/change\/fee-for-certain-h-1b-petitions-[a-z0-9]{6}\.png$/);
    expect(item!.whyItMatters.length).toBeGreaterThan(0);
    expect(item!.history.map((h) => h.status)).toEqual(["candidate", "verified"]);
    expect(item!.freshness.expiresAt > TODAY).toBe(true);
  });

  it("is idempotent across runs on the same day", () => {
    const candidates = candidatesFor([event()], TODAY);
    const first = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts).queue;
    const second = refreshQueue(first, candidates, NOW, TODAY, hashFacts);
    expect(second.added).toBe(0);
    expect(second.queue.items.length).toBe(first.items.length);
  });

  it("expires an item whose record left the candidates, and revives it if it comes back", () => {
    const candidates = candidatesFor([event()], TODAY);
    let queue = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts).queue;
    // Ten days later the proposal is no longer a breaking candidate.
    const later = "2026-09-20";
    const laterCandidates = candidatesFor([event()], later);
    const r = refreshQueue(queue, laterCandidates, new Date("2026-09-20T14:05:00Z"), later, hashFacts);
    const breaking = r.queue.items.find((i) => i.id === queueItemId("event:federal_register:q-1", "breaking_change"));
    expect(breaking!.status).toBe("rejected");
    expect(breaking!.history[breaking!.history.length - 1].reason).toMatch(/expired/);
    queue = r.queue;
    // A refresh on the original day would bring it back.
    const back = refreshQueue(queue, candidates, NOW, TODAY, hashFacts).queue;
    const revived = back.items.find((i) => i.id === breaking!.id);
    expect(revived!.status).toBe("verified");
  });

  it("supersedes an older record when a newer one repeats its title stem", () => {
    const proposal = event({ id: "federal_register:q-old", classification: "proposed_rule", publishedAt: "2026-09-04" });
    const finalRule = event({
      id: "federal_register:q-new",
      classification: "final_rule",
      severity: "major",
      publishedAt: "2026-09-09",
      effectiveAt: "2026-10-09",
      summary: "The Department of Homeland Security (DHS) is establishing a $103,265 fee, payable at the time of filing, for all H-1B cap-subject petitions.",
    });
    const candidates = candidatesFor([proposal, finalRule], TODAY);
    const { queue, superseded } = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts);
    expect(superseded).toBeGreaterThan(0);
    const old = queue.items.filter((i) => i.eventId === "federal_register:q-old");
    expect(old.length).toBeGreaterThan(0);
    for (const i of old) expect(i.status).toBe("superseded");
    const fresh = queue.items.filter((i) => i.eventId === "federal_register:q-new");
    for (const i of fresh) expect(i.status).toBe("verified");
  });

  it("drops stored copy when the fact set moves", () => {
    const candidates = candidatesFor([event()], TODAY);
    const c = pick(candidates, "event:federal_register:q-1", "breaking_change");
    let queue = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts).queue;
    queue = markReady(queue, c, { x: "x copy", linkedin: "li copy", deepLink: c.facts.deepLink, structure: "news" }, hashFacts(c.facts), NOW);
    expect(readyCopy(queue, c, hashFacts(c.facts))).toEqual({ x: "x copy", linkedin: "li copy", structure: "news" });

    const moved = candidatesFor([event({ summary: "The Department of Homeland Security (DHS) proposes to establish a $105,000 fee for all H-1B cap-subject petitions." })], TODAY);
    const movedC = pick(moved, "event:federal_register:q-1", "breaking_change");
    const r = refreshQueue(queue, moved, NOW, TODAY, hashFacts).queue;
    expect(readyCopy(r, movedC, hashFacts(movedC.facts))).toBeNull();
    expect(r.items.find((i) => i.id === queueItemId(c.subjectId, c.contentType))!.status).toBe("verified");
  });
});

describe("status transitions", () => {
  const candidates = candidatesFor([event()], TODAY);
  const c = pick(candidates, "event:federal_register:q-1", "breaking_change");
  const base = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts).queue;

  it("ready → published keeps the copy and records where it went", () => {
    let q = markReady(base, c, { x: "x", linkedin: "li", deepLink: c.facts.deepLink, structure: "direct", headline: "H" }, hashFacts(c.facts), NOW);
    q = markPublished(q, c, { platform: "x", externalUrl: "https://x.com/i/web/status/1" }, NOW);
    const item = q.items.find((i) => i.id === queueItemId(c.subjectId, c.contentType))!;
    expect(item.status).toBe("published");
    expect(item.externalUrl).toBe("https://x.com/i/web/status/1");
    expect(item.suggestedHeadline).toBe("H");
    expect(item.history.map((h) => h.status)).toEqual(["candidate", "verified", "ready", "published"]);
  });

  it("scheduled and rejected carry a reason", () => {
    const s = markScheduled(base, c, "afternoon", "morning is news-only", NOW);
    expect(s.items.find((i) => i.subjectId === c.subjectId && i.contentType === c.contentType)!.scheduledFor).toBe("afternoon");
    const r = markRejected(base, c, "validation: figure-ungrounded", NOW);
    const item = r.items.find((i) => i.subjectId === c.subjectId && i.contentType === c.contentType)!;
    expect(item.status).toBe("rejected");
    expect(item.history[item.history.length - 1].reason).toMatch(/figure-ungrounded/);
  });

  it("a published item is never touched by a later refresh", () => {
    let q = markReady(base, c, { x: "x", linkedin: "li", deepLink: c.facts.deepLink }, hashFacts(c.facts), NOW);
    q = markPublished(q, c, { platform: "x", externalUrl: null }, NOW);
    const r = refreshQueue(q, [], new Date("2026-09-30T14:05:00Z"), "2026-09-30", hashFacts).queue;
    expect(r.items.find((i) => i.id === queueItemId(c.subjectId, c.contentType))!.status).toBe("published");
  });
});

describe("serialisation", () => {
  it("round-trips and orders ready items first", () => {
    const candidates = candidatesFor([event()], TODAY);
    const c = pick(candidates, "event:federal_register:q-1", "breaking_change");
    let q = refreshQueue(EMPTY_QUEUE, candidates, NOW, TODAY, hashFacts).queue;
    q = markReady(q, c, { x: "x", linkedin: "li", deepLink: c.facts.deepLink }, hashFacts(c.facts), NOW);
    const text = serializeQueue(q);
    const parsed = parseQueue(text)!;
    expect(parsed.version).toBe(QUEUE_VERSION);
    expect(parsed.items[0].status).toBe("ready");
    expect(summarizeQueue(parsed).ready).toBe(1);
  });

  it("treats a missing file as empty and a corrupt one as unreadable", () => {
    expect(parseQueue(null)).toEqual(EMPTY_QUEUE);
    expect(parseQueue("")).toEqual(EMPTY_QUEUE);
    expect(parseQueue("{not json")).toBeNull();
    expect(parseQueue(JSON.stringify({ version: 99, items: [] }))).toBeNull();
    expect(parseQueue(JSON.stringify({ version: 1, items: [{ nope: true }] }))).toBeNull();
  });
});

describe("ogImageFor", () => {
  it("maps every kind of candidate to a card path", () => {
    const candidates = candidatesFor([event()], TODAY);
    const kinds = new Set<string>();
    for (const c of candidates) {
      const path = ogImageFor(c);
      expect(path).toMatch(/^\/og\/(change|explainer|signal|page)\/[A-Za-z0-9._\-]+\.png$/);
      kinds.add(path.split("/")[2]);
    }
    expect(kinds.has("change")).toBe(true);
    expect(kinds.has("explainer")).toBe(true);
    expect(kinds.has("signal")).toBe(true);
    expect(kinds.has("page")).toBe(true);
  });
});
