// =============================================================================
// SOURCE STATUS SAYS WHAT IS TRUE
//
// The refresh table answered four questions with one badge: a source we do not
// collect yet read "COMPLETE" next to "ingestion not built yet", and the change
// feeds that supply every record read "PENDING". Completeness now comes only
// from a real reporting period, and the change feeds report their own runs.
// =============================================================================

import { describe, expect, it } from "vitest";
import { dataManifest, refreshRows } from "@/lib/refresh";
import { SOURCE_BY_KEY } from "@/lib/sources";
import health from "@/lib/generated/pipeline-health.json";

const rows = refreshRows();
const row = (key: string) => rows.find((r) => r.key === key)!;

describe("completeness", () => {
  it("is never claimed for a source we do not collect", () => {
    const planned = rows.filter((r) => r.ingestion === "planned");
    expect(planned.length).toBeGreaterThan(0);
    for (const r of planned) expect(r.completeness, r.key).toBe("not_collected");
    for (const m of dataManifest()) {
      if (SOURCE_BY_KEY[m.key]?.ingestion === "planned") expect(m.completeness, m.key).toBe("not_collected");
    }
  });

  it("is 'continuous' for feeds that have no reporting period, not 'complete'", () => {
    for (const key of ["federal_register", "uscis_newsroom", "uscis_policy_manual", "federal_courts"]) {
      expect(row(key).latestPeriod, key).toBe("—");
      expect(row(key).completeness, key).toBe("continuous");
    }
  });

  it("keeps real reporting periods as they were", () => {
    expect(row("cbp_encounters").completeness).toBe("ytd");
    expect(row("uscis_h1b_national").completeness).toBe("preliminary");
    expect(row("bls_unemployment").completeness).toBe("point_in_time");
  });
});

describe("run status", () => {
  it("reports the change feeds from the change pipeline's own runs", () => {
    for (const key of ["federal_register", "uscis_newsroom", "uscis_policy_manual", "federal_courts"]) {
      const run = (health.sources as { key: string; configured: boolean }[]).find((s) => s.key === key.replace(/_/g, "-"));
      // A feed switched off for want of an access key (Federal courts without
      // COURTLISTENER_TOKEN) reads nothing, so it must never report SUCCESS.
      if (run && !run.configured) {
        expect(row(key).status, key).not.toBe("SUCCESS");
        continue;
      }
      expect(["SUCCESS", "PARTIAL", "FAILED"], key).toContain(row(key).status);
      expect(row(key).status, key).not.toBe("PENDING");
    }
  });

  it("still says PENDING, with the reason, for sources with no automated run", () => {
    for (const r of rows.filter((x) => x.ingestion === "planned")) {
      expect(r.status).toBe("PENDING");
      expect(r.errorMessage).toMatch(/not built yet/);
    }
    for (const r of rows.filter((x) => x.ingestion === "curated")) expect(r.status).toBe("PENDING");
  });
});
