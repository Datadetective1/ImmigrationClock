import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import manifest from "@/lib/generated/newsletter-latest.json";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Weekly Pulse Email",
  description: "Status of the most recent Immigration Pulse build, in every language.",
  path: "/admin/pulse-email",
  noindex: true,
});

interface Edition {
  segment: string;
  locale: string;
  items: number;
  totalInWindow: number;
  subject: string;
  htmlPath: string;
  textPath: string;
  audienceConfigured: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Operator view of the newsletter pipeline.
 *
 * This used to be a copy-and-paste tool, because sending was manual. Sending is
 * now automated, so the useful question changed from "what do I paste" to "did
 * this week's issue build, is it valid, and where can I read it" — which is
 * what this answers.
 */
export default function PulseEmailAdminPage() {
  const editions = (manifest.editions ?? []) as Edition[];
  const failing = editions.filter((e) => e.errors.length > 0);
  const unconfigured = editions.filter((e) => !e.audienceConfigured);

  return (
    <div>
      <PageHeader
        eyebrow="Operator tool"
        title="Immigration Pulse — latest build"
        description="Built and validated on a schedule by .github/workflows/newsletter.yml. Nothing is sent unless every edition validates."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/admin/pulse-email", label: "Pulse email" },
        ]}
      />

      <div className="container-page max-w-4xl space-y-6 py-10">
        <p className="text-sm text-slate-400">
          Issue <span className="font-mono text-slate-200">{manifest.today}</span> · cadence{" "}
          <span className="font-mono text-slate-200">{manifest.cadence}</span> · built{" "}
          {formatDate(String(manifest.generatedAt).slice(0, 10))}
        </p>

        {failing.length > 0 ? (
          <div className="rounded-xl border border-status-amber/30 bg-status-amber/5 p-4">
            <h2 className="text-sm font-semibold text-status-amber">
              {failing.length} edition{failing.length === 1 ? "" : "s"} failed validation — nothing was sent
            </h2>
            <ul className="mt-2 space-y-1">
              {failing.flatMap((e) =>
                e.errors.map((msg) => (
                  <li key={`${e.segment}-${msg}`} className="text-xs leading-relaxed text-slate-300">
                    <span className="font-mono">{e.segment}</span> — {msg}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-medium">Edition</th>
                <th className="py-2 pr-3 font-medium">Subject</th>
                <th className="py-2 pr-3 font-medium">Items</th>
                <th className="py-2 pr-3 font-medium">Audience</th>
                <th className="py-2 font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {editions.map((e) => (
                <tr key={e.segment} className="border-b border-white/5">
                  <td className="py-2.5 pr-3 font-mono text-xs text-slate-300">{e.segment}</td>
                  <td className="py-2.5 pr-3 text-slate-200">{e.subject}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-400">
                    {e.items} <span className="text-slate-500">of {e.totalInWindow}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {e.audienceConfigured ? (
                      <span className="text-slate-300">configured</span>
                    ) : (
                      <span className="text-slate-500">not set</span>
                    )}
                  </td>
                  <td className="py-2.5 text-xs">
                    <a href={e.htmlPath} className="link-accent" target="_blank" rel="noopener noreferrer">
                      HTML
                    </a>
                    <span className="px-1.5 text-slate-600">·</span>
                    <a href={e.textPath} className="link-accent" target="_blank" rel="noopener noreferrer">
                      text
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {unconfigured.length > 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400">
            {unconfigured.length} edition{unconfigured.length === 1 ? " has" : "s have"} no Resend audience
            configured, so {unconfigured.length === 1 ? "it is" : "they are"} built and archived but not
            sent. Set <span className="font-mono text-slate-300">RESEND_AUDIENCE_&lt;LOCALE&gt;</span> to
            enable delivery — see <span className="font-mono text-slate-300">docs/newsletter.md</span>.
          </p>
        ) : null}
      </div>
    </div>
  );
}
