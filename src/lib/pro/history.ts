// =============================================================================
// ALERT HISTORY — what we have already told a subscriber
//
// One entry per email that Resend accepted, newest first, capped. Each item is
// what the email said (title, link, kind), so a subscriber can find an alert
// they deleted and can see that nothing was sent twice. Written only after a
// successful send; a dry run writes nothing.
// =============================================================================

import type { Alert } from "@/lib/billing/alerts";

export const MAX_HISTORY = 50;

export interface HistoryItem {
  id: string;
  kind: Alert["kind"];
  title: string;
  href: string;
  date: string;
}

export interface HistoryEntry {
  /** Unix seconds when the email was accepted for delivery. */
  sentAt: number;
  items: HistoryItem[];
}

export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is HistoryEntry =>
          typeof (e as HistoryEntry)?.sentAt === "number" && Array.isArray((e as HistoryEntry)?.items)
      )
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function appendHistory(entries: readonly HistoryEntry[], alerts: readonly Alert[], sentAt: number): HistoryEntry[] {
  const entry: HistoryEntry = {
    sentAt,
    items: alerts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, href: a.href, date: a.date })),
  };
  return [entry, ...entries].slice(0, MAX_HISTORY);
}

export function serializeHistory(entries: readonly HistoryEntry[]): string {
  return JSON.stringify(entries.slice(0, MAX_HISTORY));
}
