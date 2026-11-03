// =============================================================================
// THE DAILY CASE CHECK
//
// For every paying subscriber with tracked cases: ask USCIS for each case's
// status, compare the title with the last one seen, and email the subscriber
// when it changed. Same rules as the watchlist alert job:
//
//   - Pro only. A lapsed subscriber's cases are not checked.
//   - DRY RUN by default. Without send: true nothing is emailed and nothing is
//     written, so the job can run before anyone approves real email.
//   - Send, then save. The stored status moves only after the email was
//     accepted, so a failed send is retried on the next run.
//   - The first check of a new case sets its status quietly: the subscriber
//     saw it when they added it.
//   - Calls are spaced 250 ms apart (USCIS allows 5 a second) and capped per
//     run, so one run cannot spend the daily quota.
//
// Nothing personal is logged: counts only.
// =============================================================================

import { createHash } from "node:crypto";
import type { SendAlert } from "@/lib/billing/alert-run";
import type { SubscriberStore } from "@/lib/billing/store";
import { accessFor } from "@/lib/billing/subscription";
import { maskReceipt } from "./receipt";
import { parseCases, serializeCases, type TrackedCase } from "./tracked";
import type { StatusResult } from "./uscis";

export const MAX_CHECKS_PER_RUN = 150;
export const SPACING_MS = 250;

export interface CaseRunReport {
  mode: "send" | "dry_run";
  subscribers: number;
  withCases: number;
  notPro: number;
  checked: number;
  unchanged: number;
  firstSeen: number;
  changed: number;
  sent: number;
  failed: number;
  lookupErrors: number;
  capped: boolean;
}

export interface CaseRunInput {
  store: SubscriberStore;
  secret: string;
  nowSeconds: number;
  origin: string;
  send: boolean;
  sender?: SendAlert;
  lookup: (receipt: string) => Promise<StatusResult>;
  sleep?: (ms: number) => Promise<void>;
  maxChecks?: number;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildCaseEmail(input: {
  receipt: string;
  formType: string | null;
  from: string;
  to: string;
  description: string | null;
  origin: string;
}) {
  const origin = input.origin.replace(/\/$/, "");
  const label = `${input.formType ? `${input.formType} ` : ""}${maskReceipt(input.receipt)}`;
  const manage = `${origin}/case-alerts`;
  const subject = `Case update: ${input.to}`;
  const text = [
    `Your case ${label} has a new status on USCIS.`,
    "",
    `Before: ${input.from}`,
    `Now: ${input.to}`,
    ...(input.description ? ["", input.description] : []),
    "",
    "This is the status USCIS publishes for the receipt number you added. Check your USCIS account or any notice you receive for the official record.",
    "",
    `Manage or remove your cases: ${manage}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#0f172a">
<p style="font-size:15px">Your case <strong>${escapeHtml(label)}</strong> has a new status on USCIS.</p>
<table style="font-size:14px;border-collapse:collapse;margin:12px 0">
<tr><td style="color:#64748b;padding:4px 12px 4px 0">Before</td><td>${escapeHtml(input.from)}</td></tr>
<tr><td style="color:#64748b;padding:4px 12px 4px 0">Now</td><td><strong>${escapeHtml(input.to)}</strong></td></tr>
</table>
${input.description ? `<p style="font-size:14px;color:#334155">${escapeHtml(input.description)}</p>` : ""}
<p style="font-size:12px;color:#64748b">This is the status USCIS publishes for the receipt number you added. Check your USCIS account or any notice you receive for the official record.</p>
<p style="font-size:13px"><a href="${manage}">Manage or remove your cases</a></p>
</div>`;
  return { subject, text, html, headers: {} as Record<string, string> };
}

export async function runCaseChecks(input: CaseRunInput): Promise<CaseRunReport> {
  const report: CaseRunReport = {
    mode: input.send ? "send" : "dry_run",
    subscribers: 0,
    withCases: 0,
    notPro: 0,
    checked: 0,
    unchanged: 0,
    firstSeen: 0,
    changed: 0,
    sent: 0,
    failed: 0,
    lookupErrors: 0,
    capped: false,
  };
  const sleep = input.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const cap = input.maxChecks ?? MAX_CHECKS_PER_RUN;
  const keys = await input.store.listSubscriberKeys();
  report.subscribers = keys.length;

  for (const key of keys) {
    if (report.checked >= cap) {
      report.capped = true;
      break;
    }
    const cases = parseCases(await input.store.getProDoc("cases", key), input.secret);
    if (cases.length === 0) continue;
    report.withCases += 1;
    const record = await input.store.getSubscriber(key);
    const access = accessFor(record, input.nowSeconds);
    if (!access.pro || !record) {
      report.notPro += 1;
      continue;
    }

    const next: TrackedCase[] = [];
    let dirty = false;
    for (const c of cases) {
      if (report.checked >= cap) {
        report.capped = true;
        next.push(c);
        continue;
      }
      if (report.checked > 0) await sleep(SPACING_MS);
      report.checked += 1;
      const result = await input.lookup(c.receipt);
      if (!result.ok) {
        report.lookupErrors += 1;
        next.push(c);
        continue;
      }
      const now = result.status.status;
      if (c.status === null) {
        report.firstSeen += 1;
        next.push({ ...c, status: now, formType: result.status.formType ?? c.formType, lastCheckedAt: input.nowSeconds });
        dirty = true;
        continue;
      }
      if (c.status === now) {
        report.unchanged += 1;
        next.push({ ...c, lastCheckedAt: input.nowSeconds });
        dirty = true;
        continue;
      }
      report.changed += 1;
      if (!input.send || !input.sender) {
        next.push(c);
        continue;
      }
      const mail = buildCaseEmail({
        receipt: c.receipt,
        formType: result.status.formType ?? c.formType,
        from: c.status,
        to: now,
        description: result.status.description,
        origin: input.origin,
      });
      const idem = createHash("sha256").update(`case:${key}:${c.receipt}:${now}`).digest("hex").slice(0, 40);
      const sent = await input.sender(record.email, mail, idem);
      if (sent.ok) {
        report.sent += 1;
        next.push({ ...c, status: now, lastCheckedAt: input.nowSeconds, lastChangedAt: input.nowSeconds });
        dirty = true;
      } else {
        report.failed += 1;
        next.push(c);
      }
    }
    // A dry run writes nothing, so it cannot swallow a change before email is on.
    if (dirty && input.send) await input.store.putProDoc("cases", key, serializeCases(next, input.secret));
  }
  return report;
}
