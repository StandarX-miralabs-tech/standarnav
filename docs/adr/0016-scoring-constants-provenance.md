# ADR-0016: Scoring constants and their provenance

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The feel of spatial navigation is four numbers and one formula. Press right on a
grid and focus goes to whichever candidate minimises a score; change a weight and
the product feels different. The numbers came from three different places and the
code does not say which came from where, so the next person to touch one would
"tidy" a constant whose origin is a browser engine. Extracting the engine (see
[ADR-0003](0003-extraction-scope.md)) is the moment to write it down.

There is a second reason. It would be easy, and wrong, to describe this engine as
"Chromium's spatial navigation algorithm". Two of the weights are Chromium's. The
formula is not.

The relevant source is `packages/core/src/input/spatial/geometry.ts` (278 lines,
read on 2026-09-18), pure arithmetic over rectangles with no DOM access.

## Decision

The constants and the rule are recorded as follows, and stay as they are for v0
parity with the source engine.

| Name | Value | Origin |
|---|---|---|
| `overlapThreshold` | `0.3` | BBC `lrud-spatial`'s directional overlap tolerance, its default, configurable there via `data-lrud-overlap-threshold`. Here it is a `ScoreOptions` field, not an attribute. |
| `weightHorizontal` | `30` | Blink `kOrthogonalWeightForLeftRight`, `third_party/blink/renderer/core/page/spatial_navigation.cc:673`. |
| `weightVertical` | `2` | Blink `kOrthogonalWeightForUpDown`, same file, line 674. |
| `alignBonus` | the origin's own size across the move | Local choice, self-calibrating. Blink's `kAlignWeight = 5` (same file, line 583) exists but is **not** used here. |

The threshold becomes a tolerance in pixels, `threshold × (horizontal ?
origin.width : origin.height)`, and a candidate is dropped when its axis gap is
below `-tolerance` (geometry.ts:147-148, 160-161). `alignBonus` defaults to
`horizontal ? origin.height : origin.width` (geometry.ts:152), so large tiles and
thin rows each get a bonus on the scale of what is being navigated.

The score, minimised, is (geometry.ts:130-132):

```
euclid + max(0, gap) + weight × orthogonal − sqrt(intersection) − alignBonus × ratio
```

where `euclid` is the distance between the exit point P1 (middle of the edge the
focus leaves by) and the entry point P2 (nearest point of the candidate's entry
edge), `orthogonal` is the off-axis component of that same segment,
`intersection` is the area the two rectangles share, and `ratio` is the
projection overlap normalised into `[0, 1]` (geometry.ts:84-128).

**This is not Blink's formula.** It borrows Blink's two orthogonal weights and
puts them into a scoring function whose shape comes from the css-nav-1 /
`lrud-spatial` edge-to-edge distance, plus two subtractive bonuses that are this
project's own. Documentation says what the engine does; it never says it
implements Chromium's algorithm.

The winner is chosen in one loop with two accumulators, `aligned` and `any`,
returning `aligned ?? any` (geometry.ts:154-185). Semantically that is the tvOS
two-pass rule — a candidate whose orthogonal projection overlaps the origin wins
over one that merely scores well — implemented in a single traversal. Ties go to
the earlier candidate, and candidates are collected in document order, so the
tie-break is DOM order (geometry.ts:135-138).

When nothing is eligible and the container wraps, `findWrapCandidate`
(geometry.ts:245-278) picks the far side of the *same* row or column: it filters
to candidates whose orthogonal projection overlaps, falls back to all of them
when that set is empty, and takes the extreme edge against the direction of
travel. Wrapping right from the end of row two lands at its start, not the grid's.

Any change to a constant, to the formula, or to the winner rule requires a
geometry fixture that fails before the change and passes after it. A weight moved
without a fixture is a regression no one can name.

### Timing constants outside the score

Two more numbers decide behaviour the same way a weight does, and they are
recorded here because they have no provenance to cite and should not acquire a
false one by silence.

| Name | Value | Origin |
|---|---|---|
| `POINTER_INTENT_MS` | `300` | Local choice. It is how long continuous mouse movement must last before it takes the modality away from a keyboard or gamepad session. Not measured against user testing; the rationale is written at its declaration, the number is not derived from it. |
| `POINTER_STREAK_GAP_MS` | `100` | Local choice, and the one with the least behind it: the gap that ends a streak, so that a pointer set down and moved later does not accumulate age across the pause. No external source. |

Both live in `src/modality.ts`. They carry the same rule as the scoring
constants: changing either wants a fixture that fails before and passes after.
`src/modality.test.ts` pins the inclusive boundary of the first one at 299 and
300 milliseconds, which is why that case asserts both sides rather than one.

## Consequences

- The numbers are traceable. A reader who wonders why horizontal moves punish
  being off-axis fifteen times harder than vertical ones (`30` against `2`, the
  two Blink weights of the table above) gets the answer and the file it came
  from.
- `alignBonus` is the one constant with no external authority. It is a local
  heuristic, so it is the first thing to question if alignment ever feels wrong.
- Keeping v0 at parity means inheriting the source engine's behaviour including
  its imperfections. That is deliberate: the extraction is a move, not a rewrite,
  and behaviour changes belong in their own commits with their own fixtures.
- `scoreCandidates` (geometry.ts:197-238) recomputes the same score for the debug
  overlay, kept a separate loop on purpose so `findBestCandidate` stays free of
  debug bookkeeping on the hot path (doc comment, geometry.ts:197-202). Two call
  sites for one rule is a drift risk; the fixture requirement keeps them honest.
- The performance claim needs care. The bench (`geometry.bench.ts`) measures
  `findBestCandidate` alone, on lattices of 200 and 2000 synthetic rectangles
  (80×40 cells on a 90×50 pitch). It does not measure candidate collection,
  `querySelectorAll`, `getBoundingClientRect` or `checkVisibility`, and the guard
  in `geometry.test.ts:156-177` (median of 51 samples under 1 ms for 200
  candidates) has the same blind spot. Neither is an end-to-end move budget, and
  documentation must not present them as one. What a real move costs on a
  television is not measured yet.
- The size of this engine is budgeted separately; see [ADR-0017](0017-size-budgets.md).

## Alternatives considered

**Blink's exact formula.** Take the whole of `spatial_navigation.cc`, weights,
alignment term and all. Rejected for v0: it would change behaviour on day one
with no fixture saying what improved, and break parity with the source
repository about to become a consumer. It stays a future experiment, gated on
fixtures.

**`lrud-spatial`'s scoring as-is.** Shortest line between exit edge and entry
edge, with the 30 % overlap tolerance of the table above (`0.3`) and nothing
else. Rejected: the orthogonal weighting and the alignment bonus are what stop a
right-press from landing a row down on a ragged grid, the behaviour the tvOS
two-pass rule exists to produce.

**Learned or auto-tuned weights.** Fit the constants to recorded navigation
sessions. Rejected: there is no corpus, no device testing yet, and a score
function no fixture can reason about cannot be debugged from a support ticket.

**Exposing the constants as data attributes,** the way `lrud-spatial` exposes
`data-lrud-overlap-threshold`. Not taken for v0: they are `ScoreOptions` fields
on the plugin. Per-container overrides via attributes remain open.

## Evidence

- miralabs-ui `packages/core/src/input/spatial/geometry.ts`, read 2026-09-18:
  constants at lines 41-43; `ScoreOptions` at 28-39; `scoreOf`
  at 74-133, returned formula at 130-132; `findBestCandidate` at 140-186, its two
  accumulators at 154-185; DOM-order tie-break at 135-138; `scoreCandidates` at
  197-238; `findWrapCandidate` at 245-278.
- `alignBonus` default: `options?.alignBonus ?? (horizontal ? origin.height : origin.width)`,
  geometry.ts:152.
- BBC 30 % default and its `data-lrud-overlap-threshold` attribute: miralabs-ui
  `docs/research/input.md` §0, reference implementations, and §3.2 step 2 — the
  engine specification of 2026-08-27, deleted by commit `289fa607` and readable
  with `git show 289fa607^:docs/research/input.md`; the same file's §3.2 step 4
  records the Blink weights and the score formula, and its reference list links
  https://github.com/bbc/lrud-spatial.
- Blink constants, `third_party/blink/renderer/core/page/spatial_navigation.cc`
  on `main`, fetched 2026-09-18: line 673 `const int kOrthogonalWeightForLeftRight = 30;`,
  line 674 `const int kOrthogonalWeightForUpDown = 2;`, line 583
  `const int kAlignWeight = 5;` — the third is present in Blink and unused here.
  https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/page/spatial_navigation.cc
- tvOS two-pass rule and the alignment bias it produces: miralabs-ui
  `docs/research/input.md` §0 (tvOS Focus Engine) and §3.2 step 3, same deleted
  file.
- Bench scope: `packages/core/src/input/spatial/geometry.bench.ts`, read
  2026-09-18 — `lattice(200, 20)` and `lattice(2_000, 40)`, 80×40 cells on a
  90×50 pitch, three benches all calling `findBestCandidate`. Timing guard:
  `geometry.test.ts:156-177`, 200 warm-ups then the median of 51 samples under 1 ms.
