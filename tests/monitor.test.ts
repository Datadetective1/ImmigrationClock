// =============================================================================
// THE PROFESSIONAL INTELLIGENCE LAYER — the inbox, the brief, the endpoint
//
// This is the surface a firm would put in front of a working immigration team,
// so the tests are about the promises it makes rather than its plumbing:
//
//   1. IT IS WORKFLOW INTELLIGENCE, NOT ADVICE. Every generated sentence is
//      conditional and addressed to a process. Nothing tells a person what to
//      do about their own immigration situation.
//   2. EVERY ITEM CARRIES ITS OWN CASE. Evidence quote, method, effective date,
//      source, limitations, review status — on the item, not a click away.
//   3. A WEAK MATCH IS NEVER "NEEDS ATTENTION". The bucket a professional acts
//      on first must never contain something matched by a footnote.
//   4. NOTHING IS INVENTED. A record with no classifications says so.
// =============================================================================

import { describe, it, expect } from "vitest";
import { GET as getMonitor } from "@/app/api/v1/monitor/route";
import { EVENTS } from "@/lib/event-store";
import { amendmentIndex, toPublicChange, type ChangeInput } from "@/lib/intelligence/change";
import { buildBrief } from "@/lib/intelligence/brief";
import { buildInbox, matchFollows, INBOX_BUCKETS } from "@/lib/intelligence/inbox";

const ALL = EVENTS as unknown as ChangeInput[];
const TODAY = "2026-09-04";
const AMENDED = amendmentIndex(ALL);

const inputs = ALL.map((e) => {
  const amendedBy = AMENDED.get(e.id) ?? [];
  return {
    strong: toPublicChange(e, TODAY, amendedBy),
    weak: toPublicChange(e, TODAY, amendedBy, true),
  };
});

async function monitor(query: string) {
  const res = await getMonitor(new Request(`https://x/api/v1/monitor${query}`));
  return { status: res.status, body: await res.json() };
}

// -----------------------------------------------------------------------------
// WORKFLOW INTELLIGENCE, NOT ADVICE
// -----------------------------------------------------------------------------

describe("the brief never tells a person what to do", () => {
  const briefs = inputs.map((i) => buildBrief(i.strong));

  it("addresses a process, never a reader", () => {
    for (const b of briefs) {
      const generated = `${b.potentialRelevance ?? ""} ${b.suggestedProfessionalAction}`.toLowerCase();
      for (const forbidden of [
        "you should",
        "you must",
        "you need to",
        "your case",
        "your petition",
        "your status",
        "you are eligible",
        "you may be eligible",
        "we recommend",
        "apply now",
      ]) {
        expect(generated, `${b.id}: "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("keeps every generated relevance line conditional", () => {
    for (const b of briefs) {
      if (!b.potentialRelevance) continue;
      expect(b.potentialRelevance, b.id).toMatch(/may want to review/i);
      // Never a claim that the change DOES affect a named party.
      expect(b.potentialRelevance, b.id).not.toMatch(/\bwill affect\b|\baffects you\b|\bmust now\b/i);
    }
  });

  it("always points back to the official source", () => {
    for (const b of briefs) {
      expect(b.suggestedProfessionalAction, b.id).toMatch(/verify against the official source/i);
      expect(b.source.url, b.id).toMatch(/^https?:\/\//);
    }
  });

  it("says plainly when a record carries no classification", () => {
    const bare = briefs.find((b) => b.affectedDimensions.length === 0);
    expect(bare, "some record carries no classification").toBeTruthy();
    expect(bare!.potentialRelevance).toBeNull();
    expect(bare!.limitations.join(" ")).toMatch(/did not name one in its own words/i);
  });

  it("says when nobody has reviewed the record", () => {
    // Every record is still auto, and a professional deciding whether to act on
    // one deserves to know that before they do.
    const anyAuto = briefs.find((b) => b.reviewStatus === "auto");
    expect(anyAuto!.limitations.join(" ")).toMatch(/No person has reviewed/i);
  });

  it("carries a quote for every dimension it claims", () => {
    for (const b of briefs) {
      const claimed = b.affectedDimensions.length;
      if (claimed === 0) continue;
      expect(b.evidence.length, b.id).toBeGreaterThanOrEqual(claimed);
      for (const e of b.evidence) {
        expect(e.quote.length, `${b.id} ${e.value}`).toBeGreaterThan(3);
        expect(e.method, `${b.id} ${e.value}`).toBeTruthy();
      }
    }
  });
});

// -----------------------------------------------------------------------------
// THE BUCKETS
// -----------------------------------------------------------------------------

describe("the inbox sorts by how soon someone has to care", () => {
  const followed = ["visa:h-1b", "form:i-129", "process:cap-registration"];
  const inbox = buildInbox(inputs, { follows: followed, today: TODAY });

  it("puts something in needs attention for a real watchlist", () => {
    expect(inbox.counts.needs_attention).toBeGreaterThan(0);
  });

  it("never puts a weak match in needs attention", () => {
    // The bucket a professional acts on first must not contain a match made
    // from a citation. That is the whole failure this product was built to
    // avoid, expressed as a bucket rule.
    for (const item of inbox.items) {
      if (item.bucket !== "needs_attention") continue;
      const strongIds = new Set(matchFollows(item.change, followed));
      for (const m of item.matched) {
        expect(strongIds.has(m), `${item.change.recordId} matched ${m} weakly`).toBe(true);
      }
    }
  });

  it("explains every placement in a sentence a reader can check", () => {
    for (const item of inbox.items) {
      expect(item.because.length, item.change.recordId).toBeGreaterThan(10);
      if (item.bucket === "needs_attention") {
        expect(item.because, item.change.recordId).toMatch(/Matches /);
      }
      if (item.bucket === "effective_soon") {
        expect(item.because, item.change.recordId).toMatch(/Takes effect in \d+ day/);
      }
    }
  });

  it("puts a record in exactly one bucket", () => {
    const seen = new Map<string, string>();
    for (const item of inbox.items) {
      expect(seen.has(item.change.recordId), `${item.change.recordId} appears twice`).toBe(false);
      seen.set(item.change.recordId, item.bucket);
    }
  });

  it("orders each bucket by the soonest effective date", () => {
    for (const b of inbox.buckets) {
      const dated = b.items.filter((i) => i.daysUntilEffective !== null);
      for (let i = 1; i < dated.length; i++) {
        expect(
          dated[i].daysUntilEffective! >= dated[i - 1].daysUntilEffective!,
          `${b.bucket} out of order`
        ).toBe(true);
      }
    }
  });

  it("is a filter, not the archive", () => {
    // An inbox that returns everything is a feed with extra words.
    expect(inbox.items.length).toBeLessThan(ALL.length / 2);
  });

  it("still shows what is coming up for a reader who follows nothing", () => {
    const empty = buildInbox(inputs, { follows: [], today: TODAY });
    expect(empty.counts.needs_attention).toBe(0);
    expect(empty.items.length).toBeGreaterThan(0);
  });

  it("prints what it cannot tell you, every time", () => {
    expect(inbox.limitations.join(" ")).toMatch(/not a complete picture/i);
    expect(inbox.limitations.join(" ")).toMatch(/never that nothing happened/i);
    expect(inbox.limitations.join(" ")).toMatch(/not legal advice/i);
  });

  it("respects the horizon it was given", () => {
    const narrow = buildInbox(inputs, { follows: followed, today: TODAY, horizonDays: 3 });
    const wide = buildInbox(inputs, { follows: followed, today: TODAY, horizonDays: 120 });
    expect(wide.counts.effective_soon + wide.counts.needs_attention).toBeGreaterThanOrEqual(
      narrow.counts.effective_soon + narrow.counts.needs_attention
    );
  });
});

// -----------------------------------------------------------------------------
// THE ENDPOINT
// -----------------------------------------------------------------------------

describe("GET /api/v1/monitor", () => {
  it("returns a bucketed inbox for a watchlist in the query string", async () => {
    const { status, body } = await monitor("?follow=visa:h-1b&follow=form:i-129");
    expect(status).toBe(200);
    expect(body.data.follows).toEqual(["visa:h-1b", "form:i-129"]);
    expect(body.data.items.length).toBeGreaterThan(0);
    for (const b of body.data.buckets) expect(INBOX_BUCKETS).toContain(b.bucket);
  });

  it("accepts a comma-separated watchlist too", async () => {
    const { body } = await monitor("?follows=visa:h-1b,country:india");
    expect(body.data.follows).toEqual(["visa:h-1b", "country:india"]);
  });

  it("refuses a follow that is not a followable id", async () => {
    const { status, body } = await monitor("?follow=nonsense");
    expect(status).toBe(400);
    expect(body.parameter).toBe("follow");
    expect(body.message).toMatch(/visa:h-1b/);
  });

  it.each([
    ["?horizonDays=0", "horizonDays"],
    ["?horizonDays=400", "horizonDays"],
    ["?recentDays=abc", "recentDays"],
    ["?bucket=inbox_zero", "bucket"],
    ["?limit=0", "limit"],
  ])("refuses %s", async (query, parameter) => {
    const { status, body } = await monitor(query);
    expect(status).toBe(400);
    expect(body.parameter).toBe(parameter);
  });

  it("says it does not push, and why", async () => {
    const { body } = await monitor("?follow=visa:h-1b");
    expect(body.readiness.mode).toBe("pull");
    expect(body.readiness.push).toMatch(/not offered/i);
    expect(body.readiness.push).toMatch(/recall/i);
  });

  it("carries the limitations and the attribution", async () => {
    const { body } = await monitor("?follow=visa:h-1b");
    expect(body.limitations.join(" ")).toMatch(/not legal advice/i);
    expect(body.attribution.notLegalAdvice).toMatch(/not legal advice/i);
  });

  it("holds no watchlist of its own", async () => {
    // Two different watchlists in the same process must not bleed into one
    // another, because nothing about a firm's watchlist is stored here.
    const a = await monitor("?follow=visa:h-1b");
    const b = await monitor("?follow=country:india");
    expect(a.body.data.follows).toEqual(["visa:h-1b"]);
    expect(b.body.data.follows).toEqual(["country:india"]);
  });

  it("returns no personal data, because it holds none", async () => {
    const { body } = await monitor("?follow=visa:h-1b&limit=20");
    const json = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["email", "customer_", "cus_", "@gmail", "receipt number"]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
  });

  it("filters to one bucket when asked", async () => {
    const { body } = await monitor("?follow=visa:h-1b&bucket=effective_soon");
    for (const i of body.data.items) expect(i.bucket).toBe("effective_soon");
  });
});
