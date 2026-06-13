import Link from "next/link";

/** Strong-but-factual editorial block used between dashboard sections. */
export function HookSection({
  title,
  children,
  cta,
  accent = "accent",
}: {
  title: string;
  children: React.ReactNode;
  cta?: { href: string; label: string };
  accent?: "accent" | "red" | "amber";
}) {
  const bar =
    accent === "red"
      ? "from-status-red/60"
      : accent === "amber"
      ? "from-status-amber/60"
      : "from-accent/60";
  return (
    <section className="panel relative overflow-hidden p-6 sm:p-8">
      <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${bar} to-transparent`} />
      <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">{children}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-soft"
        >
          {cta.label}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </section>
  );
}
