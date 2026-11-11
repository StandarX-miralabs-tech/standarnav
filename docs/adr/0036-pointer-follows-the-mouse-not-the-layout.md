# ADR-0036: pointerFollowsFocus follows the mouse, not the layout

Status: Accepted
Date: 2026-11-11
Deciders: Wesley Cormier

## Context

In `app` mode `spatialPlugin` follows the pointer by default ([ADR-0007](0007-navigation-modes.md)):
a capture `pointerover` listener on the document focuses the focusable it reaches
(`src/spatial/spatial.ts:602-632`). Browsers also send `pointerover` when the mouse has not moved
at all: a node mounted under it, or a scroll that brings another node under it, becomes the new
target. Every one of those events moved the focus.

A consumer, miralabs-ui, measured the effect in its pull request #158: under chromium and webkit a
button mounted under a parked mouse took the focus back right after a gamepad `moveDown`. The product
risk is a pad scrolling a list while the mouse rests on it, with the focus jumping to the row under
the cursor. Its own test now parks the mouse outside the scene to stay green.

Measured here on 2026-11-11 with a Playwright probe (headless, mouse parked, 300 ms wait):

| Event under a resting mouse | chromium | firefox | webkit |
|---|---|---|---|
| a button mounted under it | nothing in 300 ms | `pointerover` | `pointerover` |
| a list scrolled under it | `pointerover` | `pointerover` | `pointerover`, then a `pointermove` |

Every event in the table carries the `clientX` and `clientY` the mouse already had. The webkit
`pointermove` rules out the fix the consumer suggested, following only after a `pointermove`.

## Decision

**1. A `pointerover` at unchanged coordinates is ignored.** The plugin keeps the last `clientX` and
`clientY` it saw, from `pointermove` and from `pointerover`. A `pointerover` at the same coordinates
comes from the layout and leaves the focus where it is. A `pointerover` at new coordinates comes from
the mouse and is followed as before.

**2. No recorded coordinates means record, not follow.** Until the plugin has seen one pointer
event there is no evidence the mouse moved, so the first `pointerover` after the set-up only records
its coordinates. That covers the consumer's case in both orders: a scene mounted under a mouse parked
before the plugin started, and a node mounted under a mouse parked after it. A real mouse sends a
`pointermove` with the first crossing, so the next crossing is followed.

**3. Nothing else changes.** The hover still bypasses `onWillMove`. It still writes the
marker and the container memory only when the focus landed ([ADR-0005](0005-real-dom-focus.md)).
`pointerFollowsFocus: false` still turns the whole listener off.

## Consequences

- A pad that scrolls a list, or a scene that mounts under a parked mouse, keeps its focus on every
  engine. The next real mouse move takes the focus again.
- The first element a mouse crosses after the set-up is not focused, only the next one. A synthetic
  `pointerover` dispatched with no coordinates is ignored once the plugin has seen one at `0, 0`. The
  five such dispatches in `src/spatial/spatial.browser.test.ts` now go through `pointAt`, a move at
  one point then the crossing at the next. In miralabs-ui `origin/main`, read on 2026-11-11 and not
  run, three tests dispatch a synthetic `pointerover`, for a tooltip, a toast stack and the vanilla
  parity scene; none of them asserts that the focus follows the pointer.
- A second capture listener, `pointermove`, is installed while the pointer is followed. It only
  stores two numbers.
- A layout change that happens while the mouse is moving is followed as before: its `pointerover`
  arrives at new coordinates.
- Shipped as a `fix`. Bytes: no cap moved. The spatial engine goes from 3 726 B to 3 791 B min+gzip,
  of a 3 840 B cap (3.75 kB), so 49 bytes are left.

## Alternatives considered

| Option | Why not |
|---|---|
| **Follow only after a `pointermove`** | The consumer's suggestion. Webkit sends a synthetic `pointermove` after a scroll, so a scroll under a resting mouse would still steal the focus there. |
| **Ignore `pointerover` for one frame after each engine move** | It covers the pad's own scroll, not a mount or a scroll the application makes, and it adds a timer to the plugin. |
| **Change nothing, document `pointerFollowsFocus: false`** | No bytes, but every `app` page that mixes a pad and a mouse keeps the jump. |

## Evidence

- Code: the `followPointer` block in `setup`, `src/spatial/spatial.ts:602-632`, with `moved`
  comparing the coordinates.
- Tests: `src/spatial/pointer-follow.browser.test.ts`, four cases driven by `userEvent.hover`, that
  is by the real mouse: a scroll under a resting mouse, a mouse that moves after it, a node mounted
  under a mouse parked after the set-up, and a scene mounted under a mouse parked before it. Measured
  2026-11-11 with `bun run test --project browser src/spatial/`: 103 passed and 1 skipped on
  chromium, firefox and webkit (the last two with `SNAV_BROWSER`). With the change to `spatial.ts`
  stashed, the new file fails 3 of 4 on chromium and firefox and 2 of 4 on webkit, where the scene
  mounted under a mouse parked before it is green without the change.
- Bytes: `bun run build` then `scripts/size-budget.ts` printing bytes, on 2026-11-11: spatial engine
  3 726 B without the change, 3 791 B with it, cap 3 840 B.
- Request: miralabs-ui, measured in its pull request #158; its test "keeps the crossing when the mouse
  rests where the scene will mount" in `packages/react/src/components/gamepad.browser.test.tsx` of that
  repository.
