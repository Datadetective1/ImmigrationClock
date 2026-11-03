// Case alerts are on only when the flag is on AND the USCIS credentials are
// set. Either missing, and every surface says "not switched on yet".

import { flagOn } from "@/lib/flags";
import { uscisConfigured } from "./uscis";

export function caseAlertsReady(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn("case_alerts", env) && uscisConfigured(env);
}
