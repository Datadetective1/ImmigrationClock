#!/usr/bin/env bash
#
# Open an alert issue that CANNOT be defeated by its own decoration.
#
#   bash .github/scripts/alert-issue.sh "<title>" "<body>"
#
# WHY THIS EXISTS
# ---------------
# The newsletter workflow withheld delivery for three consecutive weeks and
# nobody found out, because the thing meant to tell them was:
#
#     gh issue create --title "..." --label "automated,newsletter" --body "..." \
#       || echo "::warning::could not open an alert issue"
#
# Neither label existed in the repository. `gh issue create` refuses the whole
# creation when a label is unknown — it does not create the issue and drop the
# label — so every alert failed at the last step:
#
#     could not add label: 'automated' not found
#     ##[warning]could not open an alert issue
#
# and the `||` swallowed it into a warning nobody reads on a green run. An alarm
# that fails silently is worse than no alarm, because it is budgeted for.
#
# THE RULE HERE
# -------------
# The issue is the point; the labels are filing. So:
#
#   1. create the labels, best-effort and idempotently, ignoring any failure
#   2. try with labels
#   3. on failure, RETRY WITHOUT THEM — an unfiled alert is still an alert
#   4. only if both attempts fail, emit ::error:: rather than ::warning::
#
# Step 3 is the one that matters. It makes the alert robust against a label
# being renamed, deleted, or restricted at any point in the future, which is
# precisely the class of change nobody thinks to test.
#
# EXIT CODE
# ---------
# Always 0. The callers use this in `if: failure()` and delivery-withheld steps
# where the job's own conclusion is already decided; failing here would turn an
# alerting problem into a second, confusing build failure. The ::error::
# annotation is the signal.
#
# Requires: gh (present on GitHub-hosted runners), GH_TOKEN, and `issues: write`.

set -uo pipefail

title="${1:?alert-issue.sh: a title is required}"
body="${2:?alert-issue.sh: a body is required}"

# name:colour:description — GitHub's own grey for automation, blue for the topic.
LABELS=(
  "automated:ededed:Opened automatically by a workflow"
  "newsletter:1d76db:Immigration Pulse build and delivery"
)

for spec in "${LABELS[@]}"; do
  name="${spec%%:*}"
  rest="${spec#*:}"
  colour="${rest%%:*}"
  description="${rest#*:}"
  # --force so an existing label is updated rather than reported as a conflict.
  # Failure is ignored on purpose: a repository that will not accept a label
  # must still be able to receive the alert below.
  gh label create "$name" --color "$colour" --description "$description" --force >/dev/null 2>&1 || true
done

if gh issue create --title "$title" --label "automated,newsletter" --body "$body"; then
  exit 0
fi

echo "::warning::could not open a labelled alert issue — retrying without labels"

if gh issue create --title "$title" --body "$body"; then
  exit 0
fi

# Both attempts failed. This is the case the old code hid.
echo "::error::ALERT NOT DELIVERED — could not open an issue for: ${title}"
echo "::error::The condition that triggered this alert is real and is now unreported. Check the job log."
exit 0
