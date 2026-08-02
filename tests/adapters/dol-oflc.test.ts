// =============================================================================
// DOL / OFLC ANNOUNCEMENTS ADAPTER
//
// Two things decide whether this adapter is honest:
//
//   1. THE DATE. The page shows "June 30, 2026" as display text and links to
//      /announcement/2026-06-30. The path is machine-generated and the prose is
//      not, so the path wins — and when they disagree we have two conflicting
//      claims about when something happened, with no basis to prefer either.
//
//   2. RELEASE NOTES ARE NOT POLICY. Most of what OFLC posts is filing-software
//      release notes. Ranking those as change would fill a policy feed with
//      software changelogs.
//
// The fixtures are trimmed verbatim from the live page as fetched 2026-08-02.
// =============================================================================
import { describe, it, expect } from "vitest";
import { __testing as DOL } from "@/domains/graph/adapters/dol-oflc";
import { validateEvent } from "@/domains/graph/events";

const TODAY = new Date().toISOString().slice(0, 10);

const row = (over: { date?: string; href?: string; title?: string; body?: string } = {}) =>
  `<div class="announcement-wrapper views-row"><div class="announcement-list-item"> ` +
  `<div class='announcement-list-date'>${over.date ?? "June 30, 2026"}</div> ` +
  `<div class="announcement-list-title"> <a href="${over.href ?? "/announcement/2026-06-30"}" hreflang="en">` +
  `${over.title ?? "Foreign Labor Application Gateway (FLAG) Online Filing Release Notes 6/30/2026"}</a> </div> ` +
  `<div class="announcement-list-body"> ${over.body ?? "<ul><li>PW filers can now respond to multiple RFIs on a single case.</li></ul>"} </div> ` +
  `</div></div>`;

const parse = (over = {}) => DOL.parseRow(DOL.splitRows(row(over))[0])!;

describe("dates", () => {
  it("takes the date from the machine-generated URL path", () => {
    expect(DOL.parsePathDate("/announcement/2026-06-30")).toBe("2026-06-30");
    expect(parse().publishedAt).toBe("2026-06-30");
  });

  it("parses the displayed date as a cross-check", () => {
    expect(DOL.parseDisplayDate("June 30, 2026")).toBe("2026-06-30");
    expect(DOL.parseDisplayDate("February 03, 2025")).toBe("2025-02-03");
  });

  it("skips an announcement when the URL and the displayed date disagree", () => {
    // Two conflicting claims about when this happened, and no basis to prefer
    // one. Dating it by a coin flip would put a real document on the wrong day.
    const conflicted = parse({ href: "/announcement/2026-06-30", date: "January 5, 2020" });
    expect(conflicted.publishedAt).toBeNull();
  });

  it("returns null for dates it cannot parse rather than guessing", () => {
    expect(DOL.parseDisplayDate("sometime in June")).toBeNull();
    expect(DOL.parseDisplayDate("Jubtember 3, 2026")).toBeNull();
    expect(DOL.parseDisplayDate(null)).toBeNull();
    expect(DOL.parsePathDate("/announcement/not-a-date")).toBeNull();
  });

  it("falls back to the displayed date when the path carries none", () => {
    const a = parse({ href: "/announcement/general-notice", date: "March 12, 2026" });
    expect(a.publishedAt).toBe("2026-03-12");
  });
});

describe("parsing", () => {
  it("extracts title, body, and an absolute URL", () => {
    const a = parse();
    expect(a.title).toMatch(/^Foreign Labor Application Gateway/);
    expect(a.body).toMatch(/PW filers can now respond/);
    expect(a.url).toBe("https://flag.dol.gov/announcement/2026-06-30");
  });

  it("strips list markup out of the body", () => {
    expect(parse().body).not.toMatch(/[<>]/);
  });

  it("splits a page into one block per announcement", () => {
    expect(DOL.splitRows(row() + row({ href: "/announcement/2026-03-12" }))).toHaveLength(2);
  });

  it("rejects a row with no linked title", () => {
    expect(DOL.parseRow('<div class="announcement-list-item">no link here</div>')).toBeNull();
  });
});

describe("release notes are not policy", () => {
  const SYSTEM_NOTES = [
    "Foreign Labor Application Gateway (FLAG) Online Filing Release Notes 6/30/2026",
    "Permanent Employment Certification (PERM) Online Filing Release Notes 02/03/2025",
    "OFLC Issues Technical Release Notes for an Update to Registration Number Linking Ability",
  ];

  it.each(SYSTEM_NOTES)("ranks filing-software release notes as routine: %s", (title) => {
    const a = parse({ title });
    expect(DOL.isSystemNote(a)).toBe(true);
    expect(DOL.severity(a, DOL.classify(a))).toBe("routine");
  });

  it("ranks outreach as routine", () => {
    const a = parse({ title: "OFLC Announces Webinar on March 25, 2026, to Provide Technical Assistance" });
    expect(DOL.severity(a, DOL.classify(a))).toBe("routine");
  });

  it("ranks program guidance as notable", () => {
    const a = parse({
      title: "The Department of Labor Announces Additional Guidance for the H-2A Program in Washington",
      body: "The guidance addresses prevailing wage determinations.",
    });
    expect(DOL.isSystemNote(a)).toBe(false);
    expect(DOL.severity(a, DOL.classify(a))).toBe("notable");
  });

  it("ranks a filing deadline as major", () => {
    const a = parse({ title: "H-2B Filing Window Opens for Second Half of Fiscal Year", body: "" });
    expect(DOL.severity(a, DOL.classify(a))).toBe("major");
  });

  it("marks a release note as updated information rather than an announcement", () => {
    expect(DOL.classify(parse())).toBe("updated_information");
  });

  it("falls back to `announcement` rather than guessing at something stronger", () => {
    expect(DOL.classify(parse({ title: "OFLC Posts an Update for Stakeholders", body: "" }))).toBe("announcement");
  });
});

describe("event construction", () => {
  const event = (over = {}) => DOL.toEvent(parse(over), TODAY);

  it("produces events that pass validation", () => {
    expect(validateEvent(event())).toEqual([]);
  });

  it("produces a deterministic id from the announcement URL", () => {
    expect(DOL.stableId(parse())).toBe(DOL.stableId(parse()));
    expect(DOL.stableId(parse())).toMatch(/^dol_oflc:announcement-2026-06-30$/);
  });

  it("distinguishes two announcements", () => {
    expect(DOL.stableId(parse())).not.toBe(DOL.stableId(parse({ href: "/announcement/2025-05-16" })));
  });

  it("never asserts an effective date", () => {
    // The listing publishes none as a field, and the body's dates often refer to
    // something other than this announcement.
    expect(event().effectiveAt).toBeNull();
    expect(event().limitations?.join(" ")).toMatch(/does not publish an effective date/i);
  });

  it("says a certification is not a visa", () => {
    // The single most consequential misunderstanding available here: OFLC sits
    // BEFORE USCIS, and a certification grants nobody permission to work.
    const policy = event({ title: "DOL Announces Additional Guidance for the H-2A Program" });
    expect(policy.limitations?.[0]).toMatch(/not a visa, not an approval, and not permission to work/i);
  });

  it("says a release note describes software, not law", () => {
    expect(event().limitations?.[0]).toMatch(/how the filing software behaves, not what the law requires/i);
  });

  it("attributes the announcement to DOL explicitly", () => {
    const issued = event().entities.find((l) => l.relation === "issued_by")!;
    expect(issued.entityId).toBe("agency:dol");
    expect(issued.basis).toBe("explicit");
    expect(issued.confidence).toBe(1);
  });

  it("copies the summary rather than authoring one", () => {
    expect(event().summary).toBe(parse().body);
  });

  it("says so plainly when OFLC published no summary", () => {
    const e = DOL.toEvent({ ...parse(), body: null }, TODAY);
    expect(e.summary).toMatch(/published no summary/i);
    expect(e.limitations?.join(" ")).toMatch(/no summary text/i);
  });

  it("cites the original announcement", () => {
    expect(event().sourceUrl).toBe("https://flag.dol.gov/announcement/2026-06-30");
    expect(event().sourceKey).toBe("dol_oflc");
  });

  it("emits no generated prose, so it needs no human review gate", () => {
    expect(event().reviewStatus).toBe("auto");
  });
});
