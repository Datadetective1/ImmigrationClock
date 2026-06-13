import Link from "next/link";
import { ShareButton } from "./ShareButton";

export interface Crumb {
  href: string;
  label: string;
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
      <div className="container-page py-8 sm:py-10">
        {crumbs && crumbs.length > 0 ? (
          <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1.5">
                <Link href={c.href} className="hover:text-slate-300">
                  {c.label}
                </Link>
                {i < crumbs.length - 1 ? <span className="text-slate-700">/</span> : null}
              </span>
            ))}
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
