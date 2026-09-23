# Architecture decision records

An ADR records one decision that was hard to take and would be expensive to
reverse: an API shape, a breaking rename, a supported-runtime tier, a size
budget, a release mechanism. It states the situation, the choice, what the
choice costs, what else was considered, and the evidence behind every number in
it. It is written once, when the decision is taken, and amended rather than
rewritten when the decision changes.

An ADR is not a specification and not a plan. What the engine does belongs in
[docs/specification.md](../specification.md); what is planned and in which order
belongs in [ROADMAP.md](../../ROADMAP.md). The ADR answers "why is it like this".

Every ADR here is English, like every committed Markdown file of this repository
([ADR-0015](0015-language-policy.md)), and carries no number without the command,
the measurement date or the URL that produced it.

## Mandatory format

```
# ADR-NNNN: Title

Status: Accepted | Proposed
Date: YYYY-MM-DD
Deciders: Wesley Cormier

## Context
## Decision
## Consequences
## Alternatives considered
## Evidence
```

Rules that go with that skeleton:

- The `Status` line carries exactly one word. When part of an accepted decision
  is still open, the `Status` line stays `Accepted` and a short paragraph after
  the `Deciders` line names the rider and points at the section that holds it —
  as [ADR-0013](0013-browser-baseline-and-fallbacks.md) and
  [ADR-0014](0014-device-and-browser-matrix.md) do.
- The five sections above are the minimum and they keep that order. A record may
  add one of its own after `## Consequences` when it needs it:
  [ADR-0005](0005-real-dom-focus.md) adds `## Gate`,
  [ADR-0019](0019-gamepad-engine-design.md) adds
  `## Open items recorded, not resolved`.
- `## Alternatives considered` names what was rejected and why. "None" is not an
  answer: a decision with no alternative did not need a record.
- `## Evidence` is where the proof lives — a source path with its line numbers, a
  command with the date it was run, a fetched URL with the date. A claim with
  none of those is written as "not measured yet" or "to be verified".
- Every code citation is a path in **this** repository, written bare and at a line
  the author opened: `src/spatial/spatial.ts:248`. There is no second repository for
  a reader to disambiguate against, and no record cites one — a claim this project
  did not re-derive carries no path at all. It is marked as inherited from the
  predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not
  re-derived here, which is honest about what a reader can check. A line number
  without the symbol it points at is a citation waiting to drift: name the symbol
  in the prose so the mismatch is visible when it does.
- Related records are linked by file name, relative to this directory:
  `[ADR-0003](0003-package-boundaries.md)`.
- Length: 60 to 150 lines is the target **for a new record**. The twenty-three below
  run from 74 to 573 lines (`wc -l docs/adr/0*.md`, 2026-09-23), because an
  accepted record grows by amendment. The target governs the first draft; an
  amendment is judged on whether it says something the record did not, not on the
  line count it adds.

## Adding one

1. Take the next free number. The highest in use is ADR-0024, so the next is
   ADR-0025. Numbers are never reused, and a superseded record keeps its number.
   ADR-0004 is the one gap: it recorded a migration plan for the private
   predecessor rather than a decision of this repository, so it was withdrawn on
   2026-09-20 instead of superseded, its one design decision — the focus ring's
   defaults — moving to [ADR-0020](0020-focus-ring-defaults.md). The number stays
   retired.
2. Name the file `NNNN-short-title.md`, lowercase, words separated by hyphens.
3. Write it in English, with the skeleton above, and link it from every existing
   record it touches.
4. Add its row to the index below, in the same pull request.
5. One ADR per pull request. A decision that needs two records needs two pull
   requests, so each can be discussed on its own.

Amending an accepted record is its own commit, separate from the change that
made the amendment necessary — that rule is explicit for size budgets
([ADR-0017](0017-size-budgets.md), rule 4) and applies to every other record too.
A decision that is reversed outright gets a new ADR that says so, and the old one
gains a line pointing at it rather than being deleted.

## Index

Status as of 2026-09-22. "Accepted, one rider Proposed" means the decision holds
and one named detail inside it still waits on the owner. Two rows changed on
2026-09-20: ADR-0009 moved from Proposed to Accepted when its two behaviour
changes were settled in opposite directions, and ADR-0012's rider closed on
release-please. On 2026-09-22 ADR-0012 gained the first publication and the
switch to trusted publishing, the `docs/en` and `docs/fr` of ADR-0015 came
into existence, and ADR-0011's rider closed on `@standarx/nav/auto` when
[ADR-0023](0023-vanilla-auto-mount.md) named it — leaving four records carrying
one: ADR-0010, ADR-0013, ADR-0014 and ADR-0015. Every such change carries a
dated amendment in its record.

| ADR | Title | Status | What it decides |
|---|---|---|---|
| [0001](0001-name-scope-and-attribute-prefix.md) | Name, npm scope and attribute prefix | Accepted | The project is standarnav, the package `@standarx/nav`, the DOM attributes `data-snav-*` and the custom properties `--snav-focus-ring-*` and `--snav-keyboard-*`. Nine written attributes and eleven custom properties as of 2026-09-21. |
| [0002](0002-license-and-copyright.md) | License and copyright holder | Accepted | MIT, copyright Wesley Cormier, contributions inbound=outbound with no CLA. |
| [0003](0003-package-boundaries.md) | Package boundaries and module layout | Accepted | The engine imports no component, machine, stylesheet or framework context; the `src/` layout, why the root entry omits the three engines, and why `internal/` is the only private directory. |
| [0005](0005-real-dom-focus.md) | Real DOM focus, never a virtual cursor | Accepted | The engine moves `element.focus()` and reads `document.activeElement`; no focus key, no registry, and a gate that keeps it true. |
| [0006](0006-declarative-first.md) | Declarative first | Accepted | Containers and their behaviour are data attributes on the markup; the imperative API is the escape hatch, and `body` is the default container. |
| [0007](0007-navigation-modes.md) | Two navigation modes, composite and app | Accepted | `composite` is the default and leaves arrow keys to the page; `app` gives them spatial movement; the gamepad crosses the page in both. |
| [0008](0008-shadow-dom.md) | Light DOM only in v0 (shadow DOM is a non-goal) | Accepted | No shadow traversal in v0; the escape hatch is an explicit root. `getFocusables` and `contains` deliberately disagree about a shadow boundary, and the evolution path ships as the suite's one skipped fixture. |
| [0009](0009-hidden-candidates.md) | Which candidates count as visible | Accepted | Which elements are dropped from a move. The zero-size change (C1) is accepted for v0 and shipped in this pull request, pinned by three fixtures; `opacity: 0` (C2) is refused for v0 and deferred to v1. |
| [0010](0010-dev-mode-diagnostics.md) | Development-mode diagnostics | Accepted, one rider Proposed | A `@standarx/nav/debug` subpath with a reachability scan, depth and redirection warnings, and `explainMove` calling the engine's own winner rule. Open: (O1) the `cursor: pointer` heuristic default. |
| [0011](0011-package-layout-and-adapters.md) | One package, subpath exports, adapters as subpaths | Accepted | One published package with eleven subpaths built today, adapters as optional peers, React shipped and passing the parity suite, zero runtime dependencies enforced by `check:package`. Its one rider closed on 2026-09-22: the vanilla auto-mount helper is `/auto` ([ADR-0023](0023-vanilla-auto-mount.md)). |
| [0012](0012-versioning-and-release.md) | Versioning and release | Accepted | Semver from 0.x with breaking minors, publication from CI with provenance, `next` dist-tag for device trials, and release-please deriving the version and the CHANGELOG from the commit history. The tooling released `0.1.0` on 2026-09-22 with a signed provenance statement; from the same day the publish authenticates through npm trusted publishing, direct publish allowed, and the token that published `0.1.0` is to be revoked. A `.md`-only change is `docs`, never `fix(docs)`. |
| [0013](0013-browser-baseline-and-fallbacks.md) | Browser baseline: most recent first, fallbacks for older runtimes | Accepted, one rider Proposed | Build target es2020, a fallback for every newer API, and three support tiers. Open: the decision date for a separate legacy build. |
| [0014](0014-device-and-browser-matrix.md) | Device and browser test matrix | Accepted, one rider Proposed | Three engines in CI, no device claim without a dated device report, a matrix in three columns of which two are empty today. Open: which devices are bought and which are borrowed. |
| [0015](0015-language-policy.md) | Language policy | Accepted, one rider Proposed | Every committed file is English; user documentation is `docs/en` canonical with a strict `docs/fr` mirror — four pages on each side since 2026-09-22. Open: the CI mechanism enforcing that mirror. |
| [0016](0016-scoring-constants-provenance.md) | Scoring constants and their provenance | Accepted | Where `0.3`, `30`, `2` and the alignment bonus come from, what the score formula is, and that it is not Blink's. |
| [0017](0017-size-budgets.md) | Size budgets: measure before capping | Accepted | Two measured lines per subpath, caps written only after a first measurement here, and a line without a cap fails the run. Eleven lines are measured and capped as of 2026-09-21. |
| [0018](0018-testing-strategy.md) | Testing strategy | Accepted | Two Vitest projects, inline-style fixtures, tests through the real input system, one adapter parity suite, and no benchmark until a runner is chosen. The eight gaps it listed after the port are closed, by the amendment of 2026-09-20. |
| [0019](0019-gamepad-engine-design.md) | Gamepad engine design, inherited and recorded | Accepted | The polling loop, the two dead-zone regimes, the repeat ladder, the standard mapping and the escape hatches, with their open items. |
| [0020](0020-focus-ring-defaults.md) | Focus ring defaults, and why no stylesheet ships | Accepted | The plugin paints itself inline; six custom properties override every value, with the contrast figures and the two limits the choice carries. |
| [0021](0021-native-select-on-television.md) | A native `<select>` on a television, and what the package offers instead | Accepted | A closed `<select>` opens a platform popup the engine cannot see, and the trap is invisible on a desktop. A `scanNativeSelects` diagnostic in the debug subpath names it; a trigger-and-list recipe replaces it. Why no runtime warning, and the two bus mechanics the recipe depends on. |
| [0022](0022-virtual-keyboard.md) | The virtual keyboard — layout data, insertion, and what closes it | Accepted | Keys take real focus; a layout is data in its own module with no registry; insertion is `beforeinput`, mutate, `input`, with the framework-tracking risk named; `back` closes and keeps, deliberately unlike engage mode; composition deferred to its own ADR. Built, then amended three times against a real page: `activate` opens it, the box paints and places itself, and a preview row at its bottom draws the caret the field cannot show and moves it with the directions — decision 9 reversed on 2026-09-21. |
| [0024](0024-download-counter.md) | One cumulated download counter, and what it may not claim | Accepted, then withdrawn 2026-09-23 | The README's downloads badge sums npm installs, release asset downloads and the clones that are not this repository's own CI. Release assets measure 0 structurally and clones are mostly `actions/checkout`, so the script subtracts two clones per CI job — the ratio measured here — accumulates whole days against GitHub's fourteen-day traffic window, and keeps its state on an orphan `badges` branch. The residual is an upper bound on human clones, never a user count. **Withdrawn the day it shipped:** the Actions `GITHUB_TOKEN` gets 403 on the traffic API and no workflow permission grants that endpoint, so the badge is `npm/dt` and the machinery is deleted. The measurements stand as the reason not to reopen it cheaply. |
| [0023](0023-vanilla-auto-mount.md) | The vanilla auto-mount helper is `@standarx/nav/auto` | Accepted | Closes ADR-0011's rider on the subpath name. `autoMount()` is a factory, never a side-effecting import, and adds exactly two things to `createInputSystem`: it waits for `DOMContentLoaded` when the document is still parsing, and it lets the page pick the navigation mode through a new `data-snav-mode` attribute read once off the root. `plugins` takes a factory so that attribute can reach an engine at all. No engine is imported, and the adapter parity suite is not run — there is no render pass to satisfy it with. |
