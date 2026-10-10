# ADR-0032: A trap leaves a select nobody claimed to its default

Status: Accepted
Date: 2026-10-10
Deciders: Wesley Cormier

## Context

A `trapped` scope swallows every intent it does not let escape and nobody answered. The escapes are
three, `back`, `tabNext` and `tabPrev` (`TRAP_ESCAPES`, `src/intent-bus.ts:122-126`); for any other
intent a walk that met a trap and found no taker reported `consumed: true`. For `select` that
silenced both of the package's own defaults. `activateFocused` clicks the focused element for an
unclaimed `select` from a source with no click of its own, and stands down when the dispatch is
consumed (`src/input-system.ts:119-133`); the keydown listener cancels the key when the dispatch is
consumed or prevented (`src/input-system.ts:183`), so Enter and Space lost their native activation.

[Issue #40](https://github.com/StandarX-miralabs-tech/standarnav/issues/40) reported it, measured on
`@standarx/nav` 0.3.0 on chromium, firefox and webkit: a focused button inside a dialog scope pushed
with `{ trapped: true, within }` received 0 clicks on pad A and 0 on a real Enter, against 1 and 1
with the same page and no trap. A modal is where a confirm button is most likely to be activated,
and the trap kept the focus on it by design, so the default had nothing else to land on.

Two earlier records had worked around the swallow rather than questioned it.
[ADR-0021](0021-native-select-on-television.md) wrote that inside a trap A does not click the focused
element and made the listbox claim `select` itself.
[ADR-0022](0022-virtual-keyboard.md) found the same swallow eating the page's activations while the
keyboard, a trap, was open (point 3 of its amendment "driven on a real page, which broke three of these decisions", 2026-09-20).

## Decision

**1. An unclaimed `select` passes through a trap.** At the end of the walk the dispatch reports
`consumed: false` for `select`, and `consumed: true` for every other intent a trap met
(`src/intent-bus.ts:195-197`, the `swallowed` constant). `defaultPrevented` follows `swallowed`, or
the event's own flag when a scope asked earlier called `preventDefault()`.

**2. What that changes in the input system, and nothing else.** `activateFocused` clicks the focused
element for a pad or remote `select` inside a trap that claimed nothing, as it does outside one. The
keydown listener no longer prevents Enter and Space there, so the browser activates the focused
element. Neither function was edited.

**3. What stays.** Every other intent is still swallowed. A scope outside the trap's `within`
surface is still never asked: `select` is deliberately **not** added to `TRAP_ESCAPES`, which would
let the page behind a modal hear A. A scope inside the surface that claims `select` still wins, with
`consumed: true` and no click.

**4. Why select and why only select.** The default of `select` acts on the focus the trap already
holds, inside its surface, so it cannot reach the page behind. The default of a move or a scroll
acts on the page itself, which is what a modal that is not a native `<dialog>` exists to prevent
(Alternatives).

## Consequences

- [ADR-0021](0021-native-select-on-television.md): its statement "Inside a trap, A does not click the
  focused element" no longer holds for an unclaimed `select`. The listbox is unaffected, because its
  scope claims `select` itself and the claim wins before the walk reaches the end; the recipe stays
  valid and its consumed result is unchanged.
- [ADR-0022](0022-virtual-keyboard.md): the defect of its decision 3, a trap reporting a declined
  `select` consumed so that the page's buttons stopped answering Enter and A, can no longer arise from
  the swallow. The keyboard's own handling of `select` is left as that record wrote it.
- [ADR-0026](0026-native-handler-answer.md): decision 5, "a trap nobody answered still swallows the
  intent", now excepts `select`. A `"native"` answer is unaffected, since it already ended the walk with
  the default kept.
- Specification R4 gains the exception, and `llms.txt` and `ROADMAP.md` stop saying that nothing
  activates the focused element inside a trap.
- A modal that wanted `select` swallowed, so that nothing activates beneath its trap, must now claim
  it: `() => true` for `select` in its scope. That is a behaviour change for a consumer who relied on
  the swallow; the package is on 0.x with its API not frozen, and the commit is a `fix`.
- Bytes: no cap moved. The core line is 3.41 kB of its 3.50 kB cap, 98 %, measured below.
- Not decided: `secondary` and `contextMenu`. The issue argued they are swallowed too, but only
  `select` was measured there. They can be revisited with a measurement of their own.

## Alternatives considered

| Option | Why not |
|---|---|
| **Every unclaimed intent passes a trap** (the issue's own proposal) | An unclaimed move or scroll at a dialog's edge would keep its browser default, so the page behind a modal that is not a native `<dialog>` could scroll. Several tests that pin the swallow would invert. |
| **`select`, `secondary` and `contextMenu`** | The swallowing of the last two was read in the code, not measured, in the issue. Rejected for now, open to a measurement. |
| **Refuse, and have the consumer claim `select` itself in a `within` scope that clicks** | Duplicates `activateFocused` in every consumer. Answering `"native"` from the trap does not work as a shortcut: it ends the walk, so the contained scopes beneath the trap are never asked ([ADR-0025](0025-trap-within-its-surface.md), [ADR-0026](0026-native-handler-answer.md)). |
| **Add `select` to `TRAP_ESCAPES`** | An escape is heard by every scope, so the page beneath a modal would hear A. The exception has to live at the end of the walk, where only an unanswered intent reaches it. |

## Evidence

- Code: `src/intent-bus.ts:122-126` (`TRAP_ESCAPES`, unchanged), `:190-191` (a trap asked sets the
  swallow), `:195-197` (the `swallowed` constant and the returned dispatch). `src/input-system.ts:119-133`
  (`activateFocused`) and `:183` (the keydown's cancel), both unchanged.
- Tests, all in the commit that carries the rule: `src/intent-bus.test.ts`, "leaves a select nobody
  claimed unconsumed through a trap, the page still silenced". `src/intent-bus.browser.test.ts`,
  "lets a contained scope claim select through the trap" and "never asks a scope outside the surface
  for a select nobody inside claimed". `src/input-system.browser.test.ts`, "activates the focused
  element inside a trap that claimed nothing" (it replaced "stands down inside a trap, even one that
  claimed nothing"), "leaves Enter's native activation alone inside a trap that claimed nothing" and
  "still lets a trap swallow a move nobody claimed".
- Measured 2026-10-10 on this branch: `bun run test:unit` 142 passed in 15 files; `bun run
  test:browser` on chromium 511 passed and 1 skipped in 18 files, so 653 passed and 1 skipped (654)
  in 33 files in total; `src/intent-bus.browser.test.ts` and `src/input-system.browser.test.ts` with
  `SNAV_BROWSER=firefox` and with `SNAV_BROWSER=webkit`, 47 passed each.
- Measured 2026-10-10: `bun run build && bun run check:size`, core line 3.41 kB of its 3.50 kB cap
  (98 %), no cap raised; `bun run lint`, `bun run typecheck` and `git diff --exit-code` after the
  build exit 0.
- The defect, from the issue, on 0.3.0 on chromium, firefox and webkit: 0 clicks on pad A and 0 on
  Enter inside the trap, 1 and 1 without it. The issue's figures are the reporter's, not re-run here.
