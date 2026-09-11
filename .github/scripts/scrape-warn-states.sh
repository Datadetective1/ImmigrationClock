#!/usr/bin/env bash
#
# Scrape state WARN portals with biglocalnews/warn-scraper — ONE PROCESS PER STATE.
#
#   bash .github/scripts/scrape-warn-states.sh <data-dir> <postal code>...
#
# Environment:
#   WARN_STATE_TIMEOUT   seconds allowed per state before it is killed (default 420)
#
# Why one process per state. The warn-scraper CLI loops over the states it is
# given with no error handling between them: the first exception ends the
# process, and every state after it is never attempted. On 2026-09-11 the job
# asked for eleven states; Georgia's portal hung on a TCP connect, the process
# died on the traceback, and Minnesota, Colorado, Massachusetts, Kansas, Indiana
# and Wisconsin were never run. `|| true` then reported the step green. The site
# showed five states and nothing said why.
#
# Here each state gets its own invocation, its own timeout, its own log, and a
# status record the normalizer reads. A state that fails costs itself and
# nothing else.
#
# Outputs, under <data-dir>:
#   <st>.csv            the scraper's file — present ONLY for a state that
#                       exited 0 and wrote at least one data row. A partial
#                       file from a crash or timeout would otherwise be
#                       indistinguishable from complete coverage, so it is
#                       removed and the normalizer keeps the state's last good
#                       snapshot instead.
#   status/<st>.json    {state, status, rows, exitCode, seconds, reason, scrapedAt}
#                       status ∈ ok | empty | timeout | failed
#   logs/<st>.log       full scraper output for that state

set -uo pipefail # deliberately no -e: one state's failure must not end the loop

DATA_DIR="${1:-}"
shift || true
if [ -z "$DATA_DIR" ] || [ "$#" -eq 0 ]; then
  echo "::error::usage: scrape-warn-states.sh <data-dir> <postal code>..."
  exit 2
fi
TIMEOUT="${WARN_STATE_TIMEOUT:-420}"

mkdir -p "$DATA_DIR/cache" "$DATA_DIR/logs" "$DATA_DIR/status"

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$*" >>"$GITHUB_STEP_SUMMARY"
  fi
}

VERSION="$(pip show warn-scraper 2>/dev/null | awk '/^Version:/{print $2}')"
echo "warn-scraper ${VERSION:-unknown} · per-state timeout ${TIMEOUT}s · states: $*"
summary "| State | Outcome | Rows | Time | Note |"
summary "|---|---|---:|---:|---|"

# Data rows in a CSV, counted by a real CSV reader so quoted newlines and a
# missing trailing newline do not miscount. 0 for a missing or header-only file.
count_rows() {
  python3 - "$1" <<'PY'
import csv, sys
try:
    with open(sys.argv[1], newline="", encoding="utf-8", errors="replace") as f:
        n = sum(1 for _ in csv.reader(f))
    print(max(0, n - 1))
except FileNotFoundError:
    print(0)
PY
}

OK=0
TOTAL=0
for raw in "$@"; do
  s="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  S="$(printf '%s' "$s" | tr '[:lower:]' '[:upper:]')"
  TOTAL=$((TOTAL + 1))
  csv="$DATA_DIR/$s.csv"
  log="$DATA_DIR/logs/$s.log"
  rm -f "$csv"

  echo "::group::$S"
  start="$(date +%s)"
  # -k 30: if the scraper ignores SIGTERM (Selenium children do), SIGKILL 30s later.
  timeout -k 30 "$TIMEOUT" xvfb-run -a warn-scraper --data-dir "$DATA_DIR" --cache-dir "$DATA_DIR/cache" -l warning "$s" >"$log" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  rows="$(count_rows "$csv")"

  if [ "$rc" -eq 0 ] && [ "$rows" -gt 0 ]; then
    status=ok
    OK=$((OK + 1))
  elif [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    status=timeout
  elif [ "$rc" -eq 0 ]; then
    # Exit 0 with nothing usable. Maryland did this in production: a CSV whose
    # header row was empty. Not data, and not a success either.
    status=empty
  else
    status=failed
  fi

  reason=""
  if [ "$status" != ok ]; then
    reason="$(grep -vE '^[[:space:]]*$' "$log" 2>/dev/null | tail -n 1 | cut -c1-240)"
    [ "$status" = timeout ] && reason="killed after ${TIMEOUT}s${reason:+ — last output: $reason}"
    [ "$status" = empty ] && [ -z "$reason" ] && reason="exit 0 but no data rows"
    rm -f "$csv"
    echo "--- last 20 lines of $log:"
    tail -n 20 "$log" 2>/dev/null || true
  fi
  echo "$S: $status (${rows} rows, ${secs}s, exit $rc)"
  echo "::endgroup::"
  if [ "$status" != ok ]; then
    echo "::warning::$S: $status — $reason"
  fi

  python3 - "$S" "$status" "$rows" "$rc" "$secs" "$reason" "${VERSION:-}" >"$DATA_DIR/status/$s.json" <<'PY'
import datetime, json, sys
_, st, status, rows, rc, secs, reason, version = sys.argv
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
print(json.dumps({
    "state": st, "status": status, "rows": int(rows), "exitCode": int(rc),
    "seconds": int(secs), "reason": reason, "scrapedAt": now, "scraperVersion": version,
}))
PY
  summary "| $S | $status | $rows | ${secs}s | ${reason//|/¦} |"
done

echo "$OK of $TOTAL states produced data"
summary ""
summary "**$OK of $TOTAL states produced data.**"
if [ "$OK" -eq 0 ]; then
  echo "::error::no state in this batch produced data — see the per-state groups above"
  exit 1
fi
exit 0
