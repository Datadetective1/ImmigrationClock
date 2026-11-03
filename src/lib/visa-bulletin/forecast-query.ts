// Validates the forecast form's four fields. Anything else is refused, so the
// route can never be asked about a row or country the bulletin does not print.

import { CHARGEABILITY, EMPLOYMENT_ROWS, FAMILY_ROWS, type Chargeability, type Row } from "./types";
import type { Section } from "./index";

export type ForecastQuery =
  | { ok: true; section: Section; row: Row; country: Chargeability; date: string }
  | { ok: false };

export function parseForecastQuery(params: URLSearchParams): ForecastQuery {
  const section = params.get("section");
  const row = params.get("row") ?? "";
  const country = params.get("country") ?? "";
  const date = params.get("date") ?? "";
  if (section !== "family" && section !== "employment") return { ok: false };
  const rows: readonly string[] = section === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS;
  if (!rows.includes(row)) return { ok: false };
  if (!(CHARGEABILITY as readonly string[]).includes(country)) return { ok: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1980-01-01" || date > "2100-12-31") return { ok: false };
  return { ok: true, section, row: row as Row, country: country as Chargeability, date };
}
