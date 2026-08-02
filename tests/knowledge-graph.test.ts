import { describe, it, expect } from "vitest";
import {
  entityId,
  parseEntityId,
  normalizeSlug,
  SEED_ENTITIES,
  ENTITY_BY_ID,
  ALIAS_INDEX,
  ENTITY_COVERAGE,
  ENTITY_TYPES,
} from "@/domains/graph/entities";
import {
  validateEvent,
  sortEvents,
  dedupeEvents,
  publishableEvents,
  primaryEventsForEntity,
  type ImmigrationEvent,
} from "@/domains/graph/events";
import {
  ADAPTERS,
  runnableAdapters,
  adapterCoverageSummary,
  adaptersByStatus,
} from "@/domains/graph/adapters";
import { resolveEntityMentions, isPubliclyAssertable, PUBLIC_CONFIDENCE_FLOOR } from "@/domains/graph/resolve";
import { __testing as FR } from "@/domains/graph/adapters/federal-register";
import { __testing as EA } from "@/domains/graph/adapters/executive-actions";
import { SOURCE_BY_KEY } from "@/lib/sources";

const TODAY = new Date().toISOString().slice(0, 10);

function makeEvent(over: Partial<ImmigrationEvent> = {}): ImmigrationEvent {
  return {
    id: "federal_register:2026-0001",
    sourceKey: "federal_register",
    classification: "final_rule",
    severity: "major",
    title: "Test rule",
    summary: "A summary.",
    publishedAt: "2026-07-01",
    lastVerifiedAt: "2026-07-01",
    sourceUrl: "https://www.federalregister.gov/documents/2026/07/01/2026-0001/test",
    entities: [],
    reviewStatus: "auto",
    ...over,
  };
}

// =============================================================================
// Entity identity. A stable, source-independent id is what stops the graph
// forking into one disconnected island per source.
// =============================================================================
describe("entity identity", () => {
  it("builds and parses stable ids", () => {
    const id = entityId("visa", "H-1B");
    expect(id).toBe("visa:h-1b");
    expect(parseEntityId(id)).toEqual({ type: "visa", slug: "h-1b" });
  });

  it("normalizes slugs idempotently", () => {
    const once = normalizeSlug("México & Central America");
    expect(once).toBe(normalizeSlug(once));
    expect(normalizeSlug("México")).toBe(normalizeSlug("Mexico"));
  });

  it("rejects malformed ids", () => {
    expect(parseEntityId("nocolon")).toBeNull();
    expect(parseEntityId("notatype:x")).toBeNull();
    expect(parseEntityId(":x")).toBeNull();
  });

  it("keeps every seed entity unique and well-formed", () => {
    const ids = SEED_ENTITIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SEED_ENTITIES) {
      expect(e.id).toBe(entityId(e.type, e.slug));
      expect(e.name.trim()).toBeTruthy();
    }
  });

  it("declares coverage honestly for every entity type", () => {
    for (const t of ENTITY_TYPES) {
      expect(ENTITY_COVERAGE, `${t} has no coverage status`).toHaveProperty(t);
    }
    // Types we declare but have not populated must say "planned", not imply data.
    expect(ENTITY_COVERAGE.court_case).toBe("planned");
    expect(ENTITY_COVERAGE.person).toBe("planned");
  });

  it("indexes aliases without collisions on short forms", () => {
    for (const alias of ALIAS_INDEX.keys()) {
      expect(alias.length).toBeGreaterThanOrEqual(3);
    }
    expect(ENTITY_BY_ID.get(ALIAS_INDEX.get("uscis")!)?.slug).toBe("uscis");
  });
});

// =============================================================================
// Entity resolution. A wrong edge is worse than a missing one.
// =============================================================================
describe("entity resolution", () => {
  it("resolves distinctive names", () => {
    const hits = resolveEntityMentions("USCIS announced changes to the H-1B specialty occupation program.");
    const ids = hits.map((h) => h.entityId);
    expect(ids).toContain("agency:uscis");
    expect(ids).toContain("visa:h-1b");
  });

  it("does not match inside unrelated words", () => {
    // "alienate" must not resolve anything; substring matching would be a
    // constant source of false edges in legal prose.
    const hits = resolveEntityMentions("The parties did not alienate the property.");
    expect(hits.map((h) => h.entityId)).not.toContain("agency:ice");
  });

  it("excludes ambiguous short aliases from text matching", () => {
    // "ice" appears in ordinary prose; matching it would attach unrelated
    // documents to the enforcement agency.
    const hits = resolveEntityMentions("Sea ice extent declined in the northern region.");
    expect(hits.map((h) => h.entityId)).not.toContain("agency:ice");
  });

  it("scores longer surface forms higher", () => {
    const long = resolveEntityMentions("Deferred Action for Childhood Arrivals")[0];
    expect(long.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps weak matches out of public assertions", () => {
    expect(isPubliclyAssertable(PUBLIC_CONFIDENCE_FLOOR)).toBe(true);
    expect(isPubliclyAssertable(PUBLIC_CONFIDENCE_FLOOR - 0.01)).toBe(false);
  });

  it("returns nothing for empty input", () => {
    expect(resolveEntityMentions("")).toEqual([]);
    expect(resolveEntityMentions("   ")).toEqual([]);
  });
});

// =============================================================================
// Event contract. These are the Directive's non-negotiables in executable form.
// =============================================================================
describe("event validation", () => {
  it("accepts a well-formed event", () => {
    expect(validateEvent(makeEvent())).toEqual([]);
  });

  it("requires a traceable absolute source URL", () => {
    expect(validateEvent(makeEvent({ sourceUrl: "/local" })).join()).toMatch(/sourceUrl/);
  });

  it("requires ISO dates", () => {
    expect(validateEvent(makeEvent({ publishedAt: "July 2026" })).join()).toMatch(/publishedAt/);
  });

  it("refuses a proposed rule that carries an effective date", () => {
    // A proposed rule is not in force. Giving it an effective date would tell a
    // reader something false about their obligations.
    const errs = validateEvent(makeEvent({ classification: "proposed_rule", effectiveAt: "2026-09-01" }));
    expect(errs.join()).toMatch(/must not carry an effectiveAt/);
  });

  it("refuses a future publication date unless declared scheduled", () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(validateEvent(makeEvent({ publishedAt: future })).join()).toMatch(/not marked scheduled/);
    expect(validateEvent(makeEvent({ publishedAt: future, scheduled: true }))).toEqual([]);
  });

  it("refuses a scheduled flag on an already-published event", () => {
    expect(validateEvent(makeEvent({ scheduled: true })).join()).toMatch(/publication date has passed/);
  });

  it("refuses an explicit link with less than full confidence", () => {
    const errs = validateEvent(
      makeEvent({ entities: [{ entityId: "agency:uscis", relation: "issued_by", basis: "explicit", confidence: 0.8 }] })
    );
    expect(errs.join()).toMatch(/explicit link must have confidence 1/);
  });
});

describe("event collections", () => {
  it("sorts newest first, major before routine on the same day", () => {
    const sorted = sortEvents([
      makeEvent({ id: "a:1", publishedAt: "2026-07-01", severity: "routine" }),
      makeEvent({ id: "a:2", publishedAt: "2026-07-01", severity: "major" }),
      makeEvent({ id: "a:3", publishedAt: "2026-07-05", severity: "routine" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a:3", "a:2", "a:1"]);
  });

  it("dedupes by id so overlapping adapters cannot double-publish", () => {
    expect(dedupeEvents([makeEvent(), makeEvent()])).toHaveLength(1);
  });

  it("never renders a draft publicly", () => {
    const events = [makeEvent({ id: "a:1", reviewStatus: "draft" }), makeEvent({ id: "a:2" })];
    expect(publishableEvents(events).map((e) => e.id)).toEqual(["a:2"]);
  });

  it("separates events that change an entity from those that merely mention it", () => {
    const affects = makeEvent({
      id: "a:1",
      entities: [{ entityId: "visa:h-1b", relation: "affects", basis: "explicit", confidence: 1 }],
    });
    const mentions = makeEvent({
      id: "a:2",
      entities: [{ entityId: "visa:h-1b", relation: "mentions", basis: "matched", confidence: 0.8 }],
    });
    const primary = primaryEventsForEntity([affects, mentions], "visa:h-1b");
    expect(primary.map((e) => e.id)).toEqual(["a:1"]);
  });
});

// =============================================================================
// Adapter registry. Every declared source must be honest about its status.
// =============================================================================
describe("adapter registry", () => {
  it("registers every source named in the long-term architecture", () => {
    const keys = ADAPTERS.map((a) => a.key);
    for (const required of [
      "federal-register",
      "executive-actions",
      "uscis-newsroom",
      "uscis-policy-manual",
      "visa-bulletin",
      "federal-courts",
      "congress",
      "warn",
      "uscis-h1b-datahub",
      "cbp-encounters",
      "dol-perm",
      "dol-lca",
      "ice-detention",
      "dos-visa-statistics",
      "state-agencies",
      "sevis",
    ]) {
      expect(keys, `adapter ${required} is not registered`).toContain(required);
    }
  });

  it("points every adapter at a real registry source", () => {
    for (const a of ADAPTERS) {
      expect(SOURCE_BY_KEY[a.sourceKey], `${a.key} references unknown source ${a.sourceKey}`).toBeDefined();
    }
  });

  it("keeps DOS policy coverage even though the DOS adapters are blocked", () => {
    // The State Department's own channels are unreachable to an identified
    // crawler (state.gov site-wide errors, travel.state.gov behind Cloudflare),
    // so DOS visa rules reach the platform ONLY through the Federal Register.
    // If this agency slug is ever dropped from the FR adapter, the platform
    // silently loses State Department policy entirely — with three adapters
    // marked "blocked" making it look intentional. This is the guard.
    expect(FR.__agencySlugs["state-department"]).toBe("agency:dos");
  });

  it("routes both DOS adapters and the Visa Bulletin at a real source", () => {
    for (const key of ["dos-announcements", "dos-visa-statistics", "visa-bulletin"]) {
      const a = ADAPTERS.find((x) => x.key === key);
      expect(a, `${key} is not registered`).toBeDefined();
      expect(SOURCE_BY_KEY[a!.sourceKey]).toBeDefined();
    }
  });

  it("gives every blocked adapter a specific, dated reason rather than a shrug", () => {
    // "No API" is not a reason a reader can evaluate. A blocked source has to
    // say what was actually observed and when, so the claim can be re-checked
    // and the block revisited when the obstacle clears.
    for (const a of adaptersByStatus("blocked")) {
      expect(a.blockedReason!.length, `${a.key}: reason is too thin to audit`).toBeGreaterThan(80);
      expect(
        /\b20\d\d-\d\d-\d\d\b/.test(a.blockedReason!) || /PDF|XLSX|spreadsheet/i.test(a.blockedReason!),
        `${a.key}: reason cites neither a verification date nor a concrete format obstacle`
      ).toBe(true);
    }
  });

  it("explains every blocked adapter rather than failing silently", () => {
    for (const a of ADAPTERS) {
      if (a.status === "blocked") {
        expect(a.blockedReason, `${a.key} is blocked with no reason`).toBeTruthy();
      }
      expect(a.coverage.length, `${a.key} has no coverage statement`).toBeGreaterThan(30);
    }
  });

  it("only reports an adapter as runnable when it can actually run", () => {
    for (const a of runnableAdapters()) {
      expect(typeof a.fetchEvents).toBe("function");
    }
  });

  it("summarises coverage without implying completeness", () => {
    const s = adapterCoverageSummary();
    expect(s).toMatch(/of \d+ government sources/);
    expect(s).toMatch(/not yet built|coverage gaps are visible/);
  });
});

// =============================================================================
// Federal Register classification and severity — the rules most likely to
// mislead a reader if they drift.
// =============================================================================
describe("federal register rules", () => {
  const doc = (over: Record<string, unknown> = {}) =>
    ({
      document_number: "2026-1",
      title: "Test",
      type: "Rule",
      publication_date: "2026-07-01",
      effective_on: "2026-08-01",
      html_url: "https://www.federalregister.gov/x",
      abstract: "abstract",
      agencies: [{ slug: "u-s-citizenship-and-immigration-services" }],
      ...over,
    }) as never;

  it("distinguishes a proposed rule from a final rule", () => {
    expect(FR.classify(doc({ type: "Proposed Rule" }))).toBe("proposed_rule");
    expect(FR.classify(doc({ type: "Rule" }))).toBe("final_rule");
    expect(FR.classify(doc({ type: "Presidential Document" }))).toBe("executive_action");
  });

  it("never gives a proposed rule an effective date", () => {
    const e = FR.toEvent(doc({ type: "Proposed Rule", effective_on: "2026-09-01" }), TODAY);
    expect(e.effectiveAt).toBeNull();
    expect(validateEvent(e)).toEqual([]);
    expect(e.limitations?.join(" ")).toMatch(/PROPOSED/);
  });

  it("ranks paperwork notices as routine, not policy change", () => {
    const paperwork = doc({
      type: "Notice",
      title: "Agency Information Collection Activities; Extension of a Currently Approved Collection",
    });
    expect(FR.severity(paperwork, FR.classify(paperwork))).toBe("routine");
  });

  it("ranks rules in force and executive actions as major", () => {
    expect(FR.severity(doc(), "final_rule")).toBe("major");
    expect(FR.severity(doc({ type: "Presidential Document" }), "executive_action")).toBe("major");
  });

  it("filters out non-immigration documents from tracked agencies", () => {
    expect(FR.isImmigrationRelevant(doc({ title: "Tariff Classification of Steel Fasteners", abstract: null }))).toBe(false);
    expect(FR.isImmigrationRelevant(doc({ title: "H-1B Cap Registration Process", abstract: null }))).toBe(true);
  });

  it("marks agency links explicit and text matches inferred", () => {
    const e = FR.toEvent(doc({ title: "H-1B specialty occupation update" }), TODAY);
    const issued = e.entities.find((l) => l.relation === "issued_by")!;
    expect(issued.basis).toBe("explicit");
    expect(issued.confidence).toBe(1);
    for (const l of e.entities.filter((x) => x.relation === "mentions")) {
      expect(l.basis).toBe("matched");
      expect(l.confidence).toBeLessThan(1);
    }
  });

  it("does not treat rulemaking-procedure documents as immigration at all", () => {
    // REGRESSION: bare "petition" in the relevance list matched an
    // Administrative Procedure Act notice about petitioning DOJ to change a
    // regulation. It had no immigration content, was ranked major, and led
    // /what-changed. The same word had already been removed from topicLink()
    // for the same reason; this filter kept it.
    expect(
      FR.isImmigrationRelevant(
        doc({
          title: "Procedures for Submission and Consideration of Petitions for Rulemaking",
          abstract:
            "Pursuant to the Administrative Procedure Act, the Department of Justice is adopting a process for considering petitions submitted by interested persons requesting that the Department issue, amend, or repeal a rule.",
        })
      )
    ).toBe(false);
  });

  it("still keeps genuine immigration petition documents", () => {
    // The narrowing must not cost real coverage.
    for (const title of [
      "Petition for Alien Relative; Revision of Form I-130",
      "Immigrant Petition for Alien Workers",
      "Nonimmigrant Petition Based on Blanket L Petition",
    ]) {
      expect(FR.isImmigrationRelevant(doc({ title, abstract: null })), title).toBe(true);
    }
  });

  it("does not categorise rulemaking-procedure documents as employer sponsorship", () => {
    // Regression: "petition" alone matched "Petitions for Rulemaking".
    const link = FR.topicLink(doc({ title: "Procedures for Submission and Consideration of Petitions for Rulemaking", abstract: null }));
    expect(link?.entityId).not.toBe("topic:employers");
  });

  it("produces a deterministic id for the same document", () => {
    expect(FR.toEvent(doc(), TODAY).id).toBe(FR.toEvent(doc(), TODAY).id);
  });

  it("never invents a summary when the source published none", () => {
    const e = FR.toEvent(doc({ abstract: null }), TODAY);
    expect(e.summary).toMatch(/No abstract was published/);
    expect(e.limitations?.join(" ")).toMatch(/no abstract/i);
  });

  it("emits no LLM-generated prose", () => {
    // Everything is copied from the document or derived by a rule in the file,
    // so events need no human gate. Anything generated would be "draft".
    expect(FR.toEvent(doc(), TODAY).reviewStatus).toBe("auto");
  });
});

// =============================================================================
// Executive actions. Presidential documents need their own rules: they are
// dated by signing, ranked above agency notices, and cover a much wider policy
// surface than immigration.
// =============================================================================
describe("executive actions adapter", () => {
  const doc = (over: Record<string, unknown> = {}) =>
    ({
      document_number: "2026-9",
      title: "Ensuring Citizenship Verification",
      subtype: "Executive Order",
      executive_order_number: 14399,
      publication_date: "2026-04-02",
      signing_date: "2026-03-31",
      abstract: null,
      html_url: "https://www.federalregister.gov/x",
      ...over,
    }) as never;

  it("ranks orders and proclamations above memoranda", () => {
    expect(EA.severity(doc({ subtype: "Executive Order" }))).toBe("major");
    expect(EA.severity(doc({ subtype: "Proclamation" }))).toBe("major");
    expect(EA.severity(doc({ subtype: "Memorandum" }))).toBe("notable");
    expect(EA.severity(doc({ subtype: "Determination" }))).toBe("notable");
  });

  it("dates a presidential action by when it was signed", () => {
    // The signing date is when the action was taken and what a reader will see
    // quoted elsewhere; publication can be days later.
    const e = EA.toEvent(doc(), "2026-08-01", null);
    expect(e.publishedAt).toBe("2026-03-31");
    expect(e.limitations?.join(" ")).toMatch(/Signed 2026-03-31 and published 2026-04-02/);
  });

  it("puts the Executive Order number in the title", () => {
    expect(EA.toEvent(doc(), "2026-08-01", null).title).toMatch(/^Executive Order 14399:/);
  });

  it("creates a stable node for the order itself", () => {
    expect(EA.actionSlug(doc())).toBe("executive-order-14399");
    expect(EA.actionSlug(doc({ executive_order_number: null }))).toBe("presidential-document-2026-9");
  });

  it("excludes foreign-policy documents that are not about immigration", () => {
    // REGRESSION: bare "detention" matched presidential documents about the
    // wrongful detention of Americans abroad, which are not immigration.
    expect(
      EA.isImmigrationRelevant(
        doc({ title: "Continuation of the National Emergency With Respect to Hostage-Taking and Wrongful Detention", abstract: null })
      )
    ).toBe(false);
    expect(EA.isImmigrationRelevant(doc({ title: "Suspension of Entry of Certain Nonimmigrants", abstract: null }))).toBe(true);
  });

  it("always notes that implementation comes through separate agency guidance", () => {
    expect(EA.toEvent(doc(), "2026-08-01", null).limitations?.[0]).toMatch(/agency guidance that implements it/);
  });

  it("produces events that pass validation", () => {
    expect(validateEvent(EA.toEvent(doc(), "2026-08-01", null))).toEqual([]);
  });
});
