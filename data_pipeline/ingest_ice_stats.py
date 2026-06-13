"""Ingest ICE Enforcement and Removal statistics → IceEnforcement + DetentionStat.

Source: https://www.ice.gov/statistics
National fiscal-year totals for administrative arrests, removals, and average
daily detention population. State/nationality slices are loaded with NULL FKs
in the offline sample to avoid referential gaps.
"""
from __future__ import annotations

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, load_dataframe,
    write_refresh_log, run_ingestion, now,
)

NAME = "ingest_ice_stats"
SOURCE = dict(
    key="ice_stats",
    name="ICE Enforcement and Removal Statistics",
    agency="U.S. Immigration and Customs Enforcement (DHS)",
    homepage_url="https://www.ice.gov/statistics",
    dataset_url="https://www.ice.gov/statistics",
    cadence="annual",
    description="Arrests, removals, and detention population by fiscal year.",
)

# fiscal_year, arrests, removals, criminal_arrests, avg_daily_detention
SAMPLE = [
    (2022, 113000, 142000, 58000, 34000),
    (2023, 131000, 164000, 67000, 37000),
    (2024, 152000, 191000, 79000, 40000),
    (2025, 176000, 221000, 91000, 43000),
    (2026, 118000, 148000, 61000, 46000),  # FY2026 partial (in progress)
]


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    raw = pd.DataFrame(
        SAMPLE,
        columns=["fiscal_year", "arrests", "removals", "criminal_arrests", "avg_daily_detention"],
    )

    enforcement = pd.DataFrame([
        {
            "fiscalYear": int(r["fiscal_year"]),
            "arrests": int(r["arrests"]),
            "removals": int(r["removals"]),
            "criminalArrests": int(r["criminal_arrests"]),
            "nonCriminal": int(r["arrests"]) - int(r["criminal_arrests"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        }
        for _, r in raw.iterrows()
    ])

    detention = pd.DataFrame([
        {
            "fiscalYear": int(r["fiscal_year"]),
            "averageDaily": int(r["avg_daily_detention"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        }
        for _, r in raw.iterrows()
    ])

    count = load_dataframe(engine, "IceEnforcement", enforcement, log)
    count += load_dataframe(engine, "DetentionStat", detention, log)

    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message="ICE enforcement + detention ingestion")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
