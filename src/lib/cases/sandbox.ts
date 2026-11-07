// =============================================================================
// USCIS SANDBOX CHECK
//
// USCIS grants production access to the Case Status API only after an app has
// sent sandbox traffic on at least 5 consecutive calendar days, with both
// success (200) and error (4xx) answers tested. This runs once a day against
// the sandbox with USCIS's published staging receipt numbers (fake cases, no
// personal data) plus deliberately bad ones, and keeps a short log.
//
// It never runs against production: the base URL must be the sandbox host.
// The log holds dates, HTTP codes and response field NAMES only, never values,
// so it can be read without a secret and shown to USCIS during the demo.
// =============================================================================

import type { SubscriberStore } from "@/lib/billing/store";
import { lookupRaw, parseStatusResponse, type UscisEnv } from "@/lib/cases/uscis";

export const SANDBOX_HOST = "api-int.uscis.gov";

/** Staging receipts from developer.uscis.gov/api/case-status, plus bad ones for 4xx. */
export const SANDBOX_PROBES: { receipt: string; expect: "200" | "4xx" }[] = [
  { receipt: "EAC9999103403", expect: "200" }, // with case history
  { receipt: "LIN9999106498", expect: "200" }, // with case history
  { receipt: "SRC9999132694", expect: "200" }, // without case history
  { receipt: "EAC9999999999", expect: "4xx" }, // well formed, not a staging case
  { receipt: "XYZ0000000000", expect: "4xx" }, // unknown prefix
];

/** Where the log lives: a store key no subscriber key can ever equal (theirs are hex HMACs). */
export const SANDBOX_LOG_KEY = "ops:uscis-sandbox-log";
export const LOG_DAYS = 21;

export interface ProbeResult {
  receipt: string;
  expect: "200" | "4xx";
  httpStatus: number | null;
  /** Did the result land in the expected class? */
  pass: boolean;
  /** Top-level field names of the body, and of case_status when present. */
  fields: string[];
  caseStatusFields: string[];
  /** For 200s: could our parser read a status title out of it? */
  parsed: boolean | null;
  /** For failures before an HTTP answer. */
  error?: string;
}

export interface SandboxDay {
  date: string; // YYYY-MM-DD, UTC
  at: string; // ISO time of the run
  probes: ProbeResult[];
  got200: boolean;
  got4xx: boolean;
}

export function isSandbox(env: UscisEnv): boolean {
  try {
    return new URL(env.USCIS_API_BASE ?? "").host === SANDBOX_HOST;
  } catch {
    return false;
  }
}

function keysOf(v: unknown): string[] {
  return v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v as object).sort() : [];
}

export async function runSandboxProbes(
  env: UscisEnv,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<SandboxDay> {
  const probes: ProbeResult[] = [];
  for (const [i, p] of SANDBOX_PROBES.entries()) {
    if (i > 0) await pause(300);
    const raw = await lookupRaw(p.receipt, env, fetchImpl, nowMs);
    if (!raw.ok) {
      probes.push({ ...p, httpStatus: null, pass: false, fields: [], caseStatusFields: [], parsed: null, error: raw.kind });
      continue;
    }
    const body = raw.body as Record<string, unknown> | null;
    const cs = body?.case_status ?? body?.caseStatus;
    const is200 = raw.httpStatus >= 200 && raw.httpStatus < 300;
    const is4xx = raw.httpStatus >= 400 && raw.httpStatus < 500;
    probes.push({
      ...p,
      httpStatus: raw.httpStatus,
      pass: p.expect === "200" ? is200 : is4xx,
      fields: keysOf(body),
      caseStatusFields: keysOf(cs),
      parsed: is200 ? parseStatusResponse(p.receipt, body) !== null : null,
    });
  }
  const iso = new Date(nowMs).toISOString();
  return {
    date: iso.slice(0, 10),
    at: iso,
    probes,
    got200: probes.some((p) => p.expect === "200" && p.pass),
    got4xx: probes.some((p) => p.expect === "4xx" && p.pass),
  };
}

export function parseLog(raw: string | null): SandboxDay[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as SandboxDay[]).filter((d) => d && typeof d.date === "string") : [];
  } catch {
    return [];
  }
}

/** Adds today's run, one entry per date (a rerun replaces it), newest last, trimmed. */
export function appendDay(log: SandboxDay[], day: SandboxDay): SandboxDay[] {
  const rest = log.filter((d) => d.date !== day.date);
  return [...rest, day].sort((a, b) => a.date.localeCompare(b.date)).slice(-LOG_DAYS);
}

/** Consecutive calendar days, ending with the latest logged day, that saw both a 200 and a 4xx. */
export function consecutiveGoodDays(log: SandboxDay[]): number {
  const good = log.filter((d) => d.got200 && d.got4xx).map((d) => d.date).sort();
  if (!good.length) return 0;
  let streak = 1;
  for (let i = good.length - 1; i > 0; i--) {
    const gap = (Date.parse(good[i]) - Date.parse(good[i - 1])) / 86_400_000;
    if (gap === 1) streak++;
    else break;
  }
  return streak;
}

export async function readLog(store: SubscriberStore): Promise<SandboxDay[]> {
  return parseLog(await store.getProDoc("cases", SANDBOX_LOG_KEY));
}

export async function writeLog(store: SubscriberStore, log: SandboxDay[]): Promise<void> {
  await store.putProDoc("cases", SANDBOX_LOG_KEY, JSON.stringify(log));
}
