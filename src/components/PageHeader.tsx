import Link from "next/link";
import { ShareButton } from "./ShareButton";
import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/seo";

export interface Crumb {
  href: string;
  label: string;
}

/** BreadcrumbList JSON-LD so search engines show the page's breadcrumb trail. */
function BreadcrumbJsonLd({ crumbs }: { crumbs: Crumb[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: `${SITE.url}${c.href}`,
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
  share,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  crumbs?: Crumb[];
  share?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-white/5 bg-ink-900/40">
      {crumbs && crumbs.length > 0 ? <BreadcrumbJsonLd crumbs={crumbs} /> : null}
      <div className="container-page py-8 sm:py-10">
        {crumbs && crumbs.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"
          >
            {crumbs.map((c, i) => {
              const isCurrent = i === crumbs.length - 1;
              return (
                <span key={c.href} className="flex items-center gap-1.5">
                  {/* The last crumb is the page you are already on. As a link it
                      was an extra tab stop that navigated nowhere, and nothing
                      told assistive tech which entry was current. The JSON-LD
                      below still lists it — structured data wants the full
                      trail. */}
                  {isCurrent ? (
                    <span aria-current="page" className="text-slate-400">
                      {c.label}
                    </span>
                  ) : (
                    <Link href={c.href} className="hover:text-slate-300">
                      {c.label}
                    </Link>
                  )}
                  {!isCurrent ? <span className="text-slate-700">/</span> : null}
                </span>
              );
            })}
          </nav>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
            {description ? (
              <p className="mt-3 text-base leading-relaxed text-slate-400">{description}</p>
            ) : null}
          </div>
          {share ? <ShareButton title={title} /> : null}
        </div>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </header>
  );
}
