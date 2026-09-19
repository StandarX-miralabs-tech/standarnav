# ADR-0010: Development-mode diagnostics

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One detail inside this ADR is left open and marked (O1) below: whether the `cursor: pointer`
heuristic is on or off by default in the scan.

## Context

The most common support question this project will get is "the d-pad does not reach my element".

In most cases the engine is right and the page is wrong. A clickable `<div>` with no `tabindex` is not
in `FOCUSABLE_SELECTOR` (`packages/core/src/focus/tabbable.ts:16-31`), so it is not a candidate. It is
also unreachable by the Tab key and meaningless to a screen reader. The engine is reporting an
accessibility bug, not causing one. But it reports it by doing nothing, which is indistinguishable
from a broken library.

There are three other silent failures in the current code, each of which will be reported as "the
engine is broken":

| Symptom | Cause | Where |
|---|---|---|
| A move does nothing, no error | The element is not focusable, or was filtered as hidden or ignored | `tabbable.ts:52-59`, `spatial.ts:133`, `spatial.ts:141` |
| A move stops crossing containers in a deep tree | The walk out gives up at `MAX_CONTAINER_DEPTH = 16` and calls the bounds listeners instead | `spatial.ts:55`, `:371-392` |
| A redirection attribute is ignored, or focuses nothing | `data-snav-<direction>` is a CSS selector resolved on the whole document. If it matches nothing, the move silently falls through to geometry. If it matches a non-focusable element, the engine calls `focus()` on it, reports success and writes `data-snav-focused` on an element the browser will not focus — there is no `isFocusable` check on that path | `spatial.ts:362-366`, then `commit` at `:257-282` |

The precedent for the answer already exists in the source. `explainMove` is published as its own entry
point so that "an application that ships spatial navigation does not ship the explanation of it"
(`packages/core/src/input/spatial/debug.ts:1-11`). It is exported at
`packages/core/package.json:61` as `./input/spatial/debug`, and the package declares
`"sideEffects": false` (`packages/core/package.json:14`), so a bundler drops it from any application
that does not import it.

That same file is also the one place where a diagnostic can lie. Its own header says a diagnostic that
measures something else is worse than none — and then it restates the winner rule in its own loop
(`debug.ts:57-70`) instead of calling the engine's `findBestCandidate` (`geometry.ts:140-186`). Read
side by side on 2026-09-18 the two agree, and one asymmetry is already visible: the engine's "any"
accumulator considers aligned candidates too, while the debug loop's second pass excludes them. It is
unreachable today, because an eligible aligned candidate short-circuits the engine's return. It is
exactly the shape of a future divergence, and nothing tests the two against each other.

## Decision

Diagnostics ship in the existing debug subpath, `@standarx/nav/debug` (`src/debug.ts`), never in the
core entry. They cost a production bundle nothing, by the same mechanism `explainMove` already relies
on: a separate subpath export plus `sideEffects: false`.

**Which of the five are in v0.** Only item 4. Items 1, 2, 3 and 5 are v1, and this is a scheduling
decision rather than a change of mind: four of the five have no source file behind them. The
inherited `debug.ts` is 73 lines exporting `SpatialExplanation`, `explainMove` and four type
re-exports, and it writes no DOM at all — the overlay lived in the monorepo's documentation site and
is not extracted. Building them inside the extraction window would mean designing what "looks
interactive" means, what the confidence levels are, what shape the output takes and whether the scan
walks shadow roots, all as new code in a sequence whose value is that a bisect can tell a rename
from a behaviour change. `@standarx/nav/debug` is `explainMove` for v0, and the playground's
"debug overlay" is `explainMove` wired to the console until an overlay renderer is specified.

The subpath provides:

1. **A reachability scan.** `scanUnreachable(root)` returns the elements that look interactive and are
   not focusable, each with the signal that flagged it and a confidence level:

   | Signal | Confidence | Note |
   |---|---|---|
   | `role="button"`, `"link"`, `"menuitem"`, `"tab"`, `"option"`, `"checkbox"`, `"radio"`, `"switch"` on an element that is not focusable | High | The author declared an interactive role and gave it no way to take focus |
   | An `onclick` content attribute on a non-focusable element | High | Only the content attribute is observable. A listener added with `addEventListener` cannot be seen from script, so this signal has false negatives by construction and the scan says so |
   | `getComputedStyle(el).cursor === "pointer"` on a non-focusable element | Low | A styling convention, not a contract. Costs one style read per element, so it is a flag, not the default behaviour of the scan — **(O1)** the owner confirms whether it is opt-in or opt-out |

   The scan is development-only, so it may be as expensive as it needs to be. It is allowed to use the
   geometric clipping that [ADR-0009](0009-hidden-candidates.md) rejects for the hot path.

2. **A depth warning.** When the walk out of nested containers runs its full `MAX_CONTAINER_DEPTH = 16`
   iterations without breaking on the root, a trap or a block (`spatial.ts:55`, `:371-390`), the
   diagnostics report it with the container chain it saw. Saturation means the move silently stopped
   short; today it is indistinguishable from a real boundary.

3. **A redirection warning.** For every `data-snav-up/down/left/right` in the scanned tree: report the
   selector that resolves to nothing, and the selector that resolves to an element `isFocusable` says
   no to. The second case is worse than the first, because the engine currently treats it as a
   successful move (`spatial.ts:362-366`).

4. **`explainMove`, calling the engine's own rule.** `findBestCandidate` becomes the single ranking
   implementation; `explainMove` calls it for the winner and keeps `scoreCandidates` only for the
   per-candidate table it displays. A parity test asserts, over generated layouts in all four
   directions, that `explainMove(...).winner` is the element `findBestCandidate` returns for the same
   candidate list. The overlay may not claim a winner the engine would not pick.

5. **A short note for the documentation**, printed verbatim by the scan when it finds nothing:

   > Make your element navigable: use a real `<button>` or `<a href>`; if you cannot, add
   > `tabindex="0"` (or `tabindex="-1"` for an item inside a roving collection) and a `role`.
   > Give it a non-zero size — an element whose rect is empty is not a candidate.
   > Check that no ancestor carries `inert`, `hidden` or `data-snav-ignore`.
   > Check that it is inside the container the move starts from, or in one the walk can reach.
   > If it still does not work, call `explainMove(origin, direction)` from `@standarx/nav/debug`.

The subpath gets its own size-budget line ([ADR-0017](0017-size-budgets.md)), and that line already
exists here: `scripts/size-budget.ts` measures `debug.js` with `./*` external, and its cap is `null`,
which fails the run until the first build in this repository produces the number that sets it. In
miralabs-ui no budget line matched `debug` at all, and a diagnostics module with no cap is how a
diagnostics module ends up in production bundles.

## Consequences

- Production builds are unchanged. The core entry gains nothing, and the measured budgets stay as they
  are (`bun run check:size` in miralabs-ui on 2026-09-18: spatial engine 2.81 kB of a 3.00 kB cap,
  input system 1.93 kB of 2.00 kB).
- Point 4 removes a duplicate implementation of the winner rule, which is a small behaviour risk today
  (the two agree by reading) and a large one later.
- The scan has false negatives it cannot fix: a click listener attached with `addEventListener` is
  invisible to it. The documentation says so, rather than let an empty report read as "your page is fine".
- Diagnostics are opt-in. An application that never imports the subpath never sees a warning: that is
  the price of costing nothing in production. The README's first troubleshooting line is the import.
- The depth and redirection warnings need a hook the engine does not have yet: the engine must expose
  enough state for the debug module to observe a saturated walk without re-running it. That surface is
  designed with point 4, not before.
- Nothing here is measured or tested yet. The scan, the warnings and the parity test are v0 work items.

## Alternatives considered

**Console warnings in the production build, behind `process.env.NODE_ENV`.** Rejected. The package is
platform-neutral ESM with no bundler assumption ([ADR-0003](0003-extraction-scope.md)); `process` does
not exist in a browser, `import.meta.env` is a bundler convention, and a library that reads either one
inherits every consumer's build configuration. Dead-code elimination only works when the bundler
replaces the expression, which excludes anyone loading the ESM build directly — and the TV runtimes in
the supported tier are exactly where a stray `process` reference throws.

**A browser extension.** Rejected for v0. A second distribution channel with a store review per
browser, it cannot see the engine's internal state without a bridge the library would ship anyway, and
a TV browser installs no extensions. It stays a possible v1+ consumer of the same debug subpath.

**Throwing on an unreachable element.** Rejected. The engine cannot know whether a `<div onclick>` is a
bug or a decoration, and a library that throws on the host application's markup is a library that gets
removed.

## Evidence

- `packages/core/src/input/spatial/debug.ts:1-11` — the separate-entry precedent and the "a diagnostic
  that measures something else is worse than no diagnostic at all" rule it sets for itself.
- `packages/core/src/input/spatial/debug.ts:57-70` — the restated winner rule.
- `packages/core/src/input/spatial/geometry.ts:140-186` — `findBestCandidate`, the engine's rule, with
  its single loop and two accumulators.
- `packages/core/src/input/spatial/geometry.ts:204-238` — `scoreCandidates`, which recomputes
  eligibility and alignment a second time for the overlay.
- `packages/core/src/input/spatial/spatial.ts:55`, `:371-392` — `MAX_CONTAINER_DEPTH = 16` and the walk
  that ends in the bounds listeners.
- `packages/core/src/input/spatial/spatial.ts:362-366`, `:257-282` — the redirection path and `commit`,
  with no `isFocusable` check between them.
- `packages/core/src/focus/tabbable.ts:16-31`, `:52-59` — what a candidate has to be.
- `packages/core/package.json:61` — `"./input/spatial/debug"` as its own export.
- `packages/core/package.json:14` — `"sideEffects": false`.
- `scripts/size-budget.ts` in this repository (read 2026-09-18) — a `debug` line, entry `debug.js`,
  `external: ["./*"]`, `cap: null`; miralabs-ui has no budget line matching `debug`.
- Sizes quoted above: `bun run check:size` in miralabs-ui on 2026-09-18, min+gzip, externals `../*`
  and `../../*`, dist built the same day.
- All source paths are read-only, repository miralabs-ui at commit `289fa607`, read on 2026-09-18.
- Related: [ADR-0009](0009-hidden-candidates.md) for the visibility rules the scan explains, and
  [ADR-0008](0008-shadow-dom.md) for what the scan cannot see at all.
