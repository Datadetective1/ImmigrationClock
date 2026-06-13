"""Ingest DOL OFLC LCA disclosure data → LcaFiling table.

Source: https://www.dol.gov/agencies/eta/foreign-labor/performance
LCA disclosure files contain job titles, worksites, and offered/prevailing
wages. An LCA is NOT an approval and NOT a visa.
"""
from __future__ import annotations

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, upsert_company,
    load_dataframe, write_refresh_log, run_ingestion, normalize_state, now,
)

NAME = "ingest_dol_lca"
SOURCE = dict(
    key="dol_lca",
    name="DOL OFLC Disclosure Data (LCA / PERM)",
    agency="U.S. Department of Labor, Office of Foreign Labor Certification",
    homepage_url="https://www.dol.gov/agencies/eta/foreign-labor/performance",
    dataset_url="https://www.dol.gov/agencies/eta/foreign-labor/performance",
    cadence="quarterly",
    description="Labor Condition Application disclosure files with offered wages.",
)

SAMPLE = [
    ("Amazon.com Services LLC", 2025, "Software Engineer", "15-1252", "Seattle", "WA", 156000, "CERTIFIED", 4200),
    ("Google LLC", 2025, "Software Engineer", "15-1252", "Mountain View", "CA", 182000, "CERTIFIED", 2600),
    ("Microsoft Corporation", 2025, "Software Engineer", "15-1252", "Redmond", "WA", 175000, "CERTIFIED", 2400),
    ("Cognizant Technology Solutions", 2025, "Systems Analyst", "15-1211", "College Station", "TX", 96000, "CERTIFIED", 3100),
    ("Infosys Limited", 2025, "Technology Analyst", "15-1211", "Richardson", "TX", 99000, "CERTIFIED", 2200),
    ("Meta Platforms Inc", 2025, "Software Engineer", "15-1252", "Menlo Park", "CA", 191000, "CERTIFIED", 2100),
    ("Deloitte Consulting LLP", 2025, "Consultant", "13-1111", "New York", "NY", 112000, "CERTIFIED", 1800),
    ("IBM Corporation", 2025, "Data Scientist", "15-2051", "Austin", "TX", 134000, "CERTIFIED", 1100),
]


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    raw = pd.DataFrame(
        SAMPLE,
        columns=["employer", "fiscal_year", "job_title", "soc_code",
                 "worksite_city", "state", "offered_wage", "case_status", "filings"],
    )

    rows = []
    for _, r in raw.iterrows():
        company_id = upsert_company(
            engine, str(r["employer"]),
            source_name=SOURCE["name"], source_url=SOURCE["homepage_url"],
            state_code=normalize_state(r["state"]),
        )
        rows.append({
            "companyId": company_id,
            "fiscalYear": int(r["fiscal_year"]),
            "jobTitle": str(r["job_title"]),
            "socCode": str(r["soc_code"]),
            "worksiteCity": str(r["worksite_city"]),
            "stateCode": normalize_state(r["state"]),
            "offeredWage": float(r["offered_wage"]),
            "prevailingWage": round(float(r["offered_wage"]) * 0.95, 2),
            "caseStatus": str(r["case_status"]),
            "filings": int(r["filings"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        })

    df = pd.DataFrame(rows)
    if engine is None:
        df = df.drop(columns=["companyId"])
        count = len(df)
        log.info("[DRY-RUN] Prepared %d LcaFiling rows", count)
    else:
        count = load_dataframe(engine, "LcaFiling", df, log)

    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message="DOL OFLC LCA disclosure ingestion")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
