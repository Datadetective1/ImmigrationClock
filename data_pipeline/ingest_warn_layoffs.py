"""Ingest state WARN Act layoff notices → WarnLayoff table.

Source: state workforce agency WARN portals (aggregated); federal overview at
https://www.dol.gov/agencies/eta/layoffs/warn
Employer layoff/closure notices with employee counts. WARN notices say nothing
about who, if anyone, was hired afterward — they do not prove replacement.
"""
from __future__ import annotations

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, load_dataframe,
    write_refresh_log, run_ingestion, normalize_state, parse_date, now,
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


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    raw = pd.DataFrame(
        SAMPLE,
        columns=["employer", "state", "city", "notice_date", "employees", "reason"],
    )

    df = pd.DataFrame([
        {
            "employerName": str(r["employer"]),
            "stateCode": normalize_state(r["state"]),
            "city": str(r["city"]),
            "noticeDate": parse_date(r["notice_date"]),
            "employeesAffected": int(r["employees"]),
            "reason": str(r["reason"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        }
        for _, r in raw.iterrows()
    ])

    count = load_dataframe(engine, "WarnLayoff", df, log)
    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message="WARN layoff notices ingestion")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
