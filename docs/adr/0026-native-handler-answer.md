# ADR-0026: A scope may answer "native": the walk ends and the default acts

Status: Accepted
Date: 2026-09-23
Deciders: Wesley Cormier

## Context

A handler had two answers. `true` claims the intent: the walk stops and the input system cancels
the key. `false`, or nothing, passes it on to the next scope down. Neither lets a scope say "the
platform serves this key, leave it alone", and in `app` mode that is the answer a native control
needs. [Issue #15](https://github.com/StandarX-miralabs-tech/standarnav/issues/15) reported it.

In `app` mode the spatial engine takes every direction: the only keyboard direction it declines
is one in `composite` mode (`src/spatial/spatial.ts:571`). The engine is a `base` scope at the
bottom of the stack, so a direction nobody above claimed reaches it, it moves the focus, and the
keydown listener cancels the key because the dispatch came back consumed
(`src/input-system.ts:183`). No composite scope is needed for the defect: on a plain page in
`app` mode, ArrowDown on a focused native radio moves the focus to the next radio and checks
nothing, and ArrowRight on a range moves the focus off it and leaves the value alone. A scope
that declines cannot help either: declining is what hands the key to the engine. A component
cannot compensate from its side, since it does not know which mode the page runs in.

Measured with real key presses on 2026-09-23 on chromium, firefox and webkit (Evidence): with
nothing installed, ArrowDown and ArrowRight check the next radio and move the focus with it,
ArrowUp and ArrowLeft the previous one, and a range steps by one on every arrow; chromium and
firefox wrap from the last radio to the first, webkit stops on it.

## Decision

**1. A third answer.** `IntentHandler` returns `boolean | "native" | void`
(`src/intent-bus.ts:49`). `"native"` stops the walk where it is answered: no scope beneath is
asked, `base` scopes and the spatial engine included (`:184-187`). The default is left to act.

**2. One channel.** The answer is the return value and nothing else. There is no
`event.allowDefault()`: the event already has `preventDefault()`, and a second method pulling the
other way would need an order between the two.

**3. The dispatch reads as an intent nobody answered.** `consumed` is `false`, and
`defaultPrevented` is whatever the event carries (`:197`): `false`, unless a scope asked
*earlier* called `preventDefault()`, which the answer does not undo. Specification R2 already says
a scope cannot undo what an earlier one did to the event. `IntentDispatch` gains no field; its
`consumed` doc comment now says what `"native"` reports (`:78-83`). The keydown listener needs no
new branch: it cancels the key only for a consumed or prevented dispatch (`src/input-system.ts:183`).

**4. The package's own default runs too.** `activateFocused` clicks the focused element for an
unclaimed `select` from a source with no click of its own (`src/input-system.ts:119-133`). A pad
`select` answered `"native"` gets that click, exactly as one nobody answered; a keyboard `select`
still does not (`:127`), because the browser clicks. So the rule has one clause: `"native"` hands
the intent back to whoever dispatched it, unclaimed, and that dispatcher's default happens — the
browser's for a key, the emulated click for a pad `select`, an application's own fallback for an
`emit` it made and reads.

**5. Traps.** A `"native"` answer from any scope the walk actually asks ends it with the default
kept: the trap itself, a `base` scope beneath it, or a scope asked through the trap's surface
([ADR-0025](0025-trap-within-its-surface.md)). A trap nobody answered still swallows the intent
(`src/intent-bus.ts:196`), and a scope the trap silences is never asked, so its `"native"` is
never heard.

**6. No automatic exclusion in the engine.** The issue's other proposal was for `app` mode to
skip keyboard moves whose target natively consumes arrows. [ADR-0007](0007-navigation-modes.md)
already rejected an engine that recognises controls from the outside, on markup it does not own
(its table of alternatives, "Auto-detect"). And it would lock a television user in: a remote's
arrow keys reach the page as `ArrowUp` to `ArrowRight` and resolve with source `keyboard`
(`KEY_INTENTS`, `src/keymap.ts:47-51`; specification R9 names the only remote keys resolved as
`remote`), so an engine that left every keyboard arrow on a radio to the browser would leave a
remote's arrows there too — and on chromium and firefox a radio group wraps, so no arrow ever
leaves it.

**7. Gamepad and remote: documented, no engine rule.** A pad has no native default for a
direction: `"native"` for a pad direction stops the walk and moves nothing. A handler therefore
answers `"native"` for `event.source === "keyboard"` only. That does not tell a remote from a
keyboard (decision 6), so the recipe answers `"native"` only along the control's own axis — the
vertical arrows for a vertical radio group, the horizontal ones for a range — and leaves the other
axis to the spatial engine, which always gives a way out. A pad still moves spatially and uses
engage mode for a value control (specification R7).

**8. React.** `useIntent` registers `(event) => latest.current(event)` (`src/react/react.tsx:312`)
and `useIntentScopeHost().pushScope` registers the handler as given (`:231-234`), so both return
the answer unchanged; `IntentHandler` is re-exported from `./react` with its new type.

## Consequences

- Non-breaking for every existing handler. The return type widens, which only a consumer that
  *calls* an `IntentHandler` and treats the result as a boolean can notice. It is a `feat`, so the
  next release is 0.3.0.
- A pad route given to `assign(padIndex, route)` bypasses the bus and its return value is ignored
  (`src/gamepad/gamepad.ts:185`), so `"native"` there means what `false` means: nothing.
- Bytes (`bun run build && bun run check:size`, 2026-09-23): core 3290 to 3310 bytes min+gzip,
  3.23 kB, against its 3328-byte cap, 18 left. React adapter unchanged at 1.42 kB. No cap moved.
- Specification R4, R6 and R11 describe the answer; `docs/en/navigation.md`, `docs/en/react.md`
  and their French mirrors carry the recipe; `llms.txt` lists the return type.

## Alternatives considered

| Option | Why not |
|---|---|
| **The engine skips native controls in `app` mode** (the issue's second proposal) | Detection from markup the engine does not own, which [ADR-0007](0007-navigation-modes.md) rejected, and a trap for a remote user on a wrapping radio group (decision 6). |
| **`event.allowDefault()`** | Two channels for one decision, and an order between `preventDefault()` and it that every reader would have to learn. |
| **`"native"` reported as `consumed: true`, `defaultPrevented: false`** | `activateFocused` reads `consumed` as "a scope acted" and would stand down, so a pad's click would vanish; and an application that falls back on an unconsumed `emit` would stop falling back. Two meanings for one field. |
| **A new `native` field on `IntentDispatch`** | Nothing in the package reads it, and a caller branching on it would treat an answered `"native"` differently from an unanswered intent, which is the incoherence decision 4 exists to avoid. Bytes on the core line for no reader. |
| **A scope option listing the intents left native** | Static: it cannot read where the focus is, and the recipe needs `contains(document.activeElement)`. |

## Evidence

- Code: `src/intent-bus.ts:49` (`IntentHandler`), `:77-85` (`IntentDispatch`), `:184-187` (the
  answer ends the walk and clears the trap), `:196-197` (the swallow and the unanswered result).
  `src/input-system.ts:119-133` (`activateFocused`, unchanged), `:180-183` (the keydown's cancel,
  unchanged but for its comment).
- Tests: `src/intent-bus.test.ts:161` onwards, six cases — true and false as before, the walk
  stopped above a `base` scope, an earlier `preventDefault` kept, a `base` scope and the trap
  itself answering through a trap, a silenced scope never heard. `src/intent-bus.browser.test.ts`,
  "ends the walk with the default kept when a contained scope answers native" and "still swallows
  when the scope that would answer native lies outside the surface". `src/input-system.browser.test.ts:414`
  onwards, four cases including "lets the emulated click run for a pad select answered native, as
  for one nobody claimed". `src/native-answer.browser.test.ts`, real key presses through the
  browser provider: a radio checked by ArrowDown (`:97`), the other axis leaving the group (`:118`),
  a range stepped and left (`:130`), and without the scope the engine moving as before (`:152`).
  `src/react/react.browser.test.tsx:1049` and `:1066`, through `useIntent` and the scope host.
- Red first, 2026-09-23, before the implementation: `bun run test` → 12 failed, 420 passed,
  1 skipped (433), 5 of 26 files failed; for instance `expected 'r1' to be 'r2'` on the radio and
  `expected '5' to be '6'` on the range.
- Green, 2026-09-23: `bun run test` → 433 passed, 1 skipped in 26 files;
  `SNAV_BROWSER=firefox bun run test:browser`, and the same with `webkit`, → 316 passed, 1 skipped
  in 15 files each. The React peer floor, on a copy of the tree with `bun add --dev
  react@^18.3.1 react-dom@^18.3.1 @types/react@^18.3 @types/react-dom@^18.3`: `bun run typecheck`
  green and the chromium browser suite green, the same day.
- Real page, 2026-09-23: the playground served by `bun x vite playground --port 5190
  --strictPort`, a radio group and a range injected, a scope pushed on each through
  `window.snav.input` answering `"native"` for keyboard moves while the focus is inside, real
  ArrowDown and ArrowRight from Playwright. At 16692d2: the focus moved to the second radio with
  the first still checked, and off the range with its value at 5, on chromium, firefox and webkit.
  With this change: the second radio checked and focused, the range at 6 and still focused, on all
  three. Without the scope, the branch behaves as 16692d2 did.
