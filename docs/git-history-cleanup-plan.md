# Git history cleanup plan — `pass.txt`

**Status: NOT EXECUTED. Awaiting founder approval.**

This document describes exactly what will be run, what it will do, and what it will
break. Nothing here has been performed. No credential values appear in this file.

---

## Why this is needed

`pass.txt` was committed to the repository and remained in `HEAD` from commit
`8b73379` until it was deleted from the working tree on 2026-08-01. Deleting the
file removes it from the current checkout **but not from history** — it is still
present in every historical commit, in every clone, and in any fork or backup.

The file contained credentials for five services (an LLM provider, a second LLM
provider, a hosted database, a speech provider, and a deploy webhook). Their values
are not reproduced here.

**Rotation is the security control. History rewriting is cleanup.** A rewritten
history does not un-expose a credential that was already committed — only rotation
does. Rewriting reduces the chance of future accidental disclosure and stops
scanners from flagging the repo.

---

## Preconditions — all must be true before running anything

- [ ] **All five credentials have been rotated or revoked**, confirmed by the
      founder. Nothing below runs until this is done.
- [ ] No other person has an unpushed branch in this repository. A rewrite
      invalidates their work.
- [ ] No open pull requests. A rewrite orphans their commits.
- [ ] No CI job or deploy is in flight.
- [ ] A backup exists (step 1 below).

---

## Step 1 — Back up before touching anything

Two independent backups. Run both.

```bash
git bundle create ../immigrationclock-backup-$(date +%Y%m%d).bundle --all
```

```bash
git branch backup/pre-history-rewrite-20260801
```

The bundle is a single file containing every branch, tag, and commit. It can be
cloned directly (`git clone immigrationclock-backup-20260801.bundle restored/`) if
anything goes wrong. **Store it outside the repository directory.**

Verify the bundle before proceeding:

```bash
git bundle verify ../immigrationclock-backup-20260801.bundle
```

---

## Step 2 — Confirm the scope of the removal

Before rewriting, confirm exactly which commits are affected:

```bash
git log --oneline --all -- pass.txt
```

And confirm no other secret-bearing file needs the same treatment:

```bash
git log --all --diff-filter=A --name-only --format="%H" -- "*.env" "*secret*" "*credential*" "*.pem" "*.key"
```

---

## Step 3 — The rewrite

`git-filter-repo` is the tool the Git project recommends; `filter-branch` is
deprecated and much slower. Install it first:

```bash
pip install git-filter-repo
```

Then remove the file from all history:

```bash
git filter-repo --invert-paths --path pass.txt --force
```

What this does: rewrites every commit that ever touched `pass.txt`, removing the
file from each one. **Every commit hash from `8b73379` onward changes.**

`git-filter-repo` intentionally removes the `origin` remote after running, to stop
an accidental push before you have reviewed the result. Re-add it deliberately:

```bash
git remote add origin https://github.com/Datadetective1/ImmigrationClock.git
```

---

## Step 4 — Verify before pushing

```bash
git log --all --oneline -- pass.txt
```

Expected output: **nothing**. If any commit is listed, stop and restore from the
bundle.

Also confirm the working tree still builds:

```bash
npm ci && npm run typecheck && npm test && npx next build
```

---

## Step 5 — Push (requires separate, explicit approval)

```bash
git push origin --force --all
```

```bash
git push origin --force --tags
```

**This is the irreversible step.** Do not run it until steps 1–4 are complete and
verified.

---

## What this breaks

| Impact | Detail |
| --- | --- |
| **Every existing clone becomes invalid** | Anyone with a clone must re-clone. `git pull` will fail or produce a tangled merge. There is no safe "just pull" path. |
| **All commit hashes change** | Any link, note, or bookmark referencing a commit SHA from `8b73379` onward breaks. |
| **Open PRs are orphaned** | They must be closed and re-opened against the rewritten history. |
| **Vercel deployment history** | Existing deployments remain, but their commit references no longer resolve. The next push triggers a fresh build. |
| **`[skip ci]` data-refresh commits are rewritten too** | The automated snapshot commits are part of history and get new hashes. The data itself is unaffected. |
| **GitHub may retain unreachable objects** | Old commits can stay reachable through GitHub's API cache for a period even after a force push. **This is the single strongest reason rotation is mandatory and rewriting is not a substitute.** GitHub Support can be asked to garbage-collect them. |
| **Forks are unaffected** | A rewrite does not touch forks. Any fork retains the file. Confirm none exist. |

---

## After the rewrite

- [ ] Delete the local backup branch once satisfied: `git branch -D backup/pre-history-rewrite-20260801`
- [ ] Keep the bundle file for at least 30 days.
- [ ] Ask GitHub Support to purge cached unreachable objects.
- [ ] Confirm the repository still shows as **private**.
- [ ] Consider enabling GitHub secret scanning and push protection so this class of
      mistake is blocked at push time rather than found later.

---

## The alternative: do nothing to history

Given the repository is private and the credentials are being rotated, leaving
history alone is a defensible choice. The trade-off:

| | Rewrite | Leave history |
| --- | --- | --- |
| Security benefit after rotation | Marginal | — |
| Risk of breaking clones / PRs | Real | None |
| Effort | ~30 min plus coordination | None |
| If the repo is ever made public | Clean | The file is in history forever |

**Recommendation:** rotate first — that is the control that matters. Rewrite history
only if you expect this repository to become public or to gain collaborators. If it
stays private and solo, the rewrite is optional.
