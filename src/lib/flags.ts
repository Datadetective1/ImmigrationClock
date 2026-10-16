// =============================================================================
// FEATURE FLAGS — server-side switches for work that is built but not yet sold
//
// A flag is an environment variable that must be exactly "true". Anything else,
// including unset, is off. Flags are read on the server only: a page or route
// behind a flag answers 404 while it is off, so nothing half-finished is
// reachable, indexable or advertised.
//
// Turning a flag on does not put a feature on /pricing. That is a separate,
// deliberate edit to CAPABILITY_SPECS, made after the feature has been checked
// end to end in production.
// =============================================================================

export const FLAGS = {
  /** /briefing, saved changes, brief export, the calendar feed and the alert settings that go with them. */
  pro_briefing: "FEATURE_PRO_BRIEFING",
  /** ImmigrationClock Intelligence inside Briefing: the per-follow landscape, then the weekly summary. Needs pro_briefing. */
  pro_intelligence: "FEATURE_PRO_INTELLIGENCE",
} as const;

export type FlagName = keyof typeof FLAGS;

export function flagOn(name: FlagName, env: Record<string, string | undefined> = process.env): boolean {
  return (env[FLAGS[name]] ?? "").trim() === "true";
}
