# ImmigrationClock — Data Pipeline

Python scripts that ingest public U.S. immigration, visa, enforcement, and
workforce datasets into the PostgreSQL database defined by the Prisma schema.

## What each script does

| Script | Source | Target table(s) |
| --- | --- | --- |
| `ingest_uscis_h1b.py` | USCIS H-1B Employer Data Hub | `Company`, `H1BEmployer` |
| `ingest_dol_lca.py` | DOL OFLC LCA disclosure files | `Company`, `LcaFiling` |
| `ingest_ice_stats.py` | ICE enforcement & removal stats | `IceEnforcement`, `DetentionStat` |
| `ingest_cbp_encounters.py` | CBP Nationwide Encounters | `CbpEncounter` |
| `ingest_dos_visa_stats.py` | Dept. of State visa statistics | `VisaIssuance` |
| `ingest_bls_wages.py` | BLS OEWS wages | `BlsWage` |
| `ingest_warn_layoffs.py` | State WARN Act notices | `WarnLayoff` |

Every script:

1. **Downloads or reads** the public dataset (where a stable URL exists), and
   **falls back to a representative sample** when offline so the pipeline never
   blocks.
2. **Cleans column names** (`clean_columns`) and **normalizes** dates
   (`parse_date`), employer names (`normalize_employer`), and state codes
   (`normalize_state`).
3. Stores the **source URL** and a **refresh timestamp** on every row.
4. **Loads** rows into PostgreSQL (`load_dataframe`) and writes a
   **`RefreshLog`** entry with the row count.
5. **Fails gracefully** — `run_ingestion` isolates each step so one bad source
   does not abort the run.

## Setup

```bash
# from the repo root
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate

pip install -r data_pipeline/requirements.txt
```

Set `DATABASE_URL` (and optionally `DIRECT_URL`) in your environment or `.env`.
The schema must already exist — run `npx prisma migrate dev` first.

## Run

```bash
# everything
python data_pipeline/run_all_ingestions.py

# a single source
python data_pipeline/ingest_uscis_h1b.py
```

### Dry-run mode

If `DATABASE_URL` is **not** set, scripts run in **DRY-RUN** mode: they download,
clean, and normalize the data and log the row counts they *would* write, without
touching a database. Useful for validating parsing offline.

## Scheduling

Schedule `run_all_ingestions.py` with cron, GitHub Actions, or a Vercel Cron job
that hits a small runner. Cadence guidance: CBP monthly, DOS monthly, DOL
quarterly, USCIS/ICE/BLS annually, WARN weekly. The `/admin/refresh-status` page
reflects the latest `RefreshLog` per source.

> **Note on real endpoints:** several agencies publish via dynamic export URLs or
> Excel workbooks that change each release. The scripts ship with the official
> landing-page URLs and offline samples; wire the exact file URL for each release
> into the `try_download_*` step as needed.
