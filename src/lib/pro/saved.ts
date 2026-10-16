// =============================================================================
// SAVED CHANGES — a subscriber's research list
//
// Change ids and the time they were saved. No notes: a free-text field on an
// immigration site is where a case number or a status ends up, and Briefing
// has no need to hold one. The brief export rebuilds everything else from the
// archive, so a saved item always shows the record as it stands today.
// =============================================================================

export const MAX_SAVED = 200;

export interface SavedItem {
  id: string;
  /** Unix seconds. */
  savedAt: number;
}

/** Change ids are "<sourceKey>:<nativeId>". Anything else is not ours to store. */
const CHANGE_ID = /^[a-z0-9_]{2,40}:[A-Za-z0-9._\-]{1,120}$/;

export function isChangeIdShape(id: unknown): id is string {
  return typeof id === "string" && CHANGE_ID.test(id);
}

export function parseSaved(raw: string | null): SavedItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: SavedItem[] = [];
    for (const item of parsed) {
      const id = (item as SavedItem)?.id;
      const savedAt = (item as SavedItem)?.savedAt;
      if (!isChangeIdShape(id) || typeof savedAt !== "number" || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, savedAt });
    }
    return out.slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function serializeSaved(items: readonly SavedItem[]): string {
  return JSON.stringify(items.slice(0, MAX_SAVED));
}

/**
 * Save or unsave one change. Newest first. A full list refuses a new save
 * rather than silently dropping the oldest — losing research quietly is worse
 * than saying "the list is full".
 */
export function setSaved(
  items: readonly SavedItem[],
  id: string,
  saved: boolean,
  nowSeconds: number
): { items: SavedItem[]; full: boolean } {
  const rest = items.filter((i) => i.id !== id);
  if (!saved) return { items: rest, full: false };
  if (items.some((i) => i.id === id)) return { items: [...items], full: false };
  if (rest.length >= MAX_SAVED) return { items: [...items], full: true };
  return { items: [{ id, savedAt: nowSeconds }, ...rest], full: false };
}
