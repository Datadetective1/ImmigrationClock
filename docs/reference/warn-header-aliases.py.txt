"""Ingest state WARN Act layoff notices → WarnLayoff table.

Full-coverage path: the Big Local News `warn-scraper` project
(https://github.com/biglocalnews/warn-scraper) maintains parsers for 40+ state
WARN portals (HTML, Excel, and PDF). We shell out to its CLI, then normalize the
per-state CSVs — which have *heterogeneous* columns — through a header-alias
mapper, link each notice to a Company (for cross-dataset joins against H-1B / LCA),
dedupe, and load.

If `warn-scraper` is not installed (or produces nothing — e.g. offline), we fall
back to a small representative SAMPLE so the pipeline never blocks, matching the
other ingestion scripts.

Source: state workforce agency WARN portals; federal overview at
https://www.dol.gov/agencies/eta/layoffs/warn
WARN notices say nothing about who, if anyone, was hired afterward — they do not
prove replacement.
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, load_dataframe,
    write_refresh_log, run_ingestion, normalize_state, normalize_employer,
    parse_date, upsert_company, now,
)

NAME = "ingest_warn_layoffs"
SOURCE = dict(
    key="warn_layoffs",
    name="State WARN Act Layoff Notices",
    agency="State labor / workforce agencies (WARN Act filings)",
    homepage_url="https://www.dol.gov/agencies/eta/layoffs/warn",
    dataset_url="https://www.dol.gov/agencies/eta/layoffs/warn",
    cadence="weekly",
    description="Employer layoff and plant-closing notices with employee counts.",
)

# States to scrape via warn-scraper. Override with WARN_STATES="tx,or,ca,...".
# Defaults to the states with the most WARN volume / cleanest parsers.
DEFAULT_STATES = [
    "tx", "or", "ca", "ny", "wa", "il", "nj", "oh", "va", "fl", "co", "ga",
    "pa", "mn", "mi", "wi", "in", "mo", "nc", "md", "ct", "az", "tn", "ks",
]

# biglocalnews CSVs use per-state column names. Map them by fuzzy header aliases
# (matched against cleaned, lower_snake headers). First alias present wins.
EMPLOYER_ALIASES = [
    "company", "company_name", "employer", "employer_name", "job_site_name",
    "business_name", "affected_company", "organization",
]
CITY_ALIASES = ["city", "city_name", "worksite_city", "location_city"]
STATE_ALIASES = ["state", "state_code", "st"]
NOTICE_DATE_ALIASES = [
    "notice_date", "received_date", "date_received", "warn_date",
    "date_of_notice", "initial_report_date", "notice_received_date", "date",
]
EFFECTIVE_DATE_ALIASES = [
    "effective_date", "layoff_date", "layoff_start_date", "separation_date",
    "closure_date", "layoff_begin_date", "effective_layoff_date",
]
EMPLOYEE_ALIASES = [
    "employees_affected", "affected_employees", "number_affected",
    "total_layoff_number", "employees", "laid_off", "num_employees",
    "number_of_employees_affected", "workers_affected", "impact", "affected",
]
REASON_ALIASES = ["reason", "layoff_type", "closure_type", "notice_type", "type"]

# employer, state, city, notice_date, employees, reason
SAMPLE = [
    ("Amazon.com Services LLC", "WA", "Seattle", "2024-01-18", 3100, "Workforce reduction"),
    ("Microsoft Corporation", "WA", "Redmond", "2025-05-13", 3000, "Workforce reduction"),
    ("Meta Platforms Inc", "CA", "Menlo Park", "2023-03-14", 4000, "Workforce reduction"),
    ("Google LLC", "CA", "Mountain View", "2023-01-20", 6000, "Workforce reduction"),
    ("IBM Corporation", "TX", "Austin", "2023-02-01", 1300, "Workforce reduction"),
    ("Boeing", "WA", "Everett", "2025-04-15", 2200, "Workforce reduction"),
    ("Wells Fargo", "CA", "San Francisco", "2024-04-15", 1100, "Workforce reduction"),
    ("Charter Communications", "TX", "Austin", "2025-04-15", 900, "Workforce reduction"),
]


def _clean_cols(cols) -> list[str]:
    out = []
    for c in cols:
        s = str(c).strip().lower()
        s = "".join(ch if ch.isalnum() else "_" for ch in s)
        while "__" in s:
            s = s.replace("__", "_")
        out.append(s.strip("_"))
    return out


def _pick(cleaned: list[str], aliases: list[str]) -> int | None:
    """Return the column index whose cleaned header matches an alias."""
    for a in aliases:
        if a in cleaned:
            return cleaned.index(a)
    # Loose contains-match as a fallback (e.g. "company_name_dba").
    for a in aliases:
        for i, c in enumerate(cleaned):
            if a in c:
                return i
    return None


def _to_int(v) -> int:
    try:
        digits = "".join(ch for ch in str(v) if ch.isdigit())
        return int(digits) if digits else 0
    except Exception:
        return 0


def run_warn_scraper(log) -> list[dict]:
    """Run the warn-scraper CLI and normalize every per-state CSV it produces.

    Returns [] if the CLI is unavailable or yields nothing (offline-safe).
    """
    exe = shutil.which("warn-scraper")
    if not exe:
        log.warning("warn-scraper not installed; skipping full-coverage scrape "
                    "(pip install warn-scraper). Falling back to sample.")
        return []

    states = [s.strip().lower() for s in
              os.getenv("WARN_STATES", ",".join(DEFAULT_STATES)).split(",") if s.strip()]
    tmp = tempfile.mkdtemp(prefix="warn_scraper_")
    log.info("Running warn-scraper for %d states → %s", len(states), tmp)
    try:
        subprocess.run(
            [exe, "--data-dir", tmp, *states],
            check=False, capture_output=True, text=True, timeout=1800,
        )
    except Exception as exc:  # pragma: no cover - environment dependent
        log.warning("warn-scraper run failed (%s); falling back to sample.", exc)
        return []

    csvs = glob.glob(os.path.join(tmp, "**", "*.csv"), recursive=True)
    if not csvs:
        log.warning("warn-scraper produced no CSVs; falling back to sample.")
        return []

    rows: list[dict] = []
    for path in csvs:
        state_from_file = os.path.splitext(os.path.basename(path))[0].upper()
        try:
            raw = pd.read_csv(path, dtype=str, keep_default_na=False)
        except Exception as exc:
            log.warning("Could not read %s (%s); skipping.", path, exc)
            continue
        if raw.empty:
            continue
        cleaned = _clean_cols(raw.columns)
        i_emp = _pick(cleaned, EMPLOYER_ALIASES)
        if i_emp is None:
            log.warning("%s: no employer column found (headers=%s); skipping.",
                        path, cleaned)
            continue
        i_city = _pick(cleaned, CITY_ALIASES)
        i_state = _pick(cleaned, STATE_ALIASES)
        i_notice = _pick(cleaned, NOTICE_DATE_ALIASES)
        i_eff = _pick(cleaned, EFFECTIVE_DATE_ALIASES)
        i_emps = _pick(cleaned, EMPLOYEE_ALIASES)
        i_reason = _pick(cleaned, REASON_ALIASES)

        def cell(r, idx):
            return r.iloc[idx] if idx is not None and idx < len(r) else None

        for _, r in raw.iterrows():
            employer = str(cell(r, i_emp) or "").strip()
            if not employer:
                continue
            state = normalize_state(str(cell(r, i_state) or "")) or normalize_state(state_from_file)
            rows.append({
                "employer": employer,
                "state": state,
                "city": (str(cell(r, i_city)).strip() or None) if i_city is not None else None,
                "notice_date": cell(r, i_notice),
                "effective_date": cell(r, i_eff),
                "employees": _to_int(cell(r, i_emps)),
                "reason": (str(cell(r, i_reason)).strip() or None) if i_reason is not None else None,
            })
        log.info("%s: parsed %d rows", os.path.basename(path), len(raw))

    log.info("warn-scraper: %d normalized notices from %d state files",
             len(rows), len(csvs))
    return rows


def _dedupe(rows: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for r in rows:
        key = (normalize_employer(r["employer"]), r.get("state"),
               str(r.get("notice_date") or ""), r.get("employees", 0))
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    rows = run_warn_scraper(log)
    if not rows:
        rows = [
            {"employer": e, "state": s, "city": c, "notice_date": d,
             "effective_date": None, "employees": n, "reason": reason}
            for (e, s, c, d, n, reason) in SAMPLE
        ]
        log.info("Using %d sample notices.", len(rows))

    rows = _dedupe(rows)

    records = []
    for r in rows:
        # Link each notice to a Company so WARN joins against H-1B / LCA. In
        # dry-run (no DB) upsert_company returns None and the link stays null.
        company_id = upsert_company(
            engine, r["employer"], SOURCE["name"], SOURCE["homepage_url"],
            state_code=r.get("state"),
        )
        records.append({
            "companyId": company_id,
            "employerName": str(r["employer"]),
            "stateCode": r.get("state"),
            "city": r.get("city"),
            "noticeDate": parse_date(r.get("notice_date")) or now(),
            "effectiveDate": parse_date(r.get("effective_date")),
            "employeesAffected": int(r.get("employees") or 0),
            "reason": r.get("reason"),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        })

    df = pd.DataFrame(records)
    count = load_dataframe(engine, "WarnLayoff", df, log)
    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message=f"WARN layoff notices ingestion ({len(rows)} notices)")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
