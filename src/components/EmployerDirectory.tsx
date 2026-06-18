"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EMPLOYERS, EMPLOYERS_META, displayEmployer, type DirectoryEmployer } from "@/lib/employers";
import { formatNumber, formatRate } from "@/lib/format";

type SortKey = "approvals" | "denials" | "approvalRate" | "name";
const MAX_ROWS = 200;

export function EmployerDirectory() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>("approvals");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? EMPLOYERS.filter((e) => e.name.toLowerCase().includes(s)) : EMPLOYERS;
    const sorted = [...base].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b[sort] as number) - (a[sort] as number);
    });
    return sorted;
  }, [q, sort]);

  const shown = filtered.slice(0, MAX_ROWS);

  const sortBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        sort === key ? "bg-accent/15 text-accent" : "text-slate-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850/80 px-3 py-3 shadow-card focus-within:border-accent/50">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${formatNumber(EMPLOYERS_META.count)} H-1B sponsors by name…`}
          aria-label="Search employers"
          className="w-full bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          {formatNumber(filtered.length)} {q.trim() ? "matches" : "employers"}
          {filtered.length > MAX_ROWS ? ` · showing top ${MAX_ROWS}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-slate-500">Sort:</span>
          {sortBtn("approvals", "Approvals")}
          {sortBtn("approvalRate", "Approval rate")}
          {sortBtn("name", "Name")}
        </div>
      </div>

      <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Employer</th>
              <th className="px-4 py-3 text-right font-medium">Approvals</th>
              <th className="px-4 py-3 text-right font-medium">Denials</th>
              <th className="px-4 py-3 text-right font-medium">Approval rate</th>
              <th className="px-4 py-3 font-medium">Top state</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e: DirectoryEmployer, i) => (
              <tr key={e.slug} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/employer/${e.slug}`} className="text-white transition-colors hover:text-accent-soft">
                    {displayEmployer(e.name)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white">{formatNumber(e.approvals)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-400">{formatNumber(e.denials)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300">{formatRate(e.approvalRate)}</td>
                <td className="px-4 py-2.5 text-slate-400">{e.topState || "—"}</td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                  No employers match &ldquo;{q}&rdquo;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Reported USCIS H-1B Employer Data Hub figures for FY{EMPLOYERS_META.fiscalYear} (initial + continuing
        approvals/denials). Directory covers the {formatNumber(EMPLOYERS_META.count)} employers with at least{" "}
        {EMPLOYERS_META.minApprovals} approvals.{" "}
        <a href={EMPLOYERS_META.sourceUrl} target="_blank" rel="noopener noreferrer" className="link-accent">
          Source ◆ {EMPLOYERS_META.sourceName}
        </a>
      </p>
    </div>
  );
}
