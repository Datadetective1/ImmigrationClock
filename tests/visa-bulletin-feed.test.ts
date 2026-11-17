// The extension feed: carries exactly the checked cells, nothing estimated.

import { describe, expect, it } from "vitest";
import { CHARGEABILITY, cutoffFor, latestBulletin, previousBulletin } from "@/lib/visa-bulletin";
import { buildFeed, waitKey } from "@/lib/visa-bulletin/feed";
import { WAIT_PAIRS, waitPath } from "@/lib/visa-bulletin/wait-time";
import { GET } from "@/app/api/v1/visa-bulletin/route";

describe("visa bulletin feed", () => {
  const feed = buildFeed();
  const b = latestBulletin()!;

  it("serves the newest checked month and the one before it", () => {
    expect(feed.latest?.id).toBe(b.id);
    expect(feed.latest?.verifiedAt).toBe(b.verifiedAt);
    expect(feed.latest?.sourceUrl).toMatch(/^https:\/\/travel\.state\.gov\//);
    expect(feed.previous?.id).toBe(previousBulletin(b)?.id);
  });

  it("copies every cell exactly", () => {
    for (const c of feed.categories) {
      for (const country of CHARGEABILITY) {
        const cell = feed.latest!.dates[c.section][c.row]![country];
        expect(cell.finalAction).toBe(cutoffFor(b, c.section, "finalAction", c.row, country));
        expect(cell.filing).toBe(cutoffFor(b, c.section, "filing", c.row, country));
      }
    }
  });

  it("links every wait-time page", () => {
    for (const p of WAIT_PAIRS) {
      expect(feed.waitTimePages[waitKey(p.section, p.row, p.country)]).toBe(waitPath(p));
    }
  });

  it("is readable from any origin", async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body.schema).toBe(1);
  });
});
