"use client";

/** Generic "Download CSV" button. Serializes an array of flat objects. */
export function DownloadCsvButton<T extends Record<string, unknown>>({
  rows,
  filename,
  label = "Download CSV",
}: {
  rows: T[];
  filename: string;
  label?: string;
}) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-accent/40 hover:text-accent-soft"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
      </svg>
      {label}
    </button>
  );
}
