// =============================================================================
// EOIR IMMIGRATION COURT CASELOAD — pending cases, new cases, completions
//
// EOIR publishes its adjudication statistics as one PDF per table, linked from
// its "Workload and Adjudication Statistics" page. The first table, "Pending
// Cases, New Cases, and Total Completions", is the court backlog: one row per
// fiscal year, with a "Data Generated" date at the top.
//
// The PDF has a real text layer (it is exported, not scanned), so the rows are
// read from it directly. Nothing is estimated: if the table cannot be read, the
// refresh keeps the last figure it did read and says it is stale.
//
// The link is found by its text rather than its address, because EOIR's media
// ids change when a table is re-uploaded. Shared by refresh-data.mjs and tests.
// =============================================================================

export const EOIR_STATS_PAGE = "https://www.justice.gov/eoir/workload-and-adjudication-statistics";
const EOIR_HOST = "https://www.justice.gov";
export const EOIR_TABLE_TITLE = "Pending Cases, New Cases, and Total Completions";

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** Absolute URL of the caseload table PDF, or null when the page no longer links it. */
export function caseloadPdfUrl(page) {
  for (const m of page.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (label.toLowerCase() !== EOIR_TABLE_TITLE.toLowerCase()) continue;
    const href = m[1].replace(/&amp;/g, "&");
    return href.startsWith("http") ? href : EOIR_HOST + href;
  }
  return null;
}

/** "Data Generated: October 22, 2026" as an ISO date, or null. */
export function dataGeneratedDate(text) {
  const m = /Data Generated:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(text);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2].padStart(2, "0")}` : null;
}

/**
 * Fiscal-year rows: "2026 3,300,793 528,889 973,669".
 *
 * Only lines of exactly a year and three figures count, so the chart's axis
 * labels ("2017 2018 2019 …") and scale ("500,000") are never mistaken for data.
 */
export function parseCaseloadRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(20\d{2}|19\d{2})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/.exec(line);
    if (!m) continue;
    const n = (s) => Number(s.replace(/,/g, ""));
    rows.push({ fy: Number(m[1]), pending: n(m[2]), receipts: n(m[3]), completions: n(m[4]) });
  }
  rows.sort((a, b) => a.fy - b.fy);
  return rows;
}

/**
 * The whole table, checked before it is trusted.
 *
 * Throws with a reason a person can act on, rather than returning a figure that
 * merely parsed: a misread column would put a confident wrong backlog on the site.
 */
export function readCaseloadTable(text) {
  if (!new RegExp(EOIR_TABLE_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) {
    throw new Error(`the PDF does not carry the "${EOIR_TABLE_TITLE}" title`);
  }
  const dataGenerated = dataGeneratedDate(text);
  if (!dataGenerated) throw new Error('no "Data Generated" date in the PDF');
  const rows = parseCaseloadRows(text);
  if (rows.length < 3) throw new Error(`only ${rows.length} fiscal-year row(s) could be read`);
  const latest = rows[rows.length - 1];
  if (latest.pending < 10_000) throw new Error(`implausible pending count ${latest.pending} for FY${latest.fy}`);
  if (latest.fy < Number(dataGenerated.slice(0, 4)) - 1) {
    throw new Error(`newest row is FY${latest.fy}, older than the table's ${dataGenerated} generation date allows`);
  }
  return { dataGenerated, rows, latest };
}

/** Plain text of a PDF's pages, via unpdf. Imported lazily so tests of the parsers need no PDF engine. */
export async function pdfText(bytes) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/**
 * Fetch the current table. `fetchWithTimeout` is refresh-data.mjs's, which
 * throws on any non-2xx status.
 */
export async function fetchEoirCaseload(prev, fetchWithTimeout) {
  try {
    const page = await (await fetchWithTimeout(EOIR_STATS_PAGE)).text();
    const pdfUrl = caseloadPdfUrl(page);
    if (!pdfUrl) throw new Error(`the statistics page no longer links "${EOIR_TABLE_TITLE}"`);

    const res = await fetchWithTimeout(pdfUrl, {}, 30000);
    const lastModified = res.headers.get("last-modified");
    const posted = lastModified && !Number.isNaN(Date.parse(lastModified))
      ? new Date(lastModified).toISOString().slice(0, 10)
      : null;
    const { dataGenerated, rows, latest } = readCaseloadTable(await pdfText(await res.arrayBuffer()));

    return {
      ok: true,
      stale: false,
      fy: latest.fy,
      pending: latest.pending,
      receipts: latest.receipts,
      completions: latest.completions,
      dataGenerated,
      postedAt: posted,
      series: rows,
      datasetUrl: pdfUrl,
      fetchedAt: new Date().toISOString(),
      sourceName: "EOIR Adjudication Statistics",
      sourceUrl: EOIR_STATS_PAGE,
      sourceUpdatedAt: posted ?? dataGenerated,
      note: `Pending immigration court cases, new cases and completions by fiscal year, as reported in EOIR's table generated ${dataGenerated}.`,
    };
  } catch (err) {
    console.warn(`[refresh] EOIR caseload fetch failed: ${err.message}; keeping last good value`);
    const last = prev?.eoir;
    return last && last.pending != null
      ? { ...last, ok: false, stale: true, lastError: err.message, note: `Last good value (fetch failed: ${err.message}).` }
      : {
          ok: false, stale: false, fy: null, pending: null, receipts: null, completions: null, series: [],
          fetchedAt: null, lastError: err.message, note: `Unavailable (${err.message}).`,
          sourceName: "EOIR Adjudication Statistics", sourceUrl: EOIR_STATS_PAGE,
        };
  }
}
