// =============================================================================
// AG / BIA PRECEDENT DECISIONS
//
// Fixtures follow EOIR's volume pages as fetched on 2026-11-05: volume 30 for
// BIA decisions, and volume 29's markup for an Attorney General decision, whose
// citation sits after the bold name with a stray &nbsp;.
// =============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { __testing as EP, eoirPrecedentsAdapter } from "@/domains/graph/adapters/eoir-precedents";
import { validateEvent } from "@/domains/graph/events";

const INDEX = `<ul class="doj-stars"><li><a href="#menu1">AG/BIA Precedent Decisions</a></li></ul>
<a href="/eoir/volume-30">Volume 30 (4240 - )</a> <a href="/eoir/vll/intdec/nfvol22.html">Volume 22</a>
<a href="/eoir/volume-29">Volume 29 (4085 - 4239)</a> <a href="/eoir/volume-28">Volume 28</a>`;

const VOLUME_30 = `<div class="field_body"><table class="table" style="width:100%;"><tbody><tr><td><strong>ONTIVEROS-DIAZ</strong>, 30 I&amp;N Dec. 222 (BIA 2026)</td><td style="text-align:right;"><a href="/eoir/media/1470361/dl?inline">ID 4272</a> (PDF)</td></tr></tbody></table><p>(1)&nbsp; A violation of a voluntary departure agreement renders an alien ineligible for certain immigration benefits for a 10-year period.</p><p>(2)&nbsp; Filing a motion to reopen to submit new evidence pertaining to a prior application for cancellation of removal does not relieve an alien of the consequences of failing to voluntarily depart.</p><hr><table class="table" style="width:100%;"><tbody><tr><td><strong>CRUZ AIJIACO</strong>, 30 I&amp;N Dec. 218 (BIA 2026)</td><td style="text-align:right;"><a href="/eoir/media/1469771/dl?inline">ID 4271</a> (PDF)</td></tr></tbody></table><p>No amount of bond is sufficient to ensure the respondent’s appearance at future immigration hearings in light of his multiple violations of motor vehicle laws, failure to establish a fixed address, and apparent lack of eligibility for relief from removal.</p><hr><table class="table"><tbody><tr><td><strong>NEGUSIE, </strong>29 I&amp;N Dec. 285 (A.G. 2025)&nbsp;</td><td><a href="/eoir/media/1416586/dl?inline">ID 4135</a> (PDF)</td></tr></tbody></table><p>The stay of the Board’s March 16, 2021, order in this matter is vacated.</p></div></div><footer><p>About</p></footer>`;

describe("index and volume parsing", () => {
  it("finds the volume pages, newest first", () => {
    expect(EP.volumesFromIndex(INDEX)).toEqual([30, 29, 28]);
  });

  it("reads citation, deciding body, interim decision number, PDF and headnotes", () => {
    const [a, b, c] = EP.parseVolume(VOLUME_30);
    expect(a).toMatchObject({
      volume: 30, page: 222, interimDecision: 4272, body: "BIA", year: 2026,
      citation: "30 I&N Dec. 222 (BIA 2026)",
      pdfUrl: "https://www.justice.gov/eoir/media/1470361/dl?inline",
    });
    expect(a.headnotes).toHaveLength(2);
    expect(a.headnotes[0]).toMatch(/^A violation of a voluntary departure agreement/);
    expect(b.headnotes).toHaveLength(1);
    expect(c).toMatchObject({ volume: 29, page: 285, body: "AG", citation: "29 I&N Dec. 285 (A.G. 2025)" });
  });

  it("does not pick up the page footer as a headnote", () => {
    const last = EP.parseVolume(VOLUME_30).at(-1)!;
    expect(last.headnotes).toEqual(["The stay of the Board’s March 16, 2021, order in this matter is vacated."]);
  });
});

describe("events", () => {
  const [first] = EP.parseVolume(VOLUME_30);
  const e = EP.toEvent(first, "2026-11-05", "2026-11-05", "https://www.justice.gov/eoir/volume-30");

  it("is a valid, major decision that cites the decision itself", () => {
    expect(validateEvent(e)).toEqual([]);
    expect(e.id).toBe("eoir_precedents:30-in-dec-222");
    expect(e.classification).toBe("court_decision");
    expect(e.severity).toBe("major");
    expect(e.sourceUrl).toBe("https://www.justice.gov/eoir/media/1470361/dl?inline");
    expect(e.summary).toMatch(/voluntary departure agreement/);
  });

  it("leaves the respondent's name out of the title", () => {
    expect(e.title).toBe("Board of Immigration Appeals precedent: 30 I&N Dec. 222 (BIA 2026)");
    expect(e.title).not.toMatch(/ONTIVEROS/i);
  });

  it("reads the posting date from Last-Modified and refuses to guess without one", () => {
    expect(EP.postedDate("Thu, 05 Nov 2026 14:16:47 GMT")).toBe("2026-11-05");
    expect(EP.postedDate(null)).toBeNull();
  });
});

describe("fetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(over: Record<string, Response> = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (over[url]) return over[url];
        if (url.endsWith("/eoir/ag-bia-decisions")) return new Response(INDEX, { status: 200 });
        if (url.endsWith("/eoir/volume-30")) return new Response(VOLUME_30, { status: 200 });
        if (url.endsWith("/eoir/volume-29")) return new Response("", { status: 200 });
        if (url.includes("/eoir/media/") && init?.method === "HEAD") {
          const dates: Record<string, string> = {
            "1470361": "Thu, 05 Nov 2026 14:16:47 GMT",
            "1469771": "Mon, 02 Nov 2026 14:56:56 GMT",
            "1416586": "Mon, 15 Sep 2025 14:00:00 GMT",
          };
          const id = /media\/(\d+)/.exec(url)![1];
          return new Response(null, { status: 200, headers: { "last-modified": dates[id] } });
        }
        return new Response("not found", { status: 404 });
      })
    );
  }

  it("dates each new decision by its posting and keeps those inside the window", async () => {
    stub();
    const r = await eoirPrecedentsAdapter.fetchEvents!({ since: "2026-10-01", limit: 50 });
    expect(r.failed).toBe(false);
    expect(r.events.map((e) => [e.id, e.publishedAt])).toEqual([
      ["eoir_precedents:30-in-dec-222", "2026-11-05"],
      ["eoir_precedents:30-in-dec-218", "2026-11-02"],
    ]);
  });

  it("skips decisions already in the store without asking for their dates", async () => {
    stub();
    const r = await eoirPrecedentsAdapter.fetchEvents!({
      since: "2026-10-01",
      limit: 50,
      knownIds: new Set(["eoir_precedents:30-in-dec-222", "eoir_precedents:30-in-dec-218"]),
    });
    expect(r.events).toEqual([]);
    const heads = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls.filter(
      ([, init]) => init?.method === "HEAD"
    );
    expect(heads).toHaveLength(0);
  });

  it("reports the source as unreachable when the index refuses the request", async () => {
    stub({ "https://www.justice.gov/eoir/ag-bia-decisions": new Response("denied", { status: 403 }) });
    const r = await eoirPrecedentsAdapter.fetchEvents!({ since: "2026-10-01", limit: 50 });
    expect(r.failed).toBe(true);
    expect(r.warnings[0]).toMatch(/HTTP 403/);
  });
});
