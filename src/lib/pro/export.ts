// =============================================================================
// THE INTELLIGENCE BRIEF — saved research, as a document a subscriber can keep
//
// Every line is built from the record and its brief (src/lib/intelligence/
// brief.ts): the document's own title, its source and link, the published and
// stated effective dates, the dimensions the evidence supports with the quotes
// that support them, and the record's limitations. Nothing is summarised by a
// model and nothing is concluded about any person.
//
// Two renderings of one structure: Markdown, for notes and tickets, and a
// self-contained HTML page that prints cleanly — a browser's "Save as PDF" is
// the PDF export, with no server-side renderer to run or pay for.
// =============================================================================

import type { PublicChange } from "@/lib/intelligence/change";
import type { ImpactBrief } from "@/lib/intelligence/brief";

export interface BriefEntry {
  change: PublicChange;
  brief: ImpactBrief;
  /** Site-relative path to the change's page. */
  path: string;
}

export interface BriefDocument {
  title: string;
  generatedAt: string;
  origin: string;
  entries: BriefEntry[];
}

export const BRIEF_DISCLAIMER =
  "Information about published U.S. government material, compiled by ImmigrationClock. It is not legal " +
  "advice and makes no determination about any person or case. Records are classified automatically " +
  "unless marked reviewed; verify every item against its official source before relying on it.";

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed — not in force",
  scheduled: "Scheduled",
  in_force: "In force",
  decided: "Decided",
  superseded: "Superseded by a later record",
  informational: "Informational",
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function md(text: string): string {
  // Neutralise characters that would turn document text into Markdown syntax.
  return text.replace(/([\\`*_[\]<>|])/g, "\\$1");
}

export function renderBriefMarkdown(doc: BriefDocument): string {
  const origin = doc.origin.replace(/\/$/, "");
  const lines: string[] = [
    `# ${md(doc.title)}`,
    "",
    `Generated ${doc.generatedAt} · ${doc.entries.length} record${doc.entries.length === 1 ? "" : "s"}`,
    "",
    `> ${BRIEF_DISCLAIMER}`,
    "",
  ];
  for (const { change, brief, path } of doc.entries) {
    lines.push(
      `## ${md(change.title)}`,
      "",
      `- **Status:** ${statusLabel(change.status)}`,
      `- **Published:** ${change.publishedDate}`,
      `- **Effective:** ${md(brief.effective)}`,
      `- **Source:** [${md(change.source.name)}](${change.source.url})`,
      `- **ImmigrationClock record:** ${origin}${path}`,
      `- **Review:** ${change.verification === "approved" ? "Reviewed by a person against its source" : "Classified automatically; not reviewed by a person"}`,
      ""
    );
    if (change.summary) lines.push(md(change.summary), "");
    if (brief.potentialRelevance) lines.push(`**Potential relevance.** ${md(brief.potentialRelevance)}`, "");
    if (brief.affectedDimensions.length > 0) {
      lines.push("**Affected, per the document's own words:**", "");
      for (const d of brief.affectedDimensions) lines.push(`- ${d.label}: ${md(d.value)}`);
      lines.push("");
    }
    if (brief.evidence.length > 0) {
      lines.push("**Evidence:**", "");
      for (const e of brief.evidence) lines.push(`- ${e.dimension} — ${md(e.value)}: “${md(e.quote)}”`);
      lines.push("");
    }
    if (change.amendedBy.length > 0) {
      lines.push(`**Note:** a later record amends this one. Read the newer record first.`, "");
    }
    lines.push(`**Suggested next step.** ${md(brief.suggestedProfessionalAction)}`, "");
    if (brief.limitations.length > 0) {
      lines.push("**Limitations:**", "");
      for (const l of brief.limitations) lines.push(`- ${md(l)}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only http(s) links are rendered as links; anything else is printed as text. */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? esc(url) : null;
}

export function renderBriefHtml(doc: BriefDocument): string {
  const origin = doc.origin.replace(/\/$/, "");
  const sections = doc.entries
    .map(({ change, brief, path }) => {
      const source = safeHref(change.source.url);
      const evidence = brief.evidence
        .map((e) => `<li>${esc(e.dimension)} — ${esc(e.value)}: <q>${esc(e.quote)}</q></li>`)
        .join("");
      const dims = brief.affectedDimensions.map((d) => `<li>${esc(d.label)}: ${esc(d.value)}</li>`).join("");
      const limits = brief.limitations.map((l) => `<li>${esc(l)}</li>`).join("");
      return `<section>
<h2>${esc(change.title)}</h2>
<dl>
<dt>Status</dt><dd>${esc(statusLabel(change.status))}</dd>
<dt>Published</dt><dd>${esc(change.publishedDate)}</dd>
<dt>Effective</dt><dd>${esc(brief.effective)}</dd>
<dt>Source</dt><dd>${source ? `<a href="${source}">${esc(change.source.name)}</a>` : esc(change.source.name)}</dd>
<dt>Record</dt><dd><a href="${esc(origin + path)}">${esc(origin + path)}</a></dd>
<dt>Review</dt><dd>${change.verification === "approved" ? "Reviewed by a person against its source" : "Classified automatically; not reviewed by a person"}</dd>
</dl>
${change.summary ? `<p>${esc(change.summary)}</p>` : ""}
${brief.potentialRelevance ? `<p><strong>Potential relevance.</strong> ${esc(brief.potentialRelevance)}</p>` : ""}
${dims ? `<h3>Affected, per the document's own words</h3><ul>${dims}</ul>` : ""}
${evidence ? `<h3>Evidence</h3><ul>${evidence}</ul>` : ""}
${change.amendedBy.length > 0 ? `<p class="warn">A later record amends this one. Read the newer record first.</p>` : ""}
<p><strong>Suggested next step.</strong> ${esc(brief.suggestedProfessionalAction)}</p>
${limits ? `<h3>Limitations</h3><ul class="limits">${limits}</ul>` : ""}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(doc.title)}</title>
<style>
body{font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff;max-width:760px;margin:0 auto;padding:24px 16px}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:0 0 8px}h3{font-size:.95rem;margin:14px 0 4px}
.meta{color:#555;font-size:.85rem}.disclaimer{border-left:3px solid #999;padding:6px 12px;color:#333;background:#f6f6f6;font-size:.85rem}
section{border-top:1px solid #ddd;padding:18px 0;break-inside:avoid-page}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;font-size:.9rem;margin:0 0 8px}dt{color:#555}dd{margin:0;overflow-wrap:anywhere}
q{font-style:italic}.limits{color:#444;font-size:.85rem}.warn{color:#8a4b00}
a{color:#0b57d0}.noprint{margin:12px 0}
@media print{.noprint{display:none}body{padding:0}a{color:#111}}
</style></head><body>
<h1>${esc(doc.title)}</h1>
<p class="meta">Generated ${esc(doc.generatedAt)} · ${doc.entries.length} record${doc.entries.length === 1 ? "" : "s"}</p>
<p class="noprint"><button onclick="window.print()">Print or save as PDF</button></p>
<p class="disclaimer">${esc(BRIEF_DISCLAIMER)}</p>
${sections || "<p>No records.</p>"}
</body></html>`;
}
