# ADR-0033: A visually-hidden input is measured by its label

Status: Accepted
Date: 2026-10-13
Deciders: Wesley Cormier

## Context

`rectOf` (`src/dom/platform.ts:18-26`) is the one place the engine measures an element. It feeds
`collectNavNodes` (`src/spatial/spatial.ts:182`, the candidate's rect), the origin of a move
(`src/spatial/spatial.ts:502`), the focus ring (`src/focus-ring/focus-ring.ts:107`) and `explainMove`
(`src/debug.ts:60`). Before this record it returned `getBoundingClientRect()` for everything but an
`<area>` ([ADR-0031](0031-image-map-area-candidate.md)).

A consumer reported a radio group whose inputs are visually hidden, the usual pattern: `position:
absolute`, 1 px by 1 px, margin `-1px`, the label carrying the look. With the group between two
buttons, a `moveDown` from the button above skipped the group's first radio and landed on the second.
The first radio's 1x1 box sits one pixel left of its label, outside the beam of a left-aligned button
above it, while the label, which is what the user sees and aims at, is inside. Reproduced on chromium,
firefox and webkit by the new tests below. A checkbox and a switch built the same way fail the same way.

## Decision

**1. A 1x1 input is measured by its first label.** When the element is not an `<area>`, has a first
label (`element.labels[0]`), and its own box measures `width <= 1` and `height <= 1`, `rectOf` returns
the label's `getBoundingClientRect()`. Anything else is unchanged.

**2. What does not change.** An input with a real box, more than 1 px on either axis, is measured by
itself. An input with no label keeps its own box. An `<area>` still goes through
`imageOf`.

**3. Nothing else is edited.** The spatial engine, the focus ring and `explainMove` read `rectOf`
already, so all three follow without a line of their own.

## Consequences

- The focus ring outlines the label, not the 1 px input, which is what a sighted user can see.
- `explainMove` names the same winner the engine picks, since it reads the same rect.
- A 1x1 input whose label sits elsewhere on the page now navigates to that label's position, not to
  the input's. That is the intent of a label and the cost of the rule.
- An input with no label keeps its 1x1 box and is still skipped by a beam that misses it; the rule
  does not invent a target.
- Shipped as a `fix`, so a patch release ([ADR-0012](0012-versioning-and-release.md)).
- Bytes: no cap moved. Spatial engine 3.58 kB of 3.75 kB (96 %, was 3.54), focus ring 1.86 kB of
  2.00 kB (93 %, was 1.82), debug unchanged at 0.49 of 0.50 kB because `platform.js` is external to it.

## Alternatives considered

| Option | Why not |
|---|---|
| **Union of all the labels** | More bytes for a case the report did not raise; the first label is the one a control is announced and drawn with. |
| **An opt-in attribute such as `data-snav-rect`** | A new API, and every consumer would have to change its markup to get a fix for a pattern that is the norm. |
| **Widen the beam or the alignment in the geometry** | Changes the score of every element on every page to repair one kind of control. |

## Evidence

- Code: `src/dom/platform.ts:18-26` (`rectOf`), read at `src/spatial/spatial.ts:182`
  (`collectNavNodes`) and `:502` (origin of a move), `src/focus-ring/focus-ring.ts:107` and
  `src/debug.ts:60` (`explainMove`).
- Tests: `src/dom/dom.browser.test.ts:133`, "measures a visually-hidden input by its label, and any
  other input by itself"; `src/spatial/spatial.browser.test.ts:1663`, the describe
  "spatialPlugin — a visually-hidden input", test "is reached through its label when a d-pad steps
  into the group" (line 1675).
- Measured 2026-10-13 on this branch, without the rule: both new tests fail on chromium, firefox and
  webkit; the spatial one lands on the second radio instead of the first, and `rectOf` returns
  `{x: 39, y: 29, width: 1, height: 1}`.
- Measured 2026-10-13 with the rule: `src/dom/dom.browser.test.ts`,
  `src/spatial/spatial.browser.test.ts`, `src/focus-ring/focus-ring.browser.test.ts` and
  `src/debug.browser.test.ts` give 132 passed and 1 skipped on each of chromium, firefox
  (`SNAV_BROWSER=firefox`) and webkit (`SNAV_BROWSER=webkit`). `bun run test:unit` 142 passed in 15
  files; `bun run test:browser` on chromium 513 passed and 1 skipped in 18 files; `bun run test` 655
  passed and 1 skipped (656) in 33 files.
- Measured 2026-10-13: `bun run build && bun run check:size` for the figures above, no cap raised;
  `bun run lint`, `bun run typecheck`, `bun run check:package` and `git diff --exit-code` after the
  build exit 0.
- The report is a consumer's, not re-run here beyond the reproduction in the new tests.
