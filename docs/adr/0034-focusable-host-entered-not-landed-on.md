# ADR-0034: A focusable host that holds focusables is entered, not landed on

Status: Accepted
Date: 2026-11-09
Deciders: Wesley Cormier

## Context

`collectNavNodes` (`src/spatial/spatial.ts:170`) turns the document-order list of focusables into the
candidates of a move. Until this record it kept every focusable that was not ignored, and a
focusable element that holds other focusables was scored as a candidate like any other.

A consumer reported a segmented control, a toggle group, whose root carries `tabindex="-1"` while it
overflows: without it, Firefox makes the scrolling container a Tab stop of its own. That attribute
puts the root in `FOCUSABLE_SELECTOR`. The root holds the segments, so it is the larger box and the
nearest edge, and a `moveDown` from a button above landed on the root instead of on a segment. The
same root was also declared `data-snav="container"`, and that case was worse: the root was scored as
a plain element, its children were dropped as already seen (the `seen` set of `collectNavNodes`),
and the container's entry strategy, `data-snav-enter`, never ran.

The documented opt-out, `data-snav-ignore`, does not help: the engine matches it with `closest`
(`src/spatial/spatial.ts:177`), so ignoring the host ignores the items inside it too. Ignoring is
the opt-out [ADR-0009](0009-hidden-candidates.md) names for removing a candidate.

## Decision

**1. A host that holds a focusable is not a candidate when it is taken out of the tab order or
declared a container.** In `collectNavNodes` (`src/spatial/spatial.ts:174-187`) a focusable element
is skipped when both hold:

- its `tabindex` **attribute** parses to a negative number, or it matches `[data-snav="container"]`
  (`src/spatial/containers.ts:10`); and
- it contains the next entry of the document-order focusable list, which is its first focusable
  descendant if it has one, so one `contains` call decides it.

Its children stay candidates. A declared container that is itself focusable is now scored as a
container, entered through its entry strategy ([ADR-0006](0006-declarative-first.md)), not as a
plain element.

**2. The attribute, not `tabIndex`.** The `tabIndex` property reads -1 on an editing host, which is
a Tab stop and a place to type. Reading the attribute leaves it a stop.

**3. What does not change.** A host that holds nothing focusable stays a target. A host with
`tabindex` of 0 or more that is not a container stays a target. `FOCUSABLE_SELECTOR`, `isFocusable`,
`getFocusables` and the Tab order are untouched, so `isTabbable` answers as before.

## Consequences

- A scrolling composite needs only `tabindex="-1"` on the overflowing list; the engine goes to its
  items. Adding `data-snav="container"` gives it an entry strategy on top.
- A focusable container with a non-negative `tabindex` stays in the tab order and is entered by the
  d-pad all the same.
- An ignored (`data-snav-ignore`) descendant still counts as "holds a focusable", because the test
  reads the next entry of the list before the ignore filter. A host whose only focusable child is
  ignored is skipped and offers no way in; ignoring that child was already a decision to make it
  unreachable.
- Shipped as a `fix`, so a patch release ([ADR-0012](0012-versioning-and-release.md)).
- Bytes: no cap moved. Spatial engine 3.64 kB of 3.75 kB (was 3.58), debug unchanged at 0.49 of
  0.50 kB.

## Alternatives considered

| Option | Why not |
|---|---|
| **An opt-in attribute such as `data-snav-ignore-self`** | A new API, every consumer would have to change its markup, and the bug of the focusable container would remain. |
| **Both the rule and the attribute** | More bytes and more API for a need nobody has shown. |
| **Test `tabIndex < 0`** | Catches an editing host, which reads -1 and must stay a stop. |
| **Drop every `tabindex="-1"` element** | A roving item is `tabindex="-1"` and steering to it is the d-pad's whole job ([ADR-0009](0009-hidden-candidates.md)); only a host that holds focusables is skipped. |

## Evidence

- Code: `src/spatial/spatial.ts:174-187`, inside `collectNavNodes`; the container selector at
  `src/spatial/containers.ts:10`.
- Tests: the describe "a focusable host that holds focusables" in
  `src/spatial/spatial.browser.test.ts:514-581`, six cases: "is never the target of a move, and its
  children are" (line 525), "is entered as a container when it is also declared one" (534), "is
  entered as a container when it is declared one and stays in the tab order" (543), "stays a target
  while it holds nothing focusable" (552), "keeps an editing host that holds a control, whatever its
  tabIndex reads" (564) and "keeps a host that is in the tab order and not a container" (573).
- Measured 2026-11-09 without the rule, by stashing the code: three of the six fail, the first
  three above.
- Measured 2026-11-09 with the rule: `SNAV_BROWSER=<engine> bun run test --project browser
  src/spatial/spatial.browser.test.ts` exits 0 on chromium, firefox and webkit, 99 passed and 1
  skipped each.
- Measured 2026-11-09: `bun run build && bun run check:size` for the figures above, no cap raised.
- The report is a consumer's, not re-run here beyond the reproduction in the new tests.
