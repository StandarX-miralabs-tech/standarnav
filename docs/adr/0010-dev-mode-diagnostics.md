# ADR-0010: Development-mode diagnostics

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One detail inside this ADR is left open and marked (O1) below: whether the `cursor: pointer`
heuristic is on or off by default in the scan.

## Context

The most common support question this project will get is "the d-pad does not reach my element".

In most cases the engine is right and the page is wrong. A clickable `<div>` with no `tabindex` is not
in `FOCUSABLE_SELECTOR` (`src/tabbable.ts:17-32`), so it is not a candidate. It is also unreachable
by the Tab key and meaningless to a screen reader. The engine is reporting an
accessibility bug, not causing one. But it reports it by doing nothing, which is indistinguishable
from a broken library.

There are three other silent failures in the current code, each of which will be reported as "the
engine is broken":

| Symptom | Cause | Where |
|---|---|---|
| A move does nothing, no error | The element is not focusable, or `collectNavNodes` filtered it as ignored or zero-size | `isFocusable` at `src/tabbable.ts:56-63`, then `src/spatial/spatial.ts:175` and `:188` |
| A move stops crossing containers in a deep tree | The walk out gives up at `MAX_CONTAINER_DEPTH = 16` and calls the bounds listeners instead | `src/spatial/spatial.ts:60`, `:423-444` |
| A redirection attribute is ignored, or focuses nothing | `data-snav-<direction>` is a CSS selector resolved on the whole document. If it matches nothing, the move silently falls through to geometry. If it matches a non-focusable element, the engine calls `focus()` on it, reports success and writes `data-snav-focused` on an element the browser will not focus — there is no `isFocusable` check on that path | `src/spatial/spatial.ts:414-417`, then `commit` at `:308-333` |

The precedent for the answer already exists in the source. `explainMove` is published as its own entry
point so that "an application that ships spatial navigation does not ship the explanation of it"
(`src/debug.ts:1-11`). `package.json` exports it as `./debug` and declares
`"sideEffects": false`, so a bundler drops it from any application that does not
import it.

That same file is also the one place where a diagnostic can lie, and its own header says so: a
diagnostic that measures something else is worse than no diagnostic at all (`src/debug.ts:8-10`).
The failure that rule guards against is a second implementation of the winner rule living inside the
diagnostic — a loop that restates the ranking and then drifts from it. The drift has a known shape:
`findBestCandidate` keeps two accumulators and its "any" one considers aligned candidates as well
(`src/spatial/geometry.ts:174-181`), so a debug loop whose second pass excluded them would agree
with the engine only for as long as an eligible aligned candidate short-circuits the engine's
return, and would start naming a different winner the day that stopped being true. That such a loop
once existed with that asymmetry latent in it, agreeing with the engine and tested against it
nowhere, is inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here; what is true of this repository
is that `src/debug.ts` asks `findBestCandidate` for the winner and holds no second loop at all.
Decision 4 below is what keeps it that way, and it is the reason decision 4 is in the record.

## Decision

Diagnostics ship in the existing debug subpath, `@standarx/nav/debug` (`src/debug.ts`), never in the
core entry. They cost a production bundle nothing, by the same mechanism `explainMove` already relies
on: a separate subpath export plus `sideEffects: false`.

**Which of the five are in v0.** Only item 4. Items 1, 2, 3 and 5 are v1, and this is a scheduling
decision rather than a change of mind: four of the five have no source file behind them.
`src/debug.ts` is 91 lines exporting `SpatialExplanation`, `explainMove`, four type re-exports and
`scanNativeSelects` — the native-select scan of [ADR-0021](0021-native-select-on-television.md),
which is not one of the five items here — and it writes no DOM at all: the overlay renderer such a
scan would draw into is inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here.
Building them inside the extraction window would mean designing what "looks interactive" means, what
the confidence levels are, what shape the output takes and whether the scan walks shadow roots, all
as new code in a sequence whose value is that a bisect can tell a rename from a behaviour change.
`@standarx/nav/debug` is `explainMove` for v0, and the playground's "debug overlay" is `explainMove`
wired to the console until an overlay renderer is specified.

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
   iterations without breaking on the root, a trap or a block (`src/spatial/spatial.ts:60`,
   `:423-444`), the diagnostics report it with the container chain it saw. Saturation means the move
   silently stopped short; today it is indistinguishable from a real boundary.

3. **A redirection warning.** For every `data-snav-up/down/left/right` in the scanned tree: report the
   selector that resolves to nothing, and the selector that resolves to an element `isFocusable` says
   no to. The second case is worse than the first, because the engine currently treats it as a
   successful move (`src/spatial/spatial.ts:414-417`).

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

The subpath gets its own size-budget line ([ADR-0017](0017-size-budgets.md)), and that line exists
and is capped: `scripts/size-budget.ts:105-114` measures `debug.js` against a cap of 0.50 kB, and
`bun run build && bun run check:size` reports **0.49 kB min+gzip**, 0.78 kB minified. The line is
not optional bookkeeping: a diagnostics module with no cap is how a diagnostics module ends up in
production bundles.

That line's externals are `./spatial/spatial.js`, `./spatial/geometry.js` and `./tabbable.js`, named
one by one, never a glob. The glob is forbidden by the script itself
(`scripts/size-budget.ts:65-76`): `*` does not cross a path separator, so `./*` on a top-level entry
can externalise the line's own contents and report a re-export stub as proof — a budget line that
stops measuring without ever going red. Naming those three is what makes the 0.49 kB a marginal
cost, which is the only figure this line is meant to carry.

The third was added on 2026-09-20 and is the amendment below. `tabbable.js` belongs to the core, so
charging the debug entry for it measured a copy no consumer downloads — an omission that cost
nothing while `explainMove` imported nothing from the core, and cost 0.28 kB the moment a diagnostic
did ([ADR-0017](0017-size-budgets.md), the amendment of that date).

## Consequences

- Production builds are unchanged. The core entry gains nothing: `src/index.ts` does not re-export
  the debug module, and `./debug` is its own entry in the exports map (`package.json`). Measured
  here with `bun run build && bun run check:size`: core 3.13 kB of a 3.25 kB cap, spatial engine
  3.04 of 3.25, debug 0.49 of 0.50, min+gzip ([ADR-0017](0017-size-budgets.md)).
- Point 4 removed a duplicate implementation of the winner rule, and that is done: `src/debug.ts`
  imports `findBestCandidate` and calls it for the winner (`src/debug.ts:13-19`, `:69`), keeping
  `scoreCandidates` for the per-candidate table alone (`:68`). The asymmetry this ADR's Context
  described — the debug loop's second pass excluding aligned candidates where the engine's does not
  — no longer exists, because there is no second loop.
- The scan has false negatives it cannot fix: a click listener attached with `addEventListener` is
  invisible to it. The documentation says so, rather than let an empty report read as "your page is fine".
- Diagnostics are opt-in. An application that never imports the subpath never sees a warning: that is
  the price of costing nothing in production. The README's first troubleshooting line is the import.
- The depth and redirection warnings need a hook the engine does not have yet: the engine must expose
  enough state for the debug module to observe a saturated walk without re-running it. That surface is
  designed with point 4, not before.
- Of the five items, only point 4 has shipped, which is what decision "which of the five are in v0"
  above says should happen. The scan (point 1), the depth warning (2), the redirection warning (3)
  and the documentation note (5) are v1 and no code exists for any of them: `src/debug.ts` is 91
  lines holding `SpatialExplanation`, `explainMove`, type re-exports and the native-select scan of
  [ADR-0021](0021-native-select-on-television.md), with no DOM written and no *reachability* scan —
  `scanNativeSelects` (`src/debug.ts:87`) answers a different question and is not point 1. Point 4
  is measured and covered: `src/debug.browser.test.ts:56-180` holds six `explainMove` cases, three
  of which pin where the diagnostic is *meant* to differ from the engine
  (`:113-180`) — the differences that remain once the winner rule is shared. The file holds nine in
  all; the other three are the scan's (`:182-222`).

## Amendment, 2026-09-20: a sixth diagnostic, and it ships

The five items above are still five, and only item 4 of them ships in v0. A sixth
diagnostic has been added outside that list: `scanNativeSelects(root)`, which reports
the native `<select>`s the engine will focus and cannot follow into
([ADR-0021](0021-native-select-on-television.md)).

It ships where items 1, 2, 3 and 5 did not, and the reason is the one this record gave
for deferring them: they had no source file behind them and would have been new design
work inside the extraction window. This one is nine lines calling the engine's own
`isFocusable`, and the window is closed. It obeys both rules that matter here — it
lives in the debug subpath and never in the core, and it asks the engine rather than
re-deriving the answer.

It is a scan and not a warning for a reason this record did not anticipate: the
condition it reports is not an error, and the runtime where it matters is not the
runtime where the code is written. A television opens a platform popup; a desktop
browser navigates its own. A warning would fire on every desktop and be right on
neither.

## Alternatives considered

**Console warnings in the production build, behind `process.env.NODE_ENV`.** Rejected. The package is
platform-neutral ESM with no bundler assumption ([ADR-0003](0003-package-boundaries.md)); `process` does
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

- `src/debug.ts:1-11` — the separate-entry precedent, and at `:8-10` the "a diagnostic that measures
  something else is worse than no diagnostic at all" rule the module sets for itself.
- `src/spatial/geometry.ts:139-185` — `findBestCandidate`, the engine's rule, with its single loop
  and, at `:174-181`, the two accumulators the aligned/any asymmetry lives in.
- `src/spatial/geometry.ts:202-236` — `scoreCandidates`, which recomputes eligibility and alignment a
  second time for the overlay; the comment at `:196-201` says why that second pass is deliberate and
  must not become the hot path's.
- `src/spatial/spatial.ts:60`, `:423-444` — `MAX_CONTAINER_DEPTH = 16` and the walk out that ends in
  the bounds listeners at `:444`, which is row 2 of the Context table.
- `src/spatial/spatial.ts:414-417`, `:308-333` — the redirection resolved with
  `root.ownerDocument.querySelector` and handed straight to `commit`, with no `isFocusable` check
  between them: row 3 of the table, and why points 2 and 3 above are still needed.
- `src/tabbable.ts:17-32`, `:56-63` — `FOCUSABLE_SELECTOR` and `isFocusable`, what a candidate has to
  be.
- `package.json` — `"./debug"` as its own export, and `"sideEffects": false`.
- `scripts/size-budget.ts` — the `debug` line at `:105-114`, entry `debug.js`,
  `external: ["./spatial/spatial.js", "./spatial/geometry.js", "./tabbable.js"]`,
  `cap: 0.5 * KB`. The rule forbidding globbed externals, with the `./*` failure mode
  spelled out, is the comment at `:65-76`.
- Sizes measured here: `bun run build && bun run check:size`, min+gzip at Bun's default gzip level —
  debug 0.49 kB of 0.50, core 3.13 of 3.25, spatial engine 3.04 of 3.25. Any earlier figure for a
  differently shaped build is inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here.
- The winner rule is shared, not restated: `src/debug.ts:13-19` imports `findBestCandidate`,
  `scoreCandidates` and the scoring types from `./spatial/geometry`; `:68-69` calls `scoreCandidates`
  for the table and `findBestCandidate` for the winner; the comment at `src/debug.ts:64-67` names
  this ADR's decision 4 as the reason. `src/debug.ts` is 91 lines. Cases:
  `src/debug.browser.test.ts`, six for `explainMove` (`:56-180`) and three more for the
  native-select scan of [ADR-0021](0021-native-select-on-television.md) (`:182-222`).
- Row 1 of the Context table survives in a different shape: the zero-size filter is
  `rect.width === 0 || rect.height === 0` (`src/spatial/spatial.ts:188`,
  [ADR-0009](0009-hidden-candidates.md) C1), so a 0 x 40 element is silently *dropped* rather than
  silently focused. The move still does nothing and still says nothing, which is the symptom the
  scan exists to explain; only the reason printed next to it changes.
- Related: [ADR-0009](0009-hidden-candidates.md) for the visibility rules the scan explains, and
  [ADR-0008](0008-shadow-dom.md) for what the scan cannot see at all.
