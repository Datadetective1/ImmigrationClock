"""Shared utilities for ImmigrationClock ingestion scripts.

Each ingestion script:
  1. download or read a public dataset (with a graceful offline fallback)
  2. clean column names + normalize dates / employer names / state codes
  3. attach source URL + refresh timestamp
  4. load rows into the matching PostgreSQL table (created by `prisma migrate`)
  5. write a RefreshLog row and log the count
  6. never crash the whole pipeline — failures are logged and isolated
"""
from __future__ import annotations

import logging
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

try:
    import pandas as pd
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import Engine
except ImportError as exc:  # pragma: no cover
    print(
        "Missing dependencies. Install with:\n"
        "  pip install -r data_pipeline/requirements.txt",
        file=sys.stderr,
    )
    raise

# Load .env if python-dotenv is available (optional convenience).
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def database_url() -> Optional[str]:
    url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not url:
        return None
    # SQLAlchemy + psycopg2 want the postgresql:// scheme.
    return url.replace("postgres://", "postgresql://", 1)


def get_engine() -> Optional[Engine]:
    url = database_url()
    if not url:
        get_logger("db").warning(
            "DATABASE_URL not set - running in DRY-RUN mode (no rows written)."
        )
        return None
    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return engine
    except Exception as exc:  # pragma: no cover
        get_logger("db").error("Could not connect to database: %s", exc)
        return None


def now() -> datetime:
    return datetime.now(timezone.utc)


def gen_id() -> str:
    """Collision-resistant id compatible with Prisma's String @id columns."""
    return uuid.uuid4().hex


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------
def clean_columns(df: "pd.DataFrame") -> "pd.DataFrame":
    df = df.copy()
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"[^0-9a-z]+", "_", regex=True)
        .str.strip("_")
    )
    return df


_SUFFIXES = re.compile(
    r"\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|"
    r"plc|llp|lp|technologies|technology|solutions|services|usa|us|na)\b",
    re.IGNORECASE,
)


def normalize_employer(name: str) -> str:
    """Standardize an employer name for cross-dataset joins."""
    if not isinstance(name, str):
        return ""
    s = name.upper()
    s = re.sub(r"[.,&]", " ", s)
    s = _SUFFIXES.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


_STATE_TO_CODE = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE",
    "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID",
    "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS",
    "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS",
    "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
    "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX",
    "UTAH": "UT", "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA",
    "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY",
    "DISTRICT OF COLUMBIA": "DC",
}


def normalize_state(value: str) -> Optional[str]:
    if not isinstance(value, str):
        return None
    v = value.strip().upper()
    if len(v) == 2 and v.isalpha():
        return v
    return _STATE_TO_CODE.get(v)


def parse_date(value) -> Optional[datetime]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return pd.to_datetime(value, errors="coerce").to_pydatetime()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Download with graceful fallback
# ---------------------------------------------------------------------------
def try_download_csv(url: str, log: logging.Logger, **read_csv_kwargs) -> Optional["pd.DataFrame"]:
    """Attempt to read a remote CSV. Returns None on any failure (offline-safe)."""
    try:
        import requests  # local import so the module loads without requests

        log.info("Downloading %s", url)
        resp = requests.get(url, timeout=30, headers={"User-Agent": "ImmigrationClock/1.0"})
        resp.raise_for_status()
        from io import StringIO

        df = pd.read_csv(StringIO(resp.text), **read_csv_kwargs)
        log.info("Downloaded %d rows", len(df))
        return df
    except Exception as exc:
        log.warning("Download failed (%s). Falling back to sample rows.", exc)
        return None


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def ensure_data_source(engine: Engine, key: str, name: str, agency: str,
                       homepage_url: str, dataset_url: str, cadence: str,
                       description: str = "") -> Optional[str]:
    """Upsert a DataSource by unique key; return its id."""
    if engine is None:
        return None
    stmt = text(
        '''
        INSERT INTO "DataSource"
          (id, key, name, agency, description, "homepageUrl", "datasetUrl",
           cadence, "lastRefreshAt", "nextRefreshAt", "createdAt", "updatedAt")
        VALUES
          (:id, :key, :name, :agency, :description, :homepage, :dataset,
           :cadence, :now, :nxt, :now, :now)
        ON CONFLICT (key) DO UPDATE SET
          "lastRefreshAt" = EXCLUDED."lastRefreshAt",
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING id
        '''
    )
    with engine.begin() as conn:
        row = conn.execute(stmt, {
            "id": gen_id(), "key": key, "name": name, "agency": agency,
            "description": description, "homepage": homepage_url,
            "dataset": dataset_url, "cadence": cadence,
            "now": now(), "nxt": now(),
        }).first()
        return row[0] if row else None


def slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return s or "unknown"


def upsert_company(engine: Engine, name: str, source_name: str, source_url: str,
                   industry: Optional[str] = None, state_code: Optional[str] = None) -> Optional[str]:
    """Upsert a Company by normalizedName; return its id (or None in dry-run)."""
    if engine is None:
        return None
    normalized = normalize_employer(name)
    stmt = text(
        '''
        INSERT INTO "Company"
          (id, slug, name, "normalizedName", industry, "stateCode",
           "sourceName", "sourceUrl", "sourceUpdatedAt", "refreshDate",
           "createdAt", "updatedAt")
        VALUES
          (:id, :slug, :name, :norm, :industry, :state,
           :sname, :surl, :now, :now, :now, :now)
        ON CONFLICT ("normalizedName") DO UPDATE SET
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING id
        '''
    )
    with engine.begin() as conn:
        row = conn.execute(stmt, {
            "id": gen_id(), "slug": slugify(name), "name": name, "norm": normalized,
            "industry": industry, "state": state_code,
            "sname": source_name, "surl": source_url, "now": now(),
        }).first()
        return row[0] if row else None


def load_dataframe(engine: Engine, table: str, df: "pd.DataFrame", log: logging.Logger) -> int:
    """Append a DataFrame to a Prisma table, filling id/timestamps as needed."""
    if df is None or df.empty:
        log.info("Nothing to load into %s", table)
        return 0
    df = df.copy()
    n = len(df)
    if "id" not in df.columns:
        df["id"] = [gen_id() for _ in range(n)]
    ts = now()
    for col in ("createdAt", "updatedAt", "refreshDate"):
        if col not in df.columns:
            df[col] = ts

    if engine is None:
        log.info("[DRY-RUN] Would load %d rows into %s", n, table)
        return n

    df.to_sql(table, engine, if_exists="append", index=False, method="multi", chunksize=500)
    log.info("Loaded %d rows into %s", n, table)
    return n


def write_refresh_log(engine: Engine, data_source_id: Optional[str], status: str,
                      row_count: int, log: logging.Logger,
                      message: str = "", error: Optional[str] = None) -> None:
    if engine is None or data_source_id is None:
        return
    stmt = text(
        '''
        INSERT INTO "RefreshLog"
          (id, "dataSourceId", status, "rowCount", message, "errorMessage",
           "startedAt", "finishedAt", "refreshDate", "createdAt")
        VALUES
          (:id, :dsid, :status, :rows, :message, :error, :now, :now, :now, :now)
        '''
    )
    with engine.begin() as conn:
        conn.execute(stmt, {
            "id": gen_id(), "dsid": data_source_id, "status": status,
            "rows": row_count, "message": message, "error": error, "now": now(),
        })


def run_ingestion(name: str, fn) -> int:
    """Wrapper that isolates failures and always logs a result."""
    log = get_logger(name)
    try:
        count = fn()
        log.info("[OK] %s finished - %d rows", name, count)
        return count
    except Exception as exc:  # pragma: no cover
        log.exception("[FAIL] %s failed: %s", name, exc)
        return 0
