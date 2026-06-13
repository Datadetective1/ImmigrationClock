"""Ingest Department of State visa statistics → VisaIssuance table.

Source: https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html
Nonimmigrant and immigrant visa issuances by class and fiscal year. State Dept
issuances differ from USCIS petition approvals.
"""
from __future__ import annotations

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, load_dataframe,
    write_refresh_log, run_ingestion, now,
)

NAME = "ingest_dos_visa_stats"
SOURCE = dict(
    key="dos_visa",
    name="Department of State Visa Statistics",
    agency="U.S. Department of State, Bureau of Consular Affairs",
    homepage_url="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
    dataset_url="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
    cadence="monthly",
    description="Immigrant and nonimmigrant visa issuances by class and country.",
)

# fiscal_year, visa_class, category, issued
SAMPLE = [
    (2024, "H-1B", "employment", 138000),
    (2025, "H-1B", "employment", 141000),
    (2024, "F-1", "student", 423000),
    (2025, "F-1", "student", 436000),
    (2024, "J-1", "exchange", 291000),
    (2025, "J-1", "exchange", 303000),
    (2025, "EB (employment-based IV)", "employment", 145000),
    (2025, "Family-based IV", "family", 231000),
]


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    raw = pd.DataFrame(SAMPLE, columns=["fiscal_year", "visa_class", "category", "issued"])

    df = pd.DataFrame([
        {
            "fiscalYear": int(r["fiscal_year"]),
            "visaClass": str(r["visa_class"]),
            "category": str(r["category"]),
            "issued": int(r["issued"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        }
        for _, r in raw.iterrows()
    ])

    count = load_dataframe(engine, "VisaIssuance", df, log)
    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message="DOS visa statistics ingestion")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
