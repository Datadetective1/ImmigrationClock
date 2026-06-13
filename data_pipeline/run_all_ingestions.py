"""Run every ImmigrationClock ingestion in sequence.

Usage:
    python data_pipeline/run_all_ingestions.py

Each ingestion is isolated: one failure is logged and the rest still run.
Without DATABASE_URL the scripts run in DRY-RUN mode (no rows written), which is
handy for verifying parsing/normalization offline.
"""
from __future__ import annotations

import time

from common import get_logger, run_ingestion

import ingest_uscis_h1b
import ingest_dol_lca
import ingest_ice_stats
import ingest_cbp_encounters
import ingest_dos_visa_stats
import ingest_bls_wages
import ingest_warn_layoffs

PIPELINE = [
    ("ingest_uscis_h1b", ingest_uscis_h1b.ingest),
    ("ingest_dol_lca", ingest_dol_lca.ingest),
    ("ingest_ice_stats", ingest_ice_stats.ingest),
    ("ingest_cbp_encounters", ingest_cbp_encounters.ingest),
    ("ingest_dos_visa_stats", ingest_dos_visa_stats.ingest),
    ("ingest_bls_wages", ingest_bls_wages.ingest),
    ("ingest_warn_layoffs", ingest_warn_layoffs.ingest),
]


def main() -> None:
    log = get_logger("run_all")
    start = time.time()
    total = 0
    results = []
    for name, fn in PIPELINE:
        count = run_ingestion(name, fn)
        total += count
        results.append((name, count))

    log.info("-" * 56)
    for name, count in results:
        log.info("  %-26s %8d rows", name, count)
    log.info("-" * 56)
    log.info("Total: %d rows across %d sources in %.1fs",
             total, len(PIPELINE), time.time() - start)


if __name__ == "__main__":
    main()
