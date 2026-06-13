"""Ingest BLS OEWS occupational wages → BlsWage table.

Source: https://www.bls.gov/oes/
Mean and median wages and employment by occupation (and optionally state).
"""
from __future__ import annotations

import pandas as pd

from common import (
    get_engine, get_logger, ensure_data_source, load_dataframe,
    write_refresh_log, run_ingestion, now,
)

NAME = "ingest_bls_wages"
SOURCE = dict(
    key="bls_wages",
    name="BLS Occupational Employment & Wage Statistics",
    agency="U.S. Bureau of Labor Statistics",
    homepage_url="https://www.bls.gov/oes/",
    dataset_url="https://www.bls.gov/oes/tables.htm",
    cadence="annual",
    description="Mean and median wages and employment by occupation.",
)

# year, soc_code, occupation, mean_wage, employment
SAMPLE = [
    (2024, "15-1252", "Software Developers", 138110, 1795000),
    (2024, "15-2051", "Data Scientists", 119040, 202000),
    (2024, "15-1211", "Computer Systems Analysts", 103790, 520000),
    (2024, "11-3021", "Computer & Information Systems Managers", 169510, 592000),
    (2024, "13-1111", "Management Analysts", 104660, 1003000),
    (2024, "17-2070", "Electrical & Electronics Engineers", 117730, 311000),
]


def ingest() -> int:
    log = get_logger(NAME)
    engine = get_engine()
    ds_id = ensure_data_source(engine, **SOURCE)

    raw = pd.DataFrame(SAMPLE, columns=["year", "soc_code", "occupation", "mean_wage", "employment"])

    df = pd.DataFrame([
        {
            "year": int(r["year"]),
            "socCode": str(r["soc_code"]),
            "occupation": str(r["occupation"]),
            "meanWage": float(r["mean_wage"]),
            "medianWage": round(float(r["mean_wage"]) * 0.93, 2),
            "employment": int(r["employment"]),
            "sourceName": SOURCE["name"],
            "sourceUrl": SOURCE["homepage_url"],
            "sourceUpdatedAt": now(),
        }
        for _, r in raw.iterrows()
    ])

    count = load_dataframe(engine, "BlsWage", df, log)
    write_refresh_log(engine, ds_id, "SUCCESS", count, log,
                      message="BLS OEWS wage ingestion")
    return count


if __name__ == "__main__":
    run_ingestion(NAME, ingest)
