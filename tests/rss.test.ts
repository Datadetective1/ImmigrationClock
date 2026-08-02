// =============================================================================
// RSS / ATOM PARSER
//
// This parser is shared infrastructure: USCIS newsroom reads through it today,
// and the Policy Manual and every agency feed after it will too. A defect here
// is not one bad adapter, it is every feed-based source at once.
//
// The tests concentrate on DATES, because a date is the one field where this
// parser can fail silently. A missing title drops an item and is obvious; a
// mis-parsed year produces a confident, well-formed, completely wrong event
// that lands on a timeline a century away from where it belongs.
// =============================================================================
import { describe, it, expect } from "vitest";
import { parseFeed, parseFeedDate } from "@/domains/graph/rss";

const THIS_YEAR = new Date().getUTCFullYear();

describe("feed date parsing", () => {
  it("reads a standard RFC-822 pubDate", () => {
    expect(parseFeedDate("Thu, 30 Jul 2026 15:19:32 -0400")).toBe("2026-07-30");
  });

  it("reads an ISO / Atom timestamp", () => {
    expect(parseFeedDate("2026-07-30T19:19:32Z")).toBe("2026-07-30");
  });

  it("reads USCIS two-digit years as this century, not the last one", () => {
    // REGRESSION GUARD. USCIS emits "Thu, 30 Jul 26 15:19:32 -0400". Date()
    // reads the bare "26" as 1926, which would silently place every USCIS
    // event a hundred years in the past — well-formed, confident, and wrong.
    expect(parseFeedDate("Thu, 30 Jul 26 15:19:32 -0400")).toBe("2026-07-30");
    expect(parseFeedDate("Mon, 5 Jan 26 09:00:00 -0500")).toBe("2026-01-05");
  });

  it("pads single-digit days from a two-digit-year date", () => {
    expect(parseFeedDate("Mon, 5 Jan 26 09:00:00 -0500")).toBe("2026-01-05");
  });

  it("returns null rather than a guess when the date is unparseable", () => {
    expect(parseFeedDate(null)).toBeNull();
    expect(parseFeedDate("")).toBeNull();
    expect(parseFeedDate("   ")).toBeNull();
    expect(parseFeedDate("not a date at all")).toBeNull();
    expect(parseFeedDate("Thu, 30 Zzz 26 15:19:32 -0400")).toBeNull();
  });

  it("rejects dates outside the plausible range instead of returning them", () => {
    // A date before the modern immigration system, or far in the future, is a
    // parse failure. Returning it would put a fabricated point on a timeline.
    expect(parseFeedDate("Thu, 30 Jul 1887 15:19:32 -0400")).toBeNull();
    expect(parseFeedDate("2400-01-01T00:00:00Z")).toBeNull();
  });

  it("applies the same range rule to two-digit years", () => {
    // REGRESSION: the two-digit branch returned early and skipped the range
    // check, so "Jul 99" became 2099 — a date no feed can legitimately carry,
    // passed through as fact by the one function whose contract is to refuse
    // exactly that.
    const farFuture = parseFeedDate("Thu, 30 Jul 99 15:19:32 -0400");
    expect(farFuture).toBeNull();

    // The boundary stays open for genuinely near-future publication dates,
    // which the Federal Register legitimately carries on public inspection.
    const nextYear = String(THIS_YEAR + 1).slice(2);
    expect(parseFeedDate(`Thu, 30 Jul ${nextYear} 15:19:32 -0400`)).toBe(`${THIS_YEAR + 1}-07-30`);
  });
});

describe("feed item parsing", () => {
  const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>USCIS Reaches H-1B Cap for Fiscal Year 2027</title>
    <link>https://www.uscis.gov/newsroom/alerts/cap-reached</link>
    <description><![CDATA[<p>USCIS has received a sufficient number of petitions.</p>]]></description>
    <pubDate>Thu, 30 Jul 26 15:19:32 -0400</pubDate>
    <guid isPermaLink="false">uscis-node-12345</guid>
    <category>Alerts</category>
    <category>H-1B</category>
  </item>
  <item>
    <title>Item With No Link</title>
    <description>Should be dropped.</description>
  </item>
</channel></rss>`;

  it("parses an RSS item into the shared shape", () => {
    const [item] = parseFeed(RSS);
    expect(item.title).toBe("USCIS Reaches H-1B Cap for Fiscal Year 2027");
    expect(item.link).toBe("https://www.uscis.gov/newsroom/alerts/cap-reached");
    expect(item.publishedAt).toBe("2026-07-30");
    expect(item.guid).toBe("uscis-node-12345");
    expect(item.categories).toEqual(["Alerts", "H-1B"]);
  });

  it("unwraps CDATA and strips embedded HTML from a description", () => {
    const [item] = parseFeed(RSS);
    expect(item.description).toBe("USCIS has received a sufficient number of petitions.");
    expect(item.description).not.toMatch(/</);
  });

  it("drops an item with no link rather than emitting an uncitable event", () => {
    // Every event must carry a source URL. An item we cannot link to cannot be
    // cited, and an uncitable event has no place in the store.
    const items = parseFeed(RSS);
    expect(items).toHaveLength(1);
    expect(items.map((i) => i.title)).not.toContain("Item With No Link");
  });

  it("parses Atom entries, taking the link from its href attribute", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Policy Manual Update</title>
        <link rel="alternate" href="https://www.uscis.gov/policy-manual/updates/1"/>
        <summary>Volume 7 was updated.</summary>
        <updated>2026-07-15T00:00:00Z</updated>
        <id>tag:uscis.gov,2026:update-1</id>
      </entry>
    </feed>`;
    const [item] = parseFeed(atom);
    expect(item.title).toBe("Policy Manual Update");
    expect(item.link).toBe("https://www.uscis.gov/policy-manual/updates/1");
    expect(item.description).toBe("Volume 7 was updated.");
    expect(item.publishedAt).toBe("2026-07-15");
    expect(item.guid).toBe("tag:uscis.gov,2026:update-1");
  });

  // ---------------------------------------------------------------------------
  // Encoding. Feeds carry the same content in at least three encodings, and the
  // parser must converge them on identical text. These are regression guards for
  // an ordering bug that stripped tags BEFORE decoding entities.
  // ---------------------------------------------------------------------------
  const withDescription = (d: string) =>
    `<rss><channel><item><title>T</title><link>https://a.gov/x</link>` +
    `<description>${d}</description></item></channel></rss>`;

  it("keeps a plain CDATA description instead of discarding it", () => {
    // REGRESSION, and the worst of the three: the tag-stripper consumed the
    // whole CDATA wrapper including its contents, so a published summary came
    // back null and the adapter reported "No summary was published" — telling
    // the reader something false about the source document.
    const [item] = parseFeed(withDescription("<![CDATA[Plain text summary.]]>"));
    expect(item.description).toBe("Plain text summary.");
  });

  it("leaves no CDATA terminator behind when the block contains markup", () => {
    const [item] = parseFeed(withDescription("<![CDATA[<p>Has markup.</p>]]>"));
    expect(item.description).toBe("Has markup.");
    expect(item.description).not.toMatch(/\]\]>/);
  });

  it("strips entity-encoded markup rather than emitting it as literal tags", () => {
    // Escaping markup as &lt;p&gt; is the most common form in agency feeds.
    const [item] = parseFeed(withDescription("&lt;p&gt;Escaped markup.&lt;/p&gt;"));
    expect(item.description).toBe("Escaped markup.");
    expect(item.description).not.toMatch(/[<>]/);
  });

  it("converges every encoding of the same sentence on identical text", () => {
    const expected = "USCIS updated its guidance.";
    const encodings = [
      "USCIS updated its guidance.",
      "<![CDATA[USCIS updated its guidance.]]>",
      "<![CDATA[<p>USCIS updated its guidance.</p>]]>",
      "&lt;p&gt;USCIS updated its guidance.&lt;/p&gt;",
      "<p>USCIS updated its guidance.</p>",
    ];
    for (const enc of encodings) {
      expect(parseFeed(withDescription(enc))[0].description, `encoding: ${enc}`).toBe(expected);
    }
  });

  it("does not turn double-encoded text into live markup", () => {
    // "&amp;lt;" is an author writing about the characters, not writing markup.
    // Decoding &amp; first would manufacture a tag and then delete the text.
    const [item] = parseFeed(withDescription("Use &amp;lt;p&amp;gt; to open a paragraph."));
    expect(item.description).toBe("Use &lt;p&gt; to open a paragraph.");
  });

  it("drops an item whose title is present but empty after decoding", () => {
    const xml = `<rss><channel><item>
      <title>&nbsp;</title><link>https://a.gov/x</link>
    </item></channel></rss>`;
    expect(parseFeed(xml)).toEqual([]);
  });

  it("decodes HTML entities in titles", () => {
    const xml = `<rss><channel><item>
      <title>Fees &amp; Forms &#8212; Q&quot;A</title>
      <link>https://example.gov/a</link>
    </item></channel></rss>`;
    expect(parseFeed(xml)[0].title).toBe('Fees & Forms — Q"A');
  });

  it("leaves publishedAt null when the feed carried no usable date", () => {
    // Null is the correct answer. The adapter drops undated items; a guessed
    // date would place a real document on the wrong day forever.
    const xml = `<rss><channel><item>
      <title>Undated</title><link>https://example.gov/a</link>
    </item></channel></rss>`;
    expect(parseFeed(xml)[0].publishedAt).toBeNull();
  });

  it("returns an empty list for junk input instead of throwing", () => {
    // One malformed feed must not take down an ingestion run.
    expect(parseFeed("")).toEqual([]);
    expect(parseFeed("<html><body>404 Not Found</body></html>")).toEqual([]);
  });
});
