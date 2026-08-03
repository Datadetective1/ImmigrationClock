import { jsonLd } from "@/lib/seo";
export interface FaqItem {
  q: string;
  /** Plain text — rendered visibly AND used as the FAQPage answer for rich results. */
  a: string;
}

/**
 * Visible FAQ (native <details> accordion, collapsed by default for a calm layout)
 * that also emits FAQPage JSON-LD. Targets "People Also Ask" / FAQ rich results
 * for high-intent queries like "does {company} sponsor H-1B?". Google requires the
 * answer text to be visible on the page, which it is.
 */
export function Faq({ items, heading = "Frequently asked questions" }: { items: FaqItem[]; heading?: string }) {
  if (!items.length) return null;

  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  return (
    <section className="panel panel-pad">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqData) }}
      />
      <h2 className="mb-1 text-lg font-bold text-white">{heading}</h2>
      <div className="divide-y divide-white/5">
        {items.map((it, i) => (
          <details key={i} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-100 marker:content-['']">
              {it.q}
              <span
                aria-hidden
                className="shrink-0 text-lg font-normal leading-none text-slate-500 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
