import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore } from "@/lib/billing/store";
import { resetUscisToken } from "@/lib/cases/uscis";
import {
  SANDBOX_PROBES,
  appendDay,
  consecutiveGoodDays,
  isSandbox,
  parseLog,
  readLog,
  runSandboxProbes,
  writeLog,
  type SandboxDay,
} from "@/lib/cases/sandbox";

const ENV = { USCIS_API_BASE: "https://api-int.uscis.gov", USCIS_CLIENT_ID: "id", USCIS_CLIENT_SECRET: "secret" };
const NOW = Date.parse("2026-11-08T16:00:00Z");
const noPause = async () => {};

function fakeUscis(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/oauth/accesstoken")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 1799 }), { status: 200 });
    }
    const receipt = url.split("/").pop()!;
    if (receipt.startsWith("EAC9999103") || receipt.startsWith("LIN9999106") || receipt.startsWith("SRC9999132")) {
      return new Response(
        JSON.stringify({
          case_status: { receiptNumber: receipt, formType: "I-130", current_case_status_text_en: "Case Was Received", current_case_status_desc_en: "secret value" },
          message: "ok",
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ errors: [{ code: "404", message: "not found" }] }), { status: receipt.startsWith("XYZ") ? 400 : 404 });
  }) as typeof fetch;
}

function day(date: string, good = true): SandboxDay {
  return { date, at: `${date}T16:00:00Z`, probes: [], got200: good, got4xx: good };
}

beforeEach(() => resetUscisToken());

describe("USCIS sandbox check", () => {
  it("only treats the sandbox host as the sandbox", () => {
    expect(isSandbox(ENV)).toBe(true);
    expect(isSandbox({ ...ENV, USCIS_API_BASE: "https://api.uscis.gov" })).toBe(false);
    expect(isSandbox({ ...ENV, USCIS_API_BASE: "not a url" })).toBe(false);
  });

  it("covers both 200 and 4xx answers with USCIS staging receipts", () => {
    expect(SANDBOX_PROBES.some((p) => p.expect === "200")).toBe(true);
    expect(SANDBOX_PROBES.some((p) => p.expect === "4xx")).toBe(true);
  });

  it("records codes and field names, never values", async () => {
    const result = await runSandboxProbes(ENV, fakeUscis(), NOW, noPause);
    expect(result.date).toBe("2026-11-08");
    expect(result.got200).toBe(true);
    expect(result.got4xx).toBe(true);
    expect(result.probes.every((p) => p.pass)).toBe(true);
    const ok = result.probes.find((p) => p.receipt === "EAC9999103403")!;
    expect(ok.parsed).toBe(true);
    expect(ok.caseStatusFields).toContain("current_case_status_text_en");
    expect(JSON.stringify(result)).not.toContain("secret value");
  });

  it("flags a 200 our parser cannot read", async () => {
    const odd = (async (input: RequestInfo | URL) =>
      String(input).endsWith("/oauth/accesstoken")
        ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
        : new Response(JSON.stringify({ something: "else" }), { status: 200 })) as typeof fetch;
    const result = await runSandboxProbes(ENV, odd, NOW, noPause);
    expect(result.probes[0].parsed).toBe(false);
    expect(result.probes[0].fields).toEqual(["something"]);
  });

  it("reports a rejected token without an HTTP code", async () => {
    const denied = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const result = await runSandboxProbes(ENV, denied, NOW, noPause);
    expect(result.probes.every((p) => p.error === "no_token" && !p.pass)).toBe(true);
    expect(result.got200 || result.got4xx).toBe(false);
  });

  it("keeps one entry per day and counts consecutive good days", () => {
    let log: SandboxDay[] = [];
    for (const d of ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-10", "2026-11-11"]) log = appendDay(log, day(d));
    expect(log).toHaveLength(4);
    expect(consecutiveGoodDays(log)).toBe(4);
    log = appendDay(log, day("2026-11-13"));
    expect(consecutiveGoodDays(log)).toBe(1);
    expect(consecutiveGoodDays(appendDay(log, day("2026-11-14", false)))).toBe(1);
    expect(consecutiveGoodDays([])).toBe(0);
  });

  it("round-trips the log through the store and survives junk", async () => {
    const store = new MemoryStore();
    await writeLog(store, [day("2026-11-08")]);
    expect(await readLog(store)).toHaveLength(1);
    expect(parseLog("not json")).toEqual([]);
    expect(parseLog(null)).toEqual([]);
  });
});
