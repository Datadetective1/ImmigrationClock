// =============================================================================
// ENTITY LABELS — turning graph ids into words a reader recognises
//
// "policy:uscis-pm-volume-7-part-a" and "country:south-sudan" are correct,
// stable identifiers and completely unreadable. Anywhere an entity is offered to
// a reader — a follow chip, a filter, a match reason — it has to arrive as
// "USCIS Policy Manual Volume 7, Part A" and "South Sudan".
//
// This lives in one module because the alternative is every component inventing
// its own formatting, and then the same entity reads three different ways on
// three surfaces.
// =============================================================================

import { ENTITY_BY_ID } from "@/domains/graph/entities";
import { COUNTRY_BY_SLUG } from "@/domains/graph/countries";
import { VOLUME_SUBJECTS } from "@/domains/graph/adapters/uscis-policy-manual";

/** Title-case a slug, leaving known acronyms alone. */
function humanize(slug: string): string {
  return slug
    .split("-")
    .map((part) =>
      /^(us|usa|uscis|dhs|ice|cbp|dol|dos|doj|eoir|tps|daca|perm|lca|h|f|j|l|o|eb)$/i.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ");
}

/**
 * A reader-facing label for any entity id.
 *
 * Resolution order runs most-specific first: the seeded registry knows the
 * canonical names, the country registry covers the ~200 countries that are
 * deliberately not seeded, Policy Manual parts get their published volume name,
 * and anything unrecognised degrades to a humanized slug rather than leaking a
 * raw id onto the page.
 */
export function labelForEntity(entityId: string): string {
  const known = ENTITY_BY_ID.get(entityId as never);
  if (known) return known.name;

  const [type, ...rest] = entityId.split(":");
  const slug = rest.join(":");
  if (!slug) return entityId;

  if (type === "country") {
    const def = COUNTRY_BY_SLUG.get(slug);
    if (def) return def.name;
  }

  if (type === "policy") {
    // "uscis-pm-volume-7-part-a" -> "USCIS Policy Manual Vol. 7 (Adjustment of
    // Status), Part A". Naming the volume is what makes a citation legible to
    // someone who has never opened the Policy Manual.
    const m = /^uscis-pm-volume-(\d+)(?:-part-([a-z]+))?$/i.exec(slug);
    if (m) {
      const volume = Number(m[1]);
      const subject = VOLUME_SUBJECTS[volume]?.name;
      const part = m[2] ? `, Part ${m[2].toUpperCase()}` : "";
      return `USCIS Policy Manual Vol. ${volume}${subject ? ` (${subject})` : ""}${part}`;
    }
  }

  return humanize(slug);
}

/** Plain-English name for a followable type, for section headings. */
export const TYPE_LABEL: Record<string, string> = {
  visa: "Visa categories and programs",
  country: "Countries",
  agency: "Agencies",
  topic: "Topics",
  policy: "Policy Manual sections",
  employer: "Employers",
};
