# ADR-0024: One cumulated download counter, and what it may not claim

Status: Accepted
Date: 2026-09-23
Deciders: Wesley Cormier

## Context

The README asks for a single badge showing how much this package is taken: npm installs,
release downloads and source downloads, cumulated. Three sources, one number. Each source
was measured on 2026-09-23 before anything was built, and only one of the three reports
what its name suggests.

**Release assets report zero, and will keep reporting zero.** `GET /repos/.../releases`
returns `0 asset(s)` for both `v0.1.0` and `v0.2.0`. GitHub's `download_count` covers
*uploaded* assets only; the source tarballs it generates for every tag are not counted, and
release-please attaches nothing. A `github/downloads/.../total` badge would read `0`
forever unless this project starts uploading artefacts, which it has no reason to do.

**npm reports nothing yet.** `api.npmjs.org/downloads/range/...` answers
`{"error":"package not found"}` for `@standarx/nav`: the package was first published on
2026-09-22 and the download API has no data for it. That resolves itself; it is not a
defect.

**Clones report a large number that is mostly this repository's own CI.** The traffic API
gives 802 clones over fourteen days, and its two peaks land exactly on the two days with
the most CI:

| Day | Clones | CI jobs | Clones per job |
|---|---|---|---|
| 2026-09-18 | 56 | 21 | 2.67 |
| 2026-09-19 | 40 | 7 | 5.71 |
| 2026-09-20 | 294 | 143 | 2.06 |
| 2026-09-21 | 49 | 16 | 3.06 |
| 2026-09-22 | 363 | 182 | 1.99 |

Every job in this repository runs `actions/checkout`, and a checkout is a clone. Published
raw, that counter would rise when the maintainer pushes and fall when he stops, which is
the opposite of what a download badge is read as saying.

The fourth constraint is the window. npm keeps a long history; GitHub's traffic API keeps
**fourteen days** and nothing before it. A day not read before it falls off is gone.

## Decision

One badge, fed by a counter this repository accumulates itself:
`total = npm installs + release asset downloads + residual clones`.

**1. The counter is a state file, not a query.** `scripts/download-counts.ts` folds whole
days into a running total and records how far it has counted, per source
(`Tally`, `fold`). Fourteen days of history cannot be re-derived
later, so the total is only as good as the runs that built it. `fold` refuses a day it has
already seen and a day that is not over, which is what makes a re-run add nothing —
verified three times in a row against the live APIs on 2026-09-23, total unchanged at 65.

**2. CI is subtracted, because it cannot be excluded.** A clone carries no identity: the
API reports counts, never who. So the script measures what this repository's own CI cost
that day — the number of **jobs**, not runs, since each job checks out — and takes it off
(`residualClones`). This is a subtraction, not an attribution, and the ADR says
so where the README cannot.

**3. The constant is 2, and it is measured, not assumed.** A checkout registers about two
clones, not one: 294 against 143 jobs and 363 against 182, on the two days whose volume is
dominated by CI (2.06 and 1.99). `CHECKOUTS_PER_JOB` is that 2. Subtracting one per
job would leave roughly 430 clones standing on the days above that are almost certainly
still CI; subtracting two leaves 65. The constant is one line and the run is idempotent, so
a better measurement can replace it without rebuilding the history.

**4. Days clamp at zero.** On a heavy CI day the subtraction overshoots — 09-22 goes
negative before the clamp. A negative day would silently pay for a later one, so
`Math.max(0, …)` ends it there.

**5. The state lives on an orphan `badges` branch.** A daily commit does not belong in the
history of `main`, and a counter is not source. `.github/workflows/badges.yml` adds that
branch as a worktree, creating it on the first run, and pushes `state.json` and
`downloads.json` into it. The README points shields.io at the raw URL of the second.

**6. Daily, and by hand when needed.** The schedule is `17 4 * * *`, which leaves thirteen
days of slack against the fourteen-day window; `workflow_dispatch` catches up after an
outage. Past thirteen days of silence, days are lost and no error says so.

## Consequences

- **The number starts on 2026-09-09, not at the first commit.** That is the oldest day the
  traffic window still held when the counter was written. Everything before it is
  unrecoverable and the badge does not pretend otherwise.
- **The residual is an upper bound on human clones, not a count of them.** Bots, mirrors
  and forks clone too, and the subtraction only removes this repository's own Actions. The
  badge says `downloads`; this record is the only place that says what that word covers,
  which is why the README links here from the badge itself.
- **It mixes units on purpose.** An npm install, a release asset download and a git clone
  are three different acts, and adding them produces a number with no unit. It answers
  "how much is this project pulled", not "how many users are there", and no document may
  quote it as the second.
- **A fourteen-day outage is silent data loss.** The badge would simply keep the total it
  had. Worth a check whenever the workflow is red for more than a week.
- **The traffic API needs push access**, so this cannot run from a fork and the job carries
  `contents: write` for that reason as much as for the push.
- Seventeen unit cases cover the arithmetic (`scripts/download-counts.test.ts`), because a
  counter that double-counts or forgets a day fails silently and forever.

## Amendment, 2026-09-23: the counter is withdrawn — CI cannot read the clones it was built on

Decision 1 through 6 are dead. `.github/workflows/badges.yml`,
`scripts/download-counts.ts`, its seventeen tests and the orphan `badges` branch are
deleted, and the README's downloads badge is `shields.io/npm/dt` — the alternative this
record listed first and rejected only because it answered one source out of three.

**What killed it, measured the same day it shipped.** The first scheduled run went green
and published `downloads | 0`. It was not zero: `GET /repos/.../traffic/clones` answered
**403 Forbidden** to the Actions `GITHUB_TOKEN`, and the script's `json()` turned every
non-ok response into `null`, which read as a day with no clones. A counter that cannot
tell a refusal from an absence reports silence as data, behind a green check.

**And it cannot be fixed inside Actions.** The traffic API is documented as needing push
access, but `contents: write` is not what it means: it wants `Administration: read`, and
`administration` is **not a valid key** in a workflow `permissions` block — GitHub rejects
the file with `Unexpected value 'administration'` (HTTP 422, tried 2026-09-23). There is
no permission an Actions token can be granted for that endpoint. The only route left was a
fine-grained personal access token kept as a repository secret.

**Why that price was refused.** The token would be a second long-lived credential, kept
running, for a number this record had already measured as a badly inflated upper bound:
802 clones over fourteen days against 344 CI jobs over the same days, leaving 65 after the
subtraction — and that 65 is still bots and mirrors as much as people. Paying a permanent
secret for it is not a trade worth making.

**What is left, and why it no longer needs any of this.** Without clones the counter is npm
installs plus release asset downloads, and release assets are structurally 0. npm's total is
one shields.io URL. The machinery existed only to accumulate a fourteen-day window that no
longer reaches us.

**What the record keeps.** The measurements above stand and are the reason this is not
reopened cheaply: release assets cannot count generated tarballs, and clones are dominated
by `actions/checkout`. Anyone proposing a "total downloads" badge here should read the
clone-to-job table before writing the workflow.

## Alternatives considered

| Option | Why not |
| --- | --- |
| **`shields.io/npm/dt` alone** | Honest, free, and zero infrastructure — this is the fallback if the counter is ever dropped. Rejected only because it answers one of the three sources asked for, and today that one reads zero. |
| **`github/downloads/OWNER/REPO/total`** | Measured at `0` for both releases on 2026-09-23 and structurally unable to be anything else: generated source tarballs are never counted. A badge that always reads zero is worse than no badge. |
| **Clones published raw, no subtraction** | The number would be about 802 today and would climb with every push. It measures CI, and it measures it loudest on the days the maintainer is most active. |
| **Subtracting one clone per job** | The arithmetic the ask implies, and the measurements refute it: at one per job the two CI-dominated days still leave 151 and 181 clones, which no plausible traffic explains on a four-day-old repository. |
| **Estimating a CI share by regression instead of a constant** | Fits a ratio from the same data that assumes near-zero human traffic on busy days — circular, and far more machinery than a documented constant that one line changes. |
| **A third-party analytics service** | Another dependency, another account, another privacy surface, for a badge. |
| **No badge at all** | Legitimate, and what the numeric rules of this repository push towards. Rejected because the question "is anyone using this" is a fair one to answer in public, provided the answer says what it is made of. |

## Evidence

- Sources measured on 2026-09-23, before anything was built:
  `gh api repos/StandarX-miralabs-tech/standarnav/releases` → `0 asset(s)` on `v0.2.0` and
  `v0.1.0`; `curl api.npmjs.org/downloads/point/last-month/@standarx/nav` →
  `{"error":"package not found"}`; `gh api .../traffic/clones` → `count=802 uniques=144`.
- The clone-to-job table above: clones from `.../traffic/clones`, jobs by summing
  `total_count` of `.../actions/runs/{id}/jobs` over every run created that day, both on
  2026-09-23.
- The counter, run against the live APIs on 2026-09-23 with a push-scoped token:
  `npm 0 + clones 65 + release assets 0 = 65 through 2026-09-22`, and the same line on a
  second and third run — the idempotence decision 1 claims.
- The script that held all of this — `CHECKOUTS_PER_JOB`, `lastCompleteDay`,
  `residualClones`, `fold`, `badgeFor`, `pendingDays` — was deleted by the amendment of
  2026-09-23, so no line of it is cited here: a path in this repository has to be a path a
  reader can open. It is in the history of this pull request and nowhere else.
- Coverage: `scripts/download-counts.test.ts`, seventeen cases by `grep -c "^  it(" ` on
  2026-09-23 — the day boundary, the subtraction and its clamp, four on folding without
  double-counting, and the repair of a corrupt state file.
- Related: [ADR-0012](0012-versioning-and-release.md) (what publishes, and the trusted
  publisher this counter's npm term waits on), [ADR-0017](0017-size-budgets.md) (the other
  number the README shows).
