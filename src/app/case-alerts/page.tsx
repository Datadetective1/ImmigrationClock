// =============================================================================
// /case-alerts : an email when a USCIS case status changes (Pro)
//
// Reads the official USCIS Case Status API only. While the feature is switched
// off (FEATURE_CASE_ALERTS or the USCIS credentials missing) the page explains
// what is coming and stores nothing. Dynamic and noindex: what it shows depends
// on who is asking.
// =============================================================================

import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { CaseAlertsManager } from "@/components/CaseAlertsManager";
import { COOKIE_NAME } from "@/lib/billing/entitlement";
import { caseAlertsReady } from "@/lib/cases/config";
import { MAX_CASES, parseCases } from "@/lib/cases/tracked";
import { proGate } from "@/lib/pro/caller";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "USCIS Case Status Alerts",
  description: "Get an email when USCIS shows a new status for your case.",
  path: "/case-alerts",
  noindex: true,
});

const STEPS = [
  { n: "1", title: "Add a receipt number", text: "Up to 5 cases." },
  { n: "2", title: "We check USCIS daily", text: "With the official USCIS API." },
  { n: "3", title: "You get an email", text: "Only when the status changes." },
];

function Note({ children }: { children: React.ReactNode }) {
  return <div className="panel p-4 text-sm text-slate-300 sm:p-6">{children}</div>;
}

export default async function CaseAlertsPage() {
  const ready = caseAlertsReady();
  const gate = await proGate(cookies().get(COOKIE_NAME)?.value);

  let body: React.ReactNode;
  if (!ready) {
    body = (
      <Note>
        <p className="font-semibold text-white">Coming soon for Pro.</p>
        <p className="mt-1">We are waiting on production access to the USCIS API.</p>
      </Note>
    );
  } else if (gate.ok) {
    const cases = parseCases(await gate.store.getProDoc("cases", gate.key), gate.secret);
    body = <CaseAlertsManager initial={cases} max={MAX_CASES} />;
  } else if (gate.reason === "not_signed_in") {
    body = (
      <Note>
        <Link href="/account" className="font-semibold text-accent underline">
          Sign in
        </Link>{" "}
        with your Pro email to add cases.
      </Note>
    );
  } else {
    body = (
      <Note>
        Case alerts are part of{" "}
        <Link href="/pricing" className="font-semibold text-accent underline">
          Pro
        </Link>
        .
      </Note>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Pro"
        title="Case status alerts"
        description="An email when USCIS shows a new status for your case."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/case-alerts", label: "Case alerts" },
        ]}
      />
      <div className="container-page max-w-3xl space-y-6 py-8">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">{s.n}</span>
              <p className="mt-2 text-sm font-semibold text-white">{s.title}</p>
              <p className="mt-1 text-xs text-slate-400">{s.text}</p>
            </li>
          ))}
        </ol>
        {body}
        <p className="text-xs text-slate-500">
          Your receipt numbers are stored encrypted and only used to ask USCIS for the status. Remove them any time. See our{" "}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          . Not legal advice; your USCIS account and notices are the official record.
        </p>
      </div>
    </div>
  );
}
