// =============================================================================
// IMMIGRATION COURT CASELOAD (EOIR)
//
// TABLE_TEXT is the text layer of EOIR's "Pending Cases, New Cases, and Total
// Completions" PDF as unpdf extracted it on 2026-11-05 (data generated
// October 22, 2026), chart labels included, since those are what a careless
// parser would misread as data.
// =============================================================================
import { describe, expect, it } from "vitest";
import {
  caseloadPdfUrl,
  dataGeneratedDate,
  parseCaseloadRows,
  readCaseloadTable,
} from "../../scripts/eoir-caseload.mjs";
import { __testing as EC } from "@/domains/graph/adapters/eoir-caseload";
import { validateEvent } from "@/domains/graph/events";

const TABLE_TEXT = `Data Generated: October 22, 2026
1 Pending cases equals removal, deportation, exclusion, asylum-only, and withholding only.
2 Initial receipts equals removal, deportation, exclusion, asylum-only, and withholding only.
3 Total completions equals initial case completions plus subsequent case completions.
EXECUTIVE OFFICE FOR IMMIGRATION REVIEW
ADJUDICATION STATISTICS
Pending Cases, New Cases, and Total Completions
FY Pending Cases1 Initial Receipts2 Total Completions3
2017 975,999 295,259 163,074
2018 1,108,323 316,130 195,145
2019 1,391,389 547,237 277,076
2020 1,551,999 369,578 232,310
2021 1,694,256 244,264 115,968
2022 2,105,300 707,530 314,848
2023 2,811,569 1,206,105 526,834
2024 3,924,917 1,783,908 705,295
2025 3,722,534 562,376 798,975
2026 3,300,793 528,889 973,669
0
500,000
1,000,000
4,500,000
2017 2018 2019 2020 2021 2022 2023 2024 2025 2026
Pending Cases
Initial Receipts
Total Completions`;

const STATS_PAGE = `<div class="field_body"><ul>
<li><a href="/eoir/media/1344791/dl?inline">Pending Cases, New Cases, and Total Completions</a></li>
<li><a href="/eoir/media/1395636/dl?inline">New Cases and Total Completions</a></li>
<li><a href="/eoir/media/1344811/dl?inline">FY 2026 Decision Outcomes</a></li></ul></div>`;

describe("reading EOIR's table", () => {
  it("finds the table by its title, not by a media id that changes on re-upload", () => {
    expect(caseloadPdfUrl(STATS_PAGE)).toBe("https://www.justice.gov/eoir/media/1344791/dl?inline");
    expect(caseloadPdfUrl("<a href='/x'>Something else</a>")).toBeNull();
  });

  it("reads the generation date and every fiscal-year row, and ignores the chart labels", () => {
    expect(dataGeneratedDate(TABLE_TEXT)).toBe("2026-10-22");
    const rows = parseCaseloadRows(TABLE_TEXT);
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)).toEqual({ fy: 2026, pending: 3_300_793, receipts: 528_889, completions: 973_669 });
  });

  it("refuses a table it cannot trust instead of publishing a misread figure", () => {
    expect(() => readCaseloadTable(TABLE_TEXT.replace("Data Generated: October 22, 2026", ""))).toThrow(/Data Generated/);
    expect(() => readCaseloadTable("Pending Cases, New Cases, and Total Completions\nData Generated: October 22, 2026\n2026 3,300,793 528,889 973,669")).toThrow(/row/);
    expect(() => readCaseloadTable("Asylum Decisions\nData Generated: October 22, 2026")).toThrow(/title/);
  });
});

const STATE = {
  ok: true,
  stale: false,
  fy: 2026,
  pending: 3_300_793,
  receipts: 528_889,
  completions: 973_669,
  dataGenerated: "2026-10-22",
  postedAt: "2026-10-28",
  series: parseCaseloadRows(TABLE_TEXT),
  datasetUrl: "https://www.justice.gov/eoir/media/1344791/dl?inline",
  sourceUrl: "https://www.justice.gov/eoir/workload-and-adjudication-statistics",
  fetchedAt: "2026-11-05T11:00:00.000Z",
};

describe("events", () => {
  it("is a valid routine data release that states the figures as reported and cites the table", () => {
    const e = EC.toEvent(STATE, "2026-11-05");
    expect(validateEvent(e)).toEqual([]);
    expect(e.id).toBe("eoir_caseload:generated-2026-10-22");
    expect(e.classification).toBe("data_release");
    expect(e.severity).toBe("routine");
    expect(e.provenance).toBe("reported");
    expect(e.title).toBe("Immigration court backlog: 3,300,793 cases pending (FY 2026, as reported by EOIR)");
    expect(e.summary).toMatch(/down 421,741 from 3,722,534 in FY 2025/);
    expect(e.publishedAt).toBe("2026-10-28");
    expect(e.dataThrough).toBe("2026-10-22");
    expect(e.sourceDataUrl).toBe(STATE.datasetUrl);
  });

  it("reports a failed read as unreachable, naming when it last worked, and keeps the last good figure", () => {
    const r = EC.buildEvents({ ...STATE, ok: false, stale: true, lastError: "HTTP 403" }, "2026-11-06");
    expect(r.failed).toBe(true);
    expect(r.warnings[0]).toMatch(/could not be read \(HTTP 403\); last read 2026-11-05/);
    expect(r.events).toHaveLength(1);
  });

  it("reports a source that has never been read as a failure, not as a quiet month", () => {
    const r = EC.buildEvents(undefined, "2026-11-06");
    expect(r.failed).toBe(true);
    expect(r.events).toEqual([]);
  });
});
