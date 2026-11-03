// =============================================================================
// A SUBSCRIBER'S TRACKED CASES
//
// A receipt number is personal data: it identifies one person's case with
// USCIS. So this is the smallest record that can tell "the status changed":
//
//   receipt     encrypted at rest with the rest of the document
//   formType    "I-485", as USCIS reports it
//   status      the status TITLE only ("Case Was Received"). The longer
//               description can carry dates and details about the case; it is
//               shown when fetched and never stored.
//   consentAt   when the subscriber confirmed the case is theirs or that they
//               have the owner's permission (USCIS terms require it)
//
// No names, no notes, no free text. At most MAX_CASES per subscriber. Removing
// a case deletes it; cancelling Pro stops the checks, and the whole document
// can be deleted from /case-alerts at any time.
//
// The document is stored as one AES-256-GCM ciphertext under a key derived
// from BILLING_SESSION_SECRET, so a leaked store dump is not a list of
// immigration cases.
// =============================================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { RECEIPT_PATTERN } from "./receipt";

export const MAX_CASES = 5;

export interface TrackedCase {
  receipt: string;
  formType: string | null;
  /** Last status title seen. Null until the first successful check. */
  status: string | null;
  /** Unix seconds. */
  addedAt: number;
  consentAt: number;
  lastCheckedAt: number | null;
  lastChangedAt: number | null;
}

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`case-alerts:v1:${secret}`).digest();
}

export function encryptDoc(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptDoc(stored: string, secret: string): string | null {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function text(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export function parseCases(stored: string | null, secret: string): TrackedCase[] {
  if (!stored) return [];
  const plain = decryptDoc(stored, secret);
  if (!plain) return [];
  try {
    const raw = JSON.parse(plain) as unknown;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: TrackedCase[] = [];
    for (const item of raw) {
      const r = item as Record<string, unknown>;
      const receipt = typeof r.receipt === "string" && RECEIPT_PATTERN.test(r.receipt) ? r.receipt : null;
      const addedAt = num(r.addedAt);
      const consentAt = num(r.consentAt);
      if (!receipt || addedAt === null || consentAt === null || seen.has(receipt)) continue;
      seen.add(receipt);
      out.push({
        receipt,
        formType: text(r.formType, 20),
        status: text(r.status, 160),
        addedAt,
        consentAt,
        lastCheckedAt: num(r.lastCheckedAt),
        lastChangedAt: num(r.lastChangedAt),
      });
    }
    return out.slice(0, MAX_CASES);
  } catch {
    return [];
  }
}

export function serializeCases(cases: readonly TrackedCase[], secret: string): string {
  return encryptDoc(JSON.stringify(cases.slice(0, MAX_CASES)), secret);
}

export function addCase(
  cases: readonly TrackedCase[],
  entry: TrackedCase
): { cases: TrackedCase[]; result: "added" | "exists" | "full" } {
  if (cases.some((c) => c.receipt === entry.receipt)) return { cases: [...cases], result: "exists" };
  if (cases.length >= MAX_CASES) return { cases: [...cases], result: "full" };
  return { cases: [entry, ...cases], result: "added" };
}

export function removeCase(cases: readonly TrackedCase[], receipt: string): TrackedCase[] {
  return cases.filter((c) => c.receipt !== receipt);
}
