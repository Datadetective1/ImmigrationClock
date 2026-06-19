// =============================================================================
// MIGRATION MAP DATA — origin countries of U.S. visa holders, by class.
//
// Powers the animated flow map. IMPORTANT framing: this visualizes the LATEST
// ANNUAL visa data (FY2024), apportioned by country. The animation is an
// illustrative flourish — it is NOT live tracking of people, and the site never
// tracks individuals. H-1B country counts are reported (USCIS); F-1 country
// splits are estimated from national totals. Both are labelled in the UI.
// =============================================================================
import { visaByCountry, countries } from "./dataset";
import { slugify } from "./format";

export const VISA_CLASSES = ["H-1B", "F-1"] as const;
export type MapVisaClass = (typeof VISA_CLASSES)[number];

export const CLASS_META: Record<MapVisaClass, { label: string; provenance: "reported" | "estimated"; blurb: string }> = {
  "H-1B": {
    label: "H-1B workers",
    provenance: "reported",
    blurb: "Where America's H-1B specialty-occupation workers come from.",
  },
  "F-1": {
    label: "F-1 students",
    provenance: "estimated",
    blurb: "Estimated origin countries of international students on F-1 visas.",
  },
};

// Approximate country centroids (lon, lat). Only the countries we have data for.
const COORDS: Record<string, { lon: number; lat: number }> = {
  india: { lon: 78.9, lat: 22 },
  china: { lon: 104.2, lat: 35.9 },
  "south-korea": { lon: 127.8, lat: 36.5 },
  canada: { lon: -106, lat: 56 },
  philippines: { lon: 122, lat: 12.9 },
  mexico: { lon: -102, lat: 23.6 },
  brazil: { lon: -51.9, lat: -10 },
  nigeria: { lon: 8.7, lat: 9.1 },
  vietnam: { lon: 108.3, lat: 16 },
  guatemala: { lon: -90.2, lat: 15.8 },
};

// Equirectangular projection into a 1000 x 500 viewBox.
export const MAP_W = 1000;
export const MAP_H = 500;
export function project(lon: number, lat: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * MAP_W, y: ((90 - lat) / 180) * MAP_H };
}

// Destination: geographic center of the contiguous U.S.
export const USA = { ...project(-98.6, 39.8), lon: -98.6, lat: 39.8 };

export interface MapNode {
  slug: string;
  name: string;
  issued: number;
  share: number;
  lon: number;
  lat: number;
  x: number;
  y: number;
}

const slugByName = new Map(countries.map((c) => [c.name, c.slug]));

/** Origin nodes for a visa class, largest first, with projected coordinates. */
export function mapFlows(visaClass: MapVisaClass): MapNode[] {
  const classRows = visaByCountry.filter((r) => r.visaClass === visaClass);
  // If the dataset carries multiple fiscal years, use only the latest so each
  // country appears once.
  const latestFy = classRows.reduce((mx, r) => Math.max(mx, r.fiscalYear), 0);
  const rows = classRows.filter((r) => r.fiscalYear === latestFy);
  const total = rows.reduce((s, r) => s + r.issued, 0);
  return rows
    .map((r): MapNode | null => {
      const name = r.country;
      if (!name) return null;
      const slug = (r as { countrySlug?: string }).countrySlug ?? slugByName.get(name) ?? slugify(name);
      const co = COORDS[slug];
      if (!co) return null;
      const p = project(co.lon, co.lat);
      return {
        slug,
        name,
        issued: r.issued,
        share: total ? r.issued / total : 0,
        lon: co.lon,
        lat: co.lat,
        x: p.x,
        y: p.y,
      };
    })
    .filter((n): n is MapNode => n !== null)
    .sort((a, b) => b.issued - a.issued);
}

/** Fiscal year covered by the map data (for the caption). */
export function mapFiscalYear(): number {
  return visaByCountry.reduce((mx, r) => Math.max(mx, r.fiscalYear), 0);
}
