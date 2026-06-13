"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatNumber, formatCurrency, formatRate } from "@/lib/format";
import { DownloadCsvButton } from "./DownloadCsvButton";

export interface EmployerRow {
  slug: string;
  name: string;
  stateCode?: string;
  industry?: string;
  approvals: number;
  denials: number;
  approvalRate: number;
  avgWage: number;
  lcaFilings?: number;
}

type SortKey = "approvals" | "denials" | "approvalRate" | "avgWage";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "approvals", label: "Approvals" },
  { key: "denials", label: "Denials" },
  { key: "approvalRate", label: "Approval rate" },
  { key: "avgWage", label: "Avg offered wage" },
];

export function EmployerTable({
  rows,
  caption,
  filename = "h1b-employers",
}: {
  rows: EmployerRow[];
  caption?: string;
  filename?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("approvals");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return copy;
  }, [rows, sortKey, asc]);

  const csvRows = sorted.map((r, i) => ({
    rank: i + 1,
    employer: r.name,
    state: r.stateCode ?? "",
    approvals: r.approvals,
    denials: r.denials,
    approval_rate: formatRate(r.approvalRate),
    avg_offered_wage_usd: r.avgWage,
  }));

  function toggle(key: SortKey) {
    if (key === sortKey) setAsc((a) => !a);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {caption ? <p className="text-sm text-slate-400">{caption}</p> : <span />}
        <DownloadCsvButton rows={csvRows} filename={filename} />
      </div>
      <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Employer</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    {c.label}
                    <span className={`text-[10px] ${sortKey === c.key ? "text-accent" : "text-slate-600"}`}>
                      {sortKey === c.key ? (asc ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.slug} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-slate-500">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/company/${r.slug}`} className="font-medium text-white hover:text-accent-soft">
                    {r.name}
                  </Link>
                  {r.stateCode ? (
                    <span className="ml-2 text-xs text-slate-500">{r.stateCode}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-white">{formatNumber(r.approvals)}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatNumber(r.denials)}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatRate(r.approvalRate)}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatCurrency(r.avgWage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
