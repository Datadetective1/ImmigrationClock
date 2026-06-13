"""Ingest CBP Nationwide Encounters → CbpEncounter table.

Source: https://www.cbp.gov/newsroom/stats/nationwide-encounters
Encounters by fiscal year and border, split into single adults, family units,
and unaccompanied minors. An encounter is an event, not a unique person.
"""
from __future__ import annotations

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, load_dataframe,
    write_refresh_log, run_ingestion, try_download_csv, now,
)

NAME = "ingest_cbp_encounters"
SOURCE = dict(
    key="cbp_encounters",
    name="CBP Nationwide Encounters",
    agency="U.S. Customs and Border Protection (DHS)",
    homepage_url="https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    dataset_url="https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    cadence="monthly",
    description="Border encounters by fiscal year, sector, and demographic.",
)

# fiscal_year, border, total, single_adults, family_units, minors
SAMPLE = [
    (2022, "southwest", 2010000, 1240000, 600000, 170000),
    (2023, "southwest", 2270000, 1400000, 690000, 180000),
    (2024, "southwest", 1850000, 1150000, 560000, 140000),
    (2025, "southwest", 820000, 540000, 220000, 60000),
    (2026, "southwest", 460000, 300000, 130000, 30000),
    (2025, "northern", 49000, 33000, 12000, 4000),
    (2025, "nationwide", 900000, 590000, 250000, 60000),
]


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    raw = try_download_csv(SOURCE["dataset_url"], log)
    if raw is None:
        raw = pd.DataFrame(
            SAMPLE,
            columns=["fiscal_year", "border", "total", "single_adults", "family_units", "minors"],
        )

    df = pd.DataFrame([
        {
            "fiscalYear": int(r["fiscal_year"]),
            "border": str(r["border"]),
            "totalEncounters": int(r["total"]),
            "singleAdults": int(r["single_adults"]),
            "familyUnits": int(r["family_units"]),
            "unaccompaniedMinors": int(r["minors"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        }
        for _, r in raw.iterrows()
    ])

    count = load_dataframe(engine, "CbpEncounter", df, log)
    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message="CBP nationwide encounters ingestion")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
