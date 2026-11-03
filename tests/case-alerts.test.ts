import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore, type SubscriberRecord } from "@/lib/billing/store";
import { maskReceipt, normalizeReceipt } from "@/lib/cases/receipt";
import { MAX_CASES, addCase, decryptDoc, encryptDoc, parseCases, removeCase, serializeCases, type TrackedCase } from "@/lib/cases/tracked";
import { fetchCaseStatus, parseStatusResponse, resetUscisToken, uscisConfigured, type StatusResult } from "@/lib/cases/uscis";
import { buildCaseEmail, runCaseChecks } from "@/lib/cases/run";
import { caseAlertsReady } from "@/lib/cases/config";

const SECRET = "test-secret-for-case-alerts";
const NOW = 1_800_000_000;
const ENV = { USCIS_API_BASE: "https://api-int.uscis.gov", USCIS_CLIENT_ID: "id", USCIS_CLIENT_SECRET: "secret" };

function tracked(receipt: string, status: string | null): TrackedCase {
  return { receipt, formType: "I-485", status, addedAt: NOW - 100, consentAt: NOW - 100, lastCheckedAt: null, lastChangedAt: null };
}

function record(over: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return { email: "pro@example.com", customerId: "cus_x", status: "active", currentPeriodEnd: NOW + 86_400, updatedAt: NOW, ...over } as SubscriberRecord;
}

describe("receipt numbers", () => {
  it("normalises what people paste", () => {
    expect(normalizeReceipt("eac-21-900-12345")).toBe("EAC2190012345");
    expect(normalizeReceipt(" IOE 0912345678 ")).toBe("IOE0912345678");
  });
  it("refuses anything that is not a receipt number", () => {
    for (const bad of ["", "EAC123", "12345678901234", "EAC21900123456", "hello world", 42, null]) {
      expect(normalizeReceipt(bad)).toBeNull();
    }
  });
  it("masks for email", () => {
    expect(maskReceipt("EAC2190012345")).toBe("EAC•••••12345");
  });
});

describe("tracked cases at rest", () => {
  it("round-trips through encryption and hides the receipt", () => {
    const stored = serializeCases([tracked("EAC2190012345", "Case Was Received")], SECRET);
    expect(stored).not.toContain("EAC2190012345");
    expect(parseCases(stored, SECRET)[0].receipt).toBe("EAC2190012345");
  });
  it("reads nothing with the wrong key or a tampered document", () => {
    const stored = encryptDoc("[]", SECRET);
    expect(decryptDoc(stored, "other")).toBeNull();
    expect(parseCases(stored.slice(0, -2) + "AA", SECRET)).toEqual([]);
    expect(parseCases("not encrypted", SECRET)).toEqual([]);
  });
  it("drops malformed entries and duplicates", () => {
    const stored = encryptDoc(
      JSON.stringify([tracked("EAC2190012345", null), tracked("EAC2190012345", null), { receipt: "free text", addedAt: 1, consentAt: 1 }]),
      SECRET
    );
    expect(parseCases(stored, SECRET)).toHaveLength(1);
  });
  it("caps the list and refuses duplicates", () => {
    let list: TrackedCase[] = [];
    for (let i = 0; i < MAX_CASES; i++) list = addCase(list, tracked(`EAC219001234${i}`, null)).cases;
    expect(addCase(list, tracked("EAC2190019999", null)).result).toBe("full");
    expect(addCase(list, tracked("EAC2190012340", null)).result).toBe("exists");
    expect(removeCase(list, "EAC2190012340")).toHaveLength(MAX_CASES - 1);
  });
});

describe("USCIS API client", () => {
  beforeEach(() => resetUscisToken());

  it("is off until all three values are set", () => {
    expect(uscisConfigured({})).toBe(false);
    expect(uscisConfigured({ ...ENV, USCIS_CLIENT_SECRET: "" })).toBe(false);
    expect(uscisConfigured(ENV)).toBe(true);
    expect(caseAlertsReady({ ...ENV })).toBe(false);
    expect(caseAlertsReady({ ...ENV, FEATURE_CASE_ALERTS: "true" })).toBe(true);
  });

  it("reads the status and keeps the description out of storage shape", () => {
    const s = parseStatusResponse("EAC2190012345", {
      case_status: { formType: "I-485", current_case_status_text_en: "Case Was Approved", current_case_status_desc_en: "On ...", modifiedDate: "x" },
    });
    expect(s).toMatchObject({ status: "Case Was Approved", formType: "I-485" });
    expect(parseStatusResponse("EAC2190012345", { nothing: true })).toBeNull();
  });

  it("gets a token once and passes USCIS's own error message back", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/oauth/accesstoken")) return new Response(JSON.stringify({ access_token: "t", expires_in: 1200 }), { status: 200 });
      if (String(url).includes("EAC0000000000")) return new Response(JSON.stringify({ message: "Receipt not found." }), { status: 404 });
      return new Response(JSON.stringify({ case_status: { current_case_status_text_en: "Case Was Received" } }), { status: 200 });
    }) as typeof fetch;
    const ok = await fetchCaseStatus("EAC2190012345", ENV, fake, NOW * 1000);
    expect(ok.ok && ok.status.status).toBe("Case Was Received");
    const missing = await fetchCaseStatus("EAC0000000000", ENV, fake, NOW * 1000);
    expect(missing).toEqual({ ok: false, kind: "not_found", message: "Receipt not found." });
    expect(calls.filter((u) => u.endsWith("/oauth/accesstoken"))).toHaveLength(1);
  });

  it("says not switched on without credentials", async () => {
    const r = await fetchCaseStatus("EAC2190012345", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("not_configured");
  });
});

describe("daily case check", () => {
  async function setup(cases: TrackedCase[], rec: SubscriberRecord = record()) {
    const store = new MemoryStore();
    await store.putSubscriber("k1", rec);
    await store.putProDoc("cases", "k1", serializeCases(cases, SECRET));
    return store;
  }
  const lookup = (status: string) => async (): Promise<StatusResult> => ({
    ok: true,
    status: { receipt: "", formType: "I-485", status, description: "Details.", modified: null },
  });
  const sent: { to: string; subject: string }[] = [];
  const sender = async (to: string, mail: { subject: string }) => {
    sent.push({ to, subject: mail.subject });
    return { ok: true as const };
  };
  beforeEach(() => {
    sent.length = 0;
  });
  const base = { secret: SECRET, nowSeconds: NOW, origin: "https://immigrationclock.com", sleep: async () => {} };

  it("emails on a change, then saves the new status", async () => {
    const store = await setup([tracked("EAC2190012345", "Case Was Received")]);
    const r = await runCaseChecks({ ...base, store, send: true, sender, lookup: lookup("Case Was Approved") });
    expect(r).toMatchObject({ checked: 1, changed: 1, sent: 1 });
    expect(sent[0]).toEqual({ to: "pro@example.com", subject: "Case update: Case Was Approved" });
    expect(parseCases(await store.getProDoc("cases", "k1"), SECRET)[0].status).toBe("Case Was Approved");
    // Nothing new on the next run.
    const again = await runCaseChecks({ ...base, store, send: true, sender, lookup: lookup("Case Was Approved") });
    expect(again).toMatchObject({ unchanged: 1, sent: 0 });
  });

  it("sets the first status quietly", async () => {
    const store = await setup([tracked("EAC2190012345", null)]);
    const r = await runCaseChecks({ ...base, store, send: true, sender, lookup: lookup("Case Was Received") });
    expect(r).toMatchObject({ firstSeen: 1, sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("writes and sends nothing on a dry run", async () => {
    const store = await setup([tracked("EAC2190012345", "Case Was Received")]);
    const before = await store.getProDoc("cases", "k1");
    const r = await runCaseChecks({ ...base, store, send: false, lookup: lookup("Case Was Approved") });
    expect(r).toMatchObject({ mode: "dry_run", changed: 1, sent: 0 });
    expect(await store.getProDoc("cases", "k1")).toBe(before);
  });

  it("keeps the old status when the email fails, so it retries", async () => {
    const store = await setup([tracked("EAC2190012345", "Case Was Received")]);
    const failing = async () => ({ ok: false as const, detail: "down" });
    const r = await runCaseChecks({ ...base, store, send: true, sender: failing, lookup: lookup("Case Was Approved") });
    expect(r.failed).toBe(1);
    expect(parseCases(await store.getProDoc("cases", "k1"), SECRET)[0].status).toBe("Case Was Received");
  });

  it("skips a lapsed subscriber and respects the per-run cap", async () => {
    const lapsed = await setup([tracked("EAC2190012345", "Case Was Received")], record({ status: "canceled" }));
    const r = await runCaseChecks({ ...base, store: lapsed, send: true, sender, lookup: lookup("Case Was Approved") });
    expect(r).toMatchObject({ notPro: 1, checked: 0 });

    const many = await setup([tracked("EAC2190012341", "A"), tracked("EAC2190012342", "A"), tracked("EAC2190012343", "A")]);
    const capped = await runCaseChecks({ ...base, store: many, send: true, sender, lookup: lookup("A"), maxChecks: 2 });
    expect(capped).toMatchObject({ checked: 2, capped: true });
  });

  it("builds a short email that masks the receipt number", () => {
    const m = buildCaseEmail({ receipt: "EAC2190012345", formType: "I-485", from: "Received", to: "Approved", description: null, origin: "https://x.test/" });
    expect(m.text).toContain("EAC•••••12345");
    expect(m.text).not.toContain("EAC2190012345");
    expect(m.html).toContain("https://x.test/case-alerts");
  });
});
