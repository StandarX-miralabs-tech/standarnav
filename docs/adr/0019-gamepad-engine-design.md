# ADR-0019: Gamepad engine design, inherited and recorded

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The gamepad engine is not designed here. Its design is inherited from the predecessor
implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here; it arrived
whole, across a package boundary drawn elsewhere ([ADR-0003](0003-package-boundaries.md)). This ADR
records the design and its reasons here, so that the numbers stop being folklore, and marks what is
still unverified. It lives in `src/gamepad/{gamepad.ts, mapping.ts, dead-zone.ts, repeat.ts}` — 464,
91, 95 and 63 lines — and every bare `file.ts:line` citation below names a file in that directory,
counted in this repository. Three facts frame it:

- The Gamepad API is polling-only. No browser fires an event when a button changes; the state has
  to be read from `navigator.getGamepads()` inside a loop. The event-driven proposal
  (`gamepadrawinputchanged`, MSEdge explainer) is exploratory, not implemented, and aimed at cloud
  gaming latency rather than at menus — see the explainer under Evidence. Only `gamepadconnected`
  and `gamepaddisconnected` are reliable.
- One normalised layout exists: `mapping === "standard"` (buttons 0-3 the face cluster, 12-15 the
  d-pad, axes 0/1 the left stick, 2/3 the right stick). When `mapping` is empty the button order is
  arbitrary, which is why `setMapping` exists at all (`mapping.ts`).
- None of the eighteen competing projects surveyed on 2026-09-18 calls `navigator.getGamepads`
  ([docs/research/competitors.md](../research/competitors.md)). Inside that set there is no prior art
  to copy and no second implementation to compare against.

## Decision

The engine ships as inherited for v0, with its reasons recorded below and its open items written
down rather than quietly carried.

**Polling loop, lazy start, aggressive stop.** A `requestAnimationFrame` loop runs only while a pad
is connected **and** the document is visible **and** the plugin is mounted and not paused — `frame`,
`schedule` and `start` between them hold all four conditions (`gamepad.ts`).
`visibilitychange` to hidden cancels the frame explicitly rather than trusting a background tab's
rAF throttling — "slower" is not "stopped", and battery is a promise (`gamepad.ts`). The
loop stops itself when the last pad disappears (`gamepad.ts`).

**Silent re-read on return.** Coming back from a hidden tab, from `resume()`, or finding a pad
already exposed at setup sets a `resync` flag: the next frame calls `snapshot`, which reads every pad
into the arrays and emits nothing (`gamepad.ts`). Without it, a button held during the pause
surfaces as a phantom activation on return.

**Two dead-zone regimes, because they are two problems.**

| Reading | Treatment | Defaults | Source |
|---|---|---|---|
| Continuous (right stick, `scrollX`/`scrollY`) | radial cut on the magnitude, renormalised `(mag − dz) / (1 − dz)`, then a response curve | `deadZone = 0.15`, curve `quadratic` | `dead-zone.ts` |
| Discrete (left stick, `move*`) | four 90° sectors with double hysteresis and an angular margin | enter `0.5`, release `0.3`, margin `12°` | `dead-zone.ts` |

Per-axis thresholds are what a radial cut replaces: a square hole lets a diagonal through at a
lower true deflection than a straight push, so the stick feels stronger on the diagonals. Sector
hysteresis stops a stick held near 45° alternating at frame rate (`dead-zone.ts`, and the two
dead-zone references under Evidence).

**Repeat belongs to the engine.** The keyboard gets auto-repeat from the OS and the pad gets none, so
the engine owns the ladder: first repeat after `400 ms`, then every `130 ms`, then `60 ms` once six
repeats have elapsed. On a stick the interval is modulated by magnitude
instead, `250 ms → 60 ms` between half deflection and full. Both ladders are in `repeat.ts`. Only
`move*`, `pageUp`/`pageDown` and `tabNext`/`tabPrev` repeat; `select` never does (`mapping.ts`).

**Standard mapping is the grammar.**

| Button | Intent | | Button | Intent |
|---|---|---|---|---|
| 0 A / Cross | `select` | | 6 LT | `pageUp` |
| 1 B / Circle | `back` | | 7 RT | `pageDown` |
| 2 X / Square | `secondary` | | 9 Start | `contextMenu` (alias) |
| 3 Y / Triangle | `contextMenu` | | 12-15 d-pad | `moveUp/Down/Left/Right` |
| 4 LB | `tabPrev` | | right stick | `scrollX` / `scrollY` |
| 5 RB | `tabNext` | | 8, 10, 11 | unmapped |

Source: `mapping.ts`. The same table is the fallback for a pad reporting no mapping at all:
the first four buttons are the face cluster on essentially every controller made.

**Triggers use a threshold pair.** LT and RT are analogue, so `pressed` is computed with hysteresis
— `> 0.5` to press, `> 0.3` to stay pressed (`isTriggerPressed`, `mapping.ts`, applied in
`pollButtons` at `gamepad.ts`) —
otherwise a worn pad chatters at rest.

**Escape hatches.** `setMapping(gamepadId, overrides)` applies a remap; the library applies, the
application persists, because a core with zero dependencies does no I/O (`gamepad.ts`).
`padType(index)` parses `Gamepad.id` into `xbox | dualsense | switch |
generic` for glyphs — `detectPadType` is a heuristic over vendor text, not a lookup
(`mapping.ts`). `swapNintendoConfirm` is **off by default**: the standard mapping already
normalises by physical position, so confirm stays under the thumb that confirms on every other pad;
the option exists for applications that would rather match the printed glyph (`mapping.ts`,
read at `gamepad.ts`).

**Multi-pad merge by default.** Every connected pad drives the same navigation — any pad in the
living room works — and `activeIndex` is the pad that moved last, set by `emit` and exposed as a
getter, for glyphs (`gamepad.ts`). `assign(padIndex, route)` opts into the
other shape: one pad's intents go to a handler of its own. The intent bus has no named scopes, so the
route is the handler itself, which needs no registry and is strictly more general than an id
(`gamepad.ts`).

**Haptics are progressive enhancement.** `rumble()` calls `vibrationActuator.playEffect("dual-rumble")`
when it exists and swallows the rejection otherwise; nothing vibrates on its own (`gamepad.ts`).

**`GamepadRuntime` is a test seam.** `getGamepads`, `requestFrame` and `cancelFrame` are injected
(taken from the options and otherwise built from the window by `defaultRuntime`, all in
`gamepad.ts`): frames are driven one at a time in tests with no
hardware — see [ADR-0018](0018-testing-strategy.md) — and a TV shim could replace them.

**Zero-allocation loop.** Per-frame state lives in typed arrays allocated once (`gamepad.ts`)
and every helper returns a scalar. `navigator.getGamepads()` allocates its own array on each call;
nothing on this side adds to it.

## Consequences

- The engine costs one rAF callback while a pad is connected, and nothing otherwise; an application
  that never imports it ships zero bytes of it.
- Every default above is documented, so changing one is a visible decision. Each becomes an option
  carrying its current value as the default; any change requires a frame-driven test.
- The design survives the event-driven proposal landing: the loop only diffs a snapshot and calls
  `emit`, so a future event source would replace the reading without touching the public API.
- Chrome only reveals a pad after the user presses something on it — which is why the
  `gamepadconnected` handler is also a `resync` point (`gamepad.ts`) — so `onConnected` may
  fire late or not at all. Applications must expect it late, not gate a UI on it.

## Open items recorded, not resolved

Line references in this table, like everywhere else in this record, are this repository's.

| Item | Where | Status |
|---|---|---|
| `MAX_BUTTONS = 20` while the standard table has 16 entries | `gamepad.ts`, `mapping.ts` | Still unexplained, but no longer untested. `src/gamepad/gamepad.browser.test.ts:316-324` reads twenty buttons and stops there, driven by a harness with a settable button count so the engine's own bound is what the assertion reads. The four extra slots are polled and resolve to `null` unless `setMapping` overrides them. Kept for v0 parity; the *reason* is still owed. |
| The modality is pushed on every emission, including the two closing zeros of the scroll | `gamepad.ts` | Unchanged and still open. A stick returning to centre re-asserts `gamepad` modality. Harmless today, wrong in principle; to be verified against the anti-flicker rule before it becomes a fix. |
| No test on real hardware | — | Unchanged. Not measured. Every gamepad test runs through the runtime seam with synthetic pads: nothing in this repository is evidence about a physical controller, a television or a Steam Deck ([ADR-0014](0014-device-and-browser-matrix.md)). |
| `MAX_PADS = 4` | `gamepad.ts` | Inherited limit, no stated reason in the predecessor implementation and no ADR of its own — that part stands. The boundary fixture [ADR-0018](0018-testing-strategy.md) asked for is written: `src/gamepad/gamepad.browser.test.ts:304-314` polls four pads and ignores a fifth, from a harness offering six slots. |

## Alternatives considered

- **Event-driven design, waiting for the proposal.** Rejected: `gamepadrawinputchanged` is an
  explainer at the exploration stage (linked under Evidence), implemented by no browser, so polling
  is the only mechanism that exists today. Waiting would mean shipping no gamepad support at all.
- **Per-axis dead zones.** Rejected: they carve a square hole, which biases diagonals — the stick
  reads as stronger off-axis than on it (`dead-zone.ts`, and the two references below).
- **A single dead-zone treatment for both sticks.** Rejected: one flick must mean exactly one move
  for navigation, and scrolling must be continuous. One treatment cannot be both.
- **Automatic confirm/cancel swap on Nintendo pads.** Rejected as a default, kept as an option: the
  standard mapping normalises by position, so swapping again moves confirm off the usual thumb.

## Evidence

- The original engine specification, written before the extraction, is inherited from the
  predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here: it
  is not part of this tree, and nothing above rests on it that the code and the sources below do not
  also carry.
- Platform and dead-zone sources for the framing facts and the two dead-zone regimes:
  <https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API>,
  <https://microsoftedge.github.io/MSEdgeExplainers/GamepadEventDrivenInputAPI/explainer.html>,
  <https://www.gamedeveloper.com/business/doing-thumbstick-dead-zones-right>,
  <https://minimuino.github.io/thumbstick-deadzones/>.
- The engine as it stands here, and its coverage:
  `src/gamepad/{gamepad,mapping,dead-zone,repeat}.ts` (464, 91, 95 and 63 lines), with unit cases in
  `src/gamepad/{dead-zone,mapping,repeat}.test.ts` and the frame-driven suite in
  `src/gamepad/gamepad.browser.test.ts` — the `GamepadRuntime` seam this ADR describes is what
  drives it, one frame at a time, with no hardware and no timers. `gamepadPlugin` also carries its
  own public types on the `./gamepad` subpath (`src/gamepad/gamepad.ts:48-56`), so a consumer can
  name what it passes and what it gets back without importing the core entry
  ([ADR-0011](0011-package-layout-and-adapters.md)).
- Size, measured here rather than inherited: the gamepad engine is 2.49 kB min+gzip against a
  2.50 kB cap, `bun run build && bun run check:size` on 2026-09-21 — the one line at 100 % of its
  cap, with eleven bytes left: 2 549 of 2 560. It grew by the `navigator.getGamepads` guard
  ([ADR-0013](0013-browser-baseline-and-fallbacks.md), amendment of 2026-09-21), which is recorded
  in [ADR-0017](0017-size-budgets.md) after the fact rather than before it. The next commit that
  touches this engine needs a cap amendment there first.
- Competitor claim: [docs/research/competitors.md](../research/competitors.md), "No Gamepad API use
  in any of the eighteen" (2026-09-18).
- Related: [ADR-0018](0018-testing-strategy.md), [ADR-0003](0003-package-boundaries.md).
