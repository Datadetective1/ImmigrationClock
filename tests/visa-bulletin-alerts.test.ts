// A new Visa Bulletin is the one monthly event a green card applicant waits
// for. These tests hold what a bulletin alert may say: only the newest month,
// once, only to readers who follow it or an employment category it covers,
// and only dates that are in the hand-entered data.

import { describe, it, expect } from "vitest";
import { buildAlertBatch, initialCursor, visaBulletinAlerts } from "@/lib/billing/alerts";
import { BULLETINS, bulletinPath, changedCells, latestBulletin, type Bulletin } from "@/lib/visa-bulletin";

const latest = latestBulletin() as Bulletin;
const inMonth = `${latest.id}-05`;
const empty = { events: [], warnEmployers: [], h1bEmployers: [], fiscalYear: "" };

describe("visa bulletin alerts", () => {
  it("alerts a reader who follows the Visa Bulletin, once", () => {
    const [a] = visaBulletinAlerts(BULLETINS, ["topic:visa-bulletin"], {}, inMonth);
    expect(a.kind).toBe("visa_bulletin");
    expect(a.id).toBe(`visa_bulletin:${latest.id}`);
    expect(a.title).toBe(`The ${latest.label} Visa Bulletin is out`);
    expect(a.href).toBe(bulletinPath(latest));
    expect(a.source?.url).toMatch(/^https:\/\/travel\.state\.gov\//);
    expect(visaBulletinAlerts(BULLETINS, ["topic:visa-bulletin"], { sent: [a.id] }, inMonth)).toEqual([]);
  });

  it("says nothing to readers who follow neither the bulletin nor an EB category", () => {
    expect(visaBulletinAlerts(BULLETINS, ["visa:h-1b", "visa:f-1", "country:india"], {}, inMonth)).toEqual([]);
  });

  it("names only the followed category's rows", () => {
    const [a] = visaBulletinAlerts(BULLETINS, ["visa:eb-2"], {}, inMonth);
    expect(a.detail).toContain("for EB-2");
    expect(a.detail).not.toMatch(/EB-3|EB-5|F2A/);
    const moved = changedCells(latest, "employment").filter((c) => c.row === "EB2");
    if (moved.length === 0) expect(a.detail).toMatch(/^No final action dates moved/);
    else expect(a.detail).toMatch(/^Final action dates that moved/);
  });

  it("does not send a bulletin after its month has ended", () => {
    const [y, m] = latest.id.split("-").map(Number);
    const after = m === 12 ? `${y + 1}-01-02` : `${y}-${String(m + 1).padStart(2, "0")}-02`;
    expect(visaBulletinAlerts(BULLETINS, ["topic:visa-bulletin"], {}, after)).toEqual([]);
  });

  it("travels in the batch and is remembered in the cursor", () => {
    const batch = buildAlertBatch({ ...empty, bulletins: BULLETINS }, ["visa:eb-5"], initialCursor(inMonth), { today: inMonth });
    expect(batch.alerts.map((a) => a.kind)).toEqual(["visa_bulletin"]);
    expect(batch.cursor.sent).toContain(`visa_bulletin:${latest.id}`);
    const again = buildAlertBatch({ ...empty, bulletins: BULLETINS }, ["visa:eb-5"], batch.cursor, { today: inMonth });
    expect(again.alerts).toEqual([]);
  });

  it("is off when no bulletins are passed in", () => {
    expect(buildAlertBatch(empty, ["topic:visa-bulletin"], {}, { today: inMonth }).alerts).toEqual([]);
  });

  it("uses no long dashes", () => {
    for (const f of ["topic:visa-bulletin", "visa:eb-2", "visa:eb-3", "visa:eb-5"]) {
      const [a] = visaBulletinAlerts(BULLETINS, [f], {}, inMonth);
      expect(`${a.title} ${a.detail}`).not.toMatch(/[–—]/);
    }
  });
});
