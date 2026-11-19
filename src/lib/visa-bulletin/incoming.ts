// =============================================================================
// A NEW BULLETIN MONTH, TYPED AS PRINTED
//
// The bulletin-day path for adding a month to ./data.ts without hand-editing
// TypeScript. Someone types the four charts from the official bulletin into a
// small text file, cell by cell, exactly as printed (22JAN21, C, U), and
// scripts/add-bulletin.ts turns it into the entry in ./data.ts. That one
// entry is what the wait-time pages, the Visa Bulletin page, the forecast, the
// extension feed (/api/v1/visa-bulletin) and the free email alerts all read,
// so adding it and deploying updates every one of them.
//
// Nothing here fetches or guesses. A cell that is missing or not readable
// stops the script with the chart, row and column named.
//
// File format (one line each, comma separated, # starts a comment):
//
//   id,2026-12
//   label,December 2026
//   source,https://travel.state.gov/content/dam/visas/Bulletins/visabulletin_December2026.pdf
//   verified,2026-12-03            the day every cell was checked against it
//   note,CA/VO: November 6, 2026   optional: the publication line printed on it
//   chart,family,finalAction
//   F1,22JAN21,22JAN21,22JAN21,22SEP08,01NOV13
//   ...                            columns: all, china, india, mexico, philippines
//   chart,family,filing
//   chart,employment,finalAction
//   chart,employment,filing
// =============================================================================

import {
  CHARGEABILITY,
  EMPLOYMENT_ROWS,
  FAMILY_ROWS,
  type Bulletin,
  type ChartKind,
  type Cutoff,
} from "./types";

const MON: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "22JAN21" -> "2021-01-22"; "C" and "U" as they are. Null when unreadable. */
export function parsePrintedCell(raw: string): Cutoff | null {
  const v = raw.trim().toUpperCase();
  if (v === "C" || v === "U") return v;
  const m = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(v);
  if (!m || !MON[m[2]]) return null;
  const day = Number(m[1]);
  const month = Number(MON[m[2]]);
  const yy = Number(m[3]);
  const year = yy < 70 ? 2000 + yy : 1900 + yy;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > last) return null;
  return `${year}-${MON[m[2]]}-${m[1]}` as Cutoff;
}

export class IncomingError extends Error {}

export interface IncomingMonth {
  bulletin: Bulletin;
  note?: string;
}

export function parseIncoming(text: string): IncomingMonth {
  const meta: Record<string, string> = {};
  const charts: Record<string, Record<string, Record<string, Cutoff>>> = {};
  let current: string | null = null;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const cells = line.split(",").map((c) => c.trim());
    const head = cells[0];
    const where = `line ${i + 1}`;
    if (["id", "label", "source", "verified", "note"].includes(head)) {
      meta[head] = cells.slice(1).join(",").trim();
      return;
    }
    if (head === "chart") {
      const [section, kind] = [cells[1], cells[2]];
      if (!["family", "employment"].includes(section) || !["finalAction", "filing"].includes(kind)) {
        throw new IncomingError(`${where}: chart must be family|employment and finalAction|filing`);
      }
      current = `${section}.${kind}`;
      if (charts[current]) throw new IncomingError(`${where}: chart ${current} appears twice`);
      charts[current] = {};
      return;
    }
    if (!current) throw new IncomingError(`${where}: a row before any "chart," line`);
    const section = current.split(".")[0];
    const allowed: readonly string[] = section === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS;
    if (!allowed.includes(head)) throw new IncomingError(`${where}: "${head}" is not a ${section} row`);
    if (cells.length !== 6) throw new IncomingError(`${where} ${current} ${head}: expected 5 cells, got ${cells.length - 1}`);
    if (charts[current][head]) throw new IncomingError(`${where}: ${current} ${head} appears twice`);
    const row: Record<string, Cutoff> = {};
    CHARGEABILITY.forEach((country, j) => {
      const parsed = parsePrintedCell(cells[j + 1]);
      if (!parsed) throw new IncomingError(`${where} ${current} ${head} ${country}: cannot read "${cells[j + 1]}"`);
      row[country] = parsed;
    });
    charts[current][head] = row;
  });

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(meta.id ?? "")) throw new IncomingError(`id must look like 2026-12`);
  const [y, m] = meta.id.split("-").map(Number);
  const expectedLabel = `${MONTH_NAMES[m - 1]} ${y}`;
  if (meta.label !== expectedLabel) throw new IncomingError(`label must be "${expectedLabel}" for ${meta.id}`);
  if (!/^https:\/\/travel\.state\.gov\//.test(meta.source ?? "")) throw new IncomingError(`source must be a travel.state.gov address`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.verified ?? "")) throw new IncomingError(`verified must be the day the cells were checked, YYYY-MM-DD`);

  for (const section of ["family", "employment"] as const) {
    for (const kind of ["finalAction", "filing"] as ChartKind[]) {
      const chart = charts[`${section}.${kind}`];
      if (!chart) throw new IncomingError(`missing chart,${section},${kind}`);
      for (const row of section === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS) {
        if (!chart[row]) throw new IncomingError(`${section} ${kind}: missing row ${row}`);
      }
    }
  }

  const bulletin = {
    id: meta.id,
    label: meta.label,
    sourceUrl: meta.source,
    verifiedAt: meta.verified,
    family: { finalAction: charts["family.finalAction"], filing: charts["family.filing"] },
    employment: { finalAction: charts["employment.finalAction"], filing: charts["employment.filing"] },
  } as unknown as Bulletin;
  return { bulletin, note: meta.note || undefined };
}

function tableSource(rows: readonly string[], table: Record<string, Record<string, Cutoff>>, indent: string): string {
  return rows
    .map((r) => `${indent}${r}: { ${CHARGEABILITY.map((c) => `${c}: "${table[r][c]}"`).join(", ")} },`)
    .join("\n");
}

/** The entry exactly as ./data.ts writes one. */
export function entrySource(month: IncomingMonth): string {
  const b = month.bulletin;
  const fam = b.family as unknown as Record<ChartKind, Record<string, Record<string, Cutoff>>>;
  const emp = b.employment as unknown as Record<ChartKind, Record<string, Record<string, Cutoff>>>;
  return [
    "  {",
    `    id: "${b.id}",`,
    `    label: "${b.label}",`,
    `    sourceUrl: "${b.sourceUrl}",`,
    `    verifiedAt: "${b.verifiedAt}",`,
    ...(month.note ? [`    // Department of State publication date printed on the bulletin: ${month.note.replace(/\n/g, " ")}.`] : []),
    "    family: {",
    "      finalAction: {",
    tableSource(FAMILY_ROWS, fam.finalAction, "        "),
    "      },",
    "      filing: {",
    tableSource(FAMILY_ROWS, fam.filing, "        "),
    "      },",
    "    },",
    "    employment: {",
    "      finalAction: {",
    tableSource(EMPLOYMENT_ROWS, emp.finalAction, "        "),
    "      },",
    "      filing: {",
    tableSource(EMPLOYMENT_ROWS, emp.filing, "        "),
    "      },",
    "    },",
    "  },",
  ].join("\n");
}

/** data.ts with the new month added first. Refuses a month that is already there. */
export function insertIntoData(dataSource: string, month: IncomingMonth): string {
  if (dataSource.includes(`id: "${month.bulletin.id}"`)) {
    throw new IncomingError(`${month.bulletin.id} is already in data.ts`);
  }
  const anchor = "export const BULLETINS: Bulletin[] = [\n";
  if (!dataSource.includes(anchor)) throw new IncomingError("could not find the BULLETINS list in data.ts");
  return dataSource.replace(anchor, `${anchor}${entrySource(month)}\n`);
}
