import Link from "next/link";

/** Neutral caveat callout used throughout to keep claims honest. */
export function MethodologyNote({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "warning";
}) {
  const tone =
    variant === "warning"
      ? "border-status-amber/30 bg-status-amber/5"
      : "border-accent/20 bg-accent/5";
  return (
    <div className={`rounded-xl border ${tone} p-4 text-sm leading-relaxed text-slate-300`}>
      <span className="mr-2 font-semibold text-white">Methodology note:</span>
      {children}{" "}
      <Link href="/methodology" className="link-accent whitespace-nowrap">
        Read the full methodology →
      </Link>
    </div>
  );
}
