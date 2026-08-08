// =============================================================================
// USCIS POLICY MANUAL ADAPTER
//
// This adapter scrapes HTML, which means its tests carry more weight than a
// JSON adapter's: there is no schema to catch a layout change, only these.
//
// The fixtures below are trimmed from the real page as fetched on 2026-08-01.
// Keeping them verbatim rather than idealised is the point — a hand-written
// fixture would test a page USCIS does not serve.
// =============================================================================
import { describe, it, expect } from "vitest";
import { __testing as PM } from "@/domains/graph/adapters/uscis-policy-manual";
import { validateEvent } from "@/domains/graph/events";

const TODAY = new Date().toISOString().slice(0, 10);

// Verbatim structure from https://www.uscis.gov/policy-manual/updates
const POLICY_ALERT_ROW = `<div class="views-row first"> <div class="pm-updates"> <div class="pm-resource__header"> <div class="pm-resource__update_header">POLICY ALERT - Attorneys and Representatives</div> <div><br><time datetime="2026-07-13T12:00:00Z" class="datetime">July 13, 2026</time> </div> </div> <div class="pm-resource__content"> <div class="clearfix text-formatted field field--name-body field__item"><p>U.S. Citizenship and Immigration Services (USCIS) is issuing policy guidance in the USCIS Policy Manual regarding attorneys and representatives.</p></div> <a href="https://www.uscis.gov/sites/default/files/document/policy-manual-updates/20260713-AttorneysAndRepresentatives.pdf" class="btn btn--anchor" title="Select to read more">Read More</a> </div> <div class="pm-resource__associated_pages"> <div class="pm-resource__associated_page__heading">Affected Sections</div><p class="affected-sections"><a href="/policy-manual/volume-1-part-d-chapter-1"><span class="citation">1 USCIS-PM D.1</span> - <span>Chapter 1 - Purpose and Background</span></a></p><p class="affected-sections"><a href="/policy-manual/volume-1-part-d-chapter-2"><span class="citation">1 USCIS-PM D.2</span> - <span>Chapter 2 - Representation</span></a></p> </div> </div>`;

const TECHNICAL_UPDATE_ROW = `<div class="views-row"> <div class="pm-updates"> <div class="pm-resource__header"> <div class="pm-resource__update_header">Technical Update - 2024 U.S. Department of State Exchange Visitors Skills List</div> <div><br><time datetime="2026-02-03T12:00:00Z" class="datetime">February 03, 2026</time> </div> </div> <div class="pm-resource__content"> <div class="clearfix text-formatted field field--name-body field__item"><p>This technical update to Volume 2 updates two footnotes. This list was last revised on December 9, 2024, and became effective as of that date.</p></div> </div> <div class="pm-resource__associated_pages"> <div class="pm-resource__associated_page__heading">Affected Sections</div><p class="affected-sections"><a href="/policy-manual/volume-2-part-d-chapter-3"><span class="citation">2 USCIS-PM D.3</span> - <span>Chapter 3 - Terms and Conditions</span></a></p> </div> </div>`;

const PAGE = `<html><body><div class="view-content">${POLICY_ALERT_ROW}${TECHNICAL_UPDATE_ROW}</div></body></html>`;

const alert = () => PM.parseRow(PM.splitRows(POLICY_ALERT_ROW)[0])!;
const technical = () => PM.parseRow(PM.splitRows(TECHNICAL_UPDATE_ROW)[0])!;

describe("page parsing", () => {
  it("splits the page into one block per update", () => {
    expect(PM.splitRows(PAGE)).toHaveLength(2);
  });

  it("parses both update kinds from a full page", () => {
    const updates = PM.parseUpdatesPage(PAGE);
    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.kind)).toEqual(["policy_alert", "technical_update"]);
  });

  it("reads USCIS's own label rather than inferring the kind from prose", () => {
    expect(alert().kind).toBe("policy_alert");
    expect(technical().kind).toBe("technical_update");
  });

  it("strips the kind prefix from the title", () => {
    expect(alert().title).toBe("Attorneys and Representatives");
    expect(technical().title).toBe("2024 U.S. Department of State Exchange Visitors Skills List");
  });

  it("takes the date from the machine-readable time attribute", () => {
    // The visible text says "July 13, 2026"; the attribute is authoritative and
    // needs no natural-language date parsing.
    expect(alert().publishedAt).toBe("2026-07-13");
    expect(technical().publishedAt).toBe("2026-02-03");
  });

  it("extracts the body as clean text with no markup", () => {
    expect(alert().body).toMatch(/^U\.S\. Citizenship and Immigration Services/);
    expect(alert().body).not.toMatch(/[<>]/);
  });

  it("links a policy alert to its signed PDF", () => {
    expect(alert().pdfUrl).toBe(
      "https://www.uscis.gov/sites/default/files/document/policy-manual-updates/20260713-AttorneysAndRepresentatives.pdf"
    );
  });

  it("records that a technical update has no PDF rather than inventing a link", () => {
    expect(technical().pdfUrl).toBeNull();
  });

  it("rejects a row with no recognised kind label", () => {
    const row = POLICY_ALERT_ROW.replace("POLICY ALERT - Attorneys", "Something Else Entirely");
    expect(PM.parseRow(PM.splitRows(row)[0])).toBeNull();
  });

  it("returns null for a date it cannot parse instead of guessing", () => {
    expect(PM.parseRowDate('<time datetime="not-a-date">x</time>')).toBeNull();
    expect(PM.parseRowDate("<div>no time element</div>")).toBeNull();
  });

  it("rejects dates outside the Policy Manual's plausible range", () => {
    expect(PM.parseRowDate('<time datetime="1998-01-01T12:00:00Z">x</time>')).toBeNull();
    expect(PM.parseRowDate('<time datetime="2199-01-01T12:00:00Z">x</time>')).toBeNull();
  });
});

// =============================================================================
// Affected sections — the agency's own statement of what it changed, and the
// strongest evidence this source provides.
// =============================================================================
describe("affected sections", () => {
  it("captures every cited section with its citation, title, and URL", () => {
    const s = alert().affectedSections;
    expect(s).toHaveLength(2);
    expect(s[0].citation).toBe("1 USCIS-PM D.1");
    expect(s[0].title).toBe("Chapter 1 - Purpose and Background");
    expect(s[0].url).toBe("https://www.uscis.gov/policy-manual/volume-1-part-d-chapter-1");
  });

  it("makes relative section URLs absolute so every citation is followable", () => {
    for (const s of alert().affectedSections) {
      expect(s.url).toMatch(/^https:\/\/www\.uscis\.gov\//);
    }
  });

  it("parses the volume number from a formal citation", () => {
    expect(PM.parseVolume("1 USCIS-PM D.1")).toBe(1);
    expect(PM.parseVolume("12 USCIS-PM B.2")).toBe(12);
  });

  it("returns null for a citation it does not recognise", () => {
    // A volume outside the published 1–12 structure means the citation format
    // changed. Null keeps it out of the graph rather than inventing a node.
    expect(PM.parseVolume("99 USCIS-PM A.1")).toBeNull();
    expect(PM.parseVolume("not a citation")).toBeNull();
    expect(PM.parseVolume("")).toBeNull();
  });

  it("names every volume in the published structure", () => {
    for (let v = 1; v <= 12; v++) {
      expect(PM.VOLUME_SUBJECTS[v]?.name, `volume ${v} is unnamed`).toBeTruthy();
    }
  });
});

// =============================================================================
// Classification and severity.
// =============================================================================
describe("classification and severity", () => {
  it("treats Policy Manual guidance as updated information, never as a rule", () => {
    // The Policy Manual is guidance to officers, not regulation. Classifying it
    // as `final_rule` would misdescribe its legal character to a reader.
    expect(PM.classify(alert())).toBe("updated_information");
    expect(PM.classify(alert())).not.toBe("final_rule");
  });

  it("classifies a self-described correction as a correction", () => {
    const u = { ...technical(), body: "This technical update corrects a citation." };
    expect(PM.classify(u)).toBe("correction");
  });

  it("does not call a policy alert a correction just because it says 'correct'", () => {
    const u = { ...alert(), body: "Guidance on how to correctly file." };
    expect(PM.classify(u)).toBe("updated_information");
  });

  it("takes substantive-vs-not from the publisher, but Major from the impact", () => {
    // The publisher's label still decides whether this is substantive at all:
    // a technical update is routine, full stop, because USCIS says so.
    expect(PM.severity(technical())).toBe("routine");

    // But "policy alert" is a publishing category, not a measure of
    // consequence. Treating it as one meant every alert USCIS issued carried
    // the same badge as the termination of Temporary Protected Status, and a
    // six-story issue in which every story is Major tells a reader nothing.
    const consequential = { ...alert(), body: "USCIS is revising eligibility requirements for this benefit." };
    expect(PM.severity(consequential)).toBe("major");

    // Substantive but narrow: notable, not major, and never routine.
    const narrow = { ...alert(), body: "Removes references to a list no longer published by the Department of State." };
    expect(PM.severity(narrow)).toBe("notable");
  });

  it("keeps a technical update out of the 'what changed' feed", () => {
    // USCIS declares these non-substantive. They belong in the archive and on
    // entity pages, but leading a change feed with one would manufacture
    // importance the publisher explicitly disclaimed.
    expect(PM.severity(technical())).toBe("routine");
  });
});

// =============================================================================
// Event construction.
// =============================================================================
describe("event construction", () => {
  it("produces events that pass validation", () => {
    expect(validateEvent(PM.toEvent(alert(), TODAY))).toEqual([]);
    expect(validateEvent(PM.toEvent(technical(), TODAY))).toEqual([]);
  });

  it("derives a policy alert's id from the date-stamped PDF filename", () => {
    expect(PM.stableId(alert())).toBe("uscis_policy_manual:20260713-attorneysandrepresentatives");
  });

  it("derives a technical update's id from its date and title", () => {
    expect(PM.stableId(technical())).toMatch(/^uscis_policy_manual:2026-02-03-2024-u-s-department/);
  });

  it("produces the same id on every run so the feed does not re-announce", () => {
    expect(PM.stableId(alert())).toBe(PM.stableId(alert()));
    expect(PM.stableId(technical())).toBe(PM.stableId(technical()));
  });

  it("gives two different updates two different ids", () => {
    expect(PM.stableId(alert())).not.toBe(PM.stableId(technical()));
  });

  it("never asserts an effective date", () => {
    // REGRESSION GUARD. The technical-update fixture contains "became effective
    // as of that date" — referring to a State Department list, not to USCIS
    // guidance. Any regex hunting for an effective date would attach December 9,
    // 2024 to this event and tell a reader their obligations began then.
    expect(PM.toEvent(technical(), TODAY).effectiveAt).toBeNull();
    expect(PM.toEvent(alert(), TODAY).effectiveAt).toBeNull();
  });

  it("explains where the effective date actually lives", () => {
    expect(PM.toEvent(alert(), TODAY).limitations?.join(" ")).toMatch(
      /does not publish an effective date/i
    );
  });

  it("links affected sections explicitly, because USCIS stated them", () => {
    const e = PM.toEvent(alert(), TODAY);
    const amends = e.entities.filter((l) => l.relation === "amends");
    expect(amends.length).toBeGreaterThan(0);
    for (const l of amends) {
      expect(l.basis).toBe("explicit");
      expect(l.confidence).toBe(1);
      expect(l.entityId).toMatch(/^policy:uscis-pm-volume-\d+/);
    }
  });

  it("collapses several chapters in one part into a single node", () => {
    // The fixture cites D.1 and D.2 — two chapters of the same volume and part.
    // One node per part keeps the graph navigable instead of minting a node per
    // chapter that nothing else will ever link to.
    const e = PM.toEvent(alert(), TODAY);
    const policyNodes = e.entities.filter((l) => l.entityId.startsWith("policy:"));
    expect(policyNodes).toHaveLength(1);
    expect(policyNodes[0].entityId).toBe("policy:uscis-pm-volume-1-part-d");
  });

  it("marks the issuing agency explicit and any text match inferred", () => {
    const e = PM.toEvent(alert(), TODAY);
    const issued = e.entities.find((l) => l.relation === "issued_by")!;
    expect(issued.entityId).toBe("agency:uscis");
    expect(issued.basis).toBe("explicit");
    for (const l of e.entities.filter((x) => x.relation === "mentions")) {
      expect(l.basis).toBe("matched");
      expect(l.confidence).toBeLessThan(1);
    }
  });

  it("never links the same entity twice", () => {
    const e = PM.toEvent(alert(), TODAY);
    expect(new Set(e.entities.map((l) => l.entityId)).size).toBe(e.entities.length);
  });

  it("cites the signed PDF for a policy alert", () => {
    expect(PM.toEvent(alert(), TODAY).sourceUrl).toMatch(/\/policy-manual-updates\/.*\.pdf$/);
  });

  it("falls back to the updates index for a technical update, and says so", () => {
    const e = PM.toEvent(technical(), TODAY);
    expect(e.sourceUrl).toBe("https://www.uscis.gov/policy-manual/updates");
    expect(e.limitations?.join(" ")).toMatch(/does not give this update its own page/i);
  });

  it("distinguishes guidance from regulation in the limitations", () => {
    // The single most load-bearing caveat this source carries: the Policy Manual
    // binds USCIS officers, but it is not law and did not go through rulemaking.
    expect(PM.toEvent(alert(), TODAY).limitations?.[0]).toMatch(/not a regulation/i);
    expect(PM.toEvent(technical(), TODAY).limitations?.[0]).toMatch(/non-substantive/i);
  });

  it("lists the affected sections and names their volume", () => {
    const l = PM.toEvent(alert(), TODAY).limitations?.join(" ") ?? "";
    expect(l).toMatch(/1 USCIS-PM D\.1/);
    expect(l).toMatch(/General Policies and Procedures/);
  });

  it("labels the event with the kind USCIS assigned", () => {
    expect(PM.toEvent(alert(), TODAY).title).toMatch(/^Policy alert: /);
    expect(PM.toEvent(technical(), TODAY).title).toMatch(/^Technical update: /);
  });

  it("copies the summary from USCIS rather than authoring one", () => {
    expect(PM.toEvent(alert(), TODAY).summary).toBe(alert().body);
  });

  it("says so plainly when USCIS published no summary", () => {
    const e = PM.toEvent({ ...alert(), body: null }, TODAY);
    expect(e.summary).toMatch(/published no summary/i);
    expect(e.limitations?.join(" ")).toMatch(/no summary text/i);
  });

  it("emits no generated prose, so it needs no human review gate", () => {
    expect(PM.toEvent(alert(), TODAY).reviewStatus).toBe("auto");
  });
});
