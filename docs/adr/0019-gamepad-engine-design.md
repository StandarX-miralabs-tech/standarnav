# ADR-0019: Gamepad engine design, inherited and recorded

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The gamepad engine is not designed here. It is inherited from miralabs-ui
([ADR-0003](0003-package-boundaries.md)), specified on 2026-08-27 and implemented over the following
weeks in `packages/core/src/input/gamepad/{gamepad.ts, mapping.ts, dead-zone.ts, repeat.ts}` (450,
91, 95 and 63 lines, `wc -l` on 2026-09-18). This ADR records the design and its reasons here, so
that the numbers stop being folklore, and marks what is still unverified. Three facts frame it:

- The Gamepad API is polling-only. No browser fires an event when a button changes; the state has
  to be read from `navigator.getGamepads()` inside a loop. The event-driven proposal
  (`gamepadrawinputchanged`, MSEdge explainer) is exploratory, not implemented, and aimed at cloud
  gaming latency (input.md §0). Only `gamepadconnected` and `gamepaddisconnected` are reliable.
- One normalised layout exists: `mapping === "standard"` (buttons 0-3 the face cluster, 12-15 the
  d-pad, axes 0/1 the left stick, 2/3 the right stick). When `mapping` is empty the button order is
  arbitrary (input.md §0).
- None of the eighteen competing projects surveyed on 2026-09-18 calls `navigator.getGamepads`
  ([docs/research/competitors.md](../research/competitors.md)). Inside that set there is no prior art
  to copy and no second implementation to compare against.

## Decision

The engine ships as inherited for v0, with its reasons recorded below and its open items written
down rather than quietly carried.

**Polling loop, lazy start, aggressive stop.** A `requestAnimationFrame` loop runs only while a pad
is connected **and** the document is visible **and** the plugin is mounted and not paused
(`gamepad.ts:294-338`). `visibilitychange` to hidden cancels the frame explicitly rather than
trusting a background tab's rAF throttling — "slower" is not "stopped", and battery is a promise
(`gamepad.ts:369-378`). The loop stops itself when the last pad disappears (`gamepad.ts:318-319`).

**Silent re-read on return.** Coming back from a hidden tab, from `resume()`, or finding a pad
already exposed at setup sets a `resync` flag: the next frame reads every pad into the snapshot and
emits nothing (`gamepad.ts:180-199`, `gamepad.ts:308-311`, `gamepad.ts:381-385`). Without it, a
button held during the pause surfaces as a phantom activation on return.

**Two dead-zone regimes, because they are two problems.**

| Reading | Treatment | Defaults | Source |
|---|---|---|---|
| Continuous (right stick, `scrollX`/`scrollY`) | radial cut on the magnitude, renormalised `(mag − dz) / (1 − dz)`, then a response curve | `deadZone = 0.15`, curve `quadratic` | `dead-zone.ts:28`, `dead-zone.ts:35-42` |
| Discrete (left stick, `move*`) | four 90° sectors with double hysteresis and an angular margin | enter `0.5`, release `0.3`, margin `12°` | `dead-zone.ts:55-57`, `dead-zone.ts:77-95` |

Per-axis thresholds are what a radial cut replaces: a square hole lets a diagonal through at a
lower true deflection than a straight push, so the stick feels stronger on the diagonals. Sector
hysteresis stops a stick held near 45° alternating at frame rate (`dead-zone.ts:1-17`, input.md §2.3).

**Repeat belongs to the engine.** The keyboard gets auto-repeat from the OS and the pad gets none, so
the engine owns the ladder: first repeat after `400 ms`, then every `130 ms`, then `60 ms` once six
repeats have elapsed (`repeat.ts:20-23`, `:44-46`). On a stick the interval is modulated by magnitude
instead, `250 ms → 60 ms` between half deflection and full (`repeat.ts:26-27`, `:38-43`). Only
`move*`, `pageUp`/`pageDown` and `tabNext`/`tabPrev` repeat; `select` never does (`mapping.ts:56-69`).

**Standard mapping is the grammar.**

| Button | Intent | | Button | Intent |
|---|---|---|---|---|
| 0 A / Cross | `select` | | 6 LT | `pageUp` |
| 1 B / Circle | `back` | | 7 RT | `pageDown` |
| 2 X / Square | `secondary` | | 9 Start | `contextMenu` (alias) |
| 3 Y / Triangle | `contextMenu` | | 12-15 d-pad | `moveUp/Down/Left/Right` |
| 4 LB | `tabPrev` | | right stick | `scrollX` / `scrollY` |
| 5 RB | `tabNext` | | 8, 10, 11 | unmapped |

Source: `mapping.ts:18-35`. The same table is the fallback for a pad reporting no mapping at all:
the first four buttons are the face cluster on essentially every controller made.

**Triggers use a threshold pair.** LT and RT are analogue, so `pressed` is computed with hysteresis
— `> 0.5` to press, `> 0.3` to stay pressed (`mapping.ts:89-91`, applied at `gamepad.ts:211-214`) —
otherwise a worn pad chatters at rest.

**Escape hatches.** `setMapping(gamepadId, overrides)` applies a remap; the library applies, the
application persists, because a core with zero dependencies does no I/O (`gamepad.ts:96-101`,
`gamepad.ts:408-410`). `padType(index)` parses `Gamepad.id` into `xbox | dualsense | switch |
generic` for glyphs — a heuristic over vendor text, not a lookup (`mapping.ts:71-83`).
`swapNintendoConfirm` is **off by default**: the standard mapping already normalises by physical
position, so confirm stays under the thumb that confirms on every other pad; the option exists for
applications that would rather match the printed glyph (`mapping.ts:37-53`, `gamepad.ts:88-89`).

**Multi-pad merge by default.** Every connected pad drives the same navigation — any pad in the
living room works — and `activeIndex` is the pad that moved last, for glyphs (`gamepad.ts:157`,
`gamepad.ts:442-444`). `assign(padIndex, route)` opts into the other shape: one pad's intents go to
a handler of its own. The intent bus has no named scopes, so the route is the handler itself, which
needs no registry and is strictly more general than an id (`gamepad.ts:102-107`).

**Haptics are progressive enhancement.** `rumble()` calls `vibrationActuator.playEffect("dual-rumble")`
when it exists and swallows the rejection otherwise; nothing vibrates on its own (`gamepad.ts:416-430`).

**`GamepadRuntime` is a test seam.** `getGamepads`, `requestFrame` and `cancelFrame` are injected
(`gamepad.ts:59-63`, `gamepad.ts:92-93`): frames are driven one at a time in tests with no hardware
— see [ADR-0018](0018-testing-strategy.md) — and a TV shim could replace them.

**Zero-allocation loop.** Per-frame state lives in typed arrays allocated once (`gamepad.ts:129-137`)
and every helper returns a scalar. `navigator.getGamepads()` allocates its own array on each call;
nothing on this side adds to it.

## Consequences

- The engine costs one rAF callback while a pad is connected, and nothing otherwise; an application
  that never imports it ships zero bytes of it.
- Every default above is documented, so changing one is a visible decision. Each becomes an option
  carrying its current value as the default; any change requires a frame-driven test.
- The design survives the event-driven proposal landing: the loop only diffs a snapshot and calls
  `emit`, so a future event source would replace the reading without touching the public API.
- Chrome only reveals a pad after the user presses something on it (input.md §2.1 and §6), so
  `onConnected` may fire late or not at all. Applications must expect it late, not gate a UI on it.

## Open items recorded, not resolved

Line references in this table are miralabs-ui's, as everywhere else in this record; the status
column is re-read against this repository on 2026-09-20.

| Item | Where (miralabs-ui) | Status |
|---|---|---|
| `MAX_BUTTONS = 20` while the standard table has 16 entries | `gamepad.ts:44`, `mapping.ts:18-35` | Still unexplained, but no longer untested. `src/gamepad/gamepad.browser.test.ts:316-324` reads twenty buttons and stops there, driven by a harness with a settable button count so the engine's own bound is what the assertion reads. The four extra slots are polled and resolve to `null` unless `setMapping` overrides them. Kept for v0 parity; the *reason* is still owed. |
| The modality is pushed on every emission, including the two closing zeros of the scroll | `gamepad.ts:158`, `gamepad.ts:290-291` | Unchanged and still open. A stick returning to centre re-asserts `gamepad` modality. Harmless today, wrong in principle; to be verified against the anti-flicker rule before it becomes a fix. |
| No test on real hardware | — | Unchanged. Not measured. Every gamepad test runs through the runtime seam with synthetic pads: nothing in this repository is evidence about a physical controller, a television or a Steam Deck ([ADR-0014](0014-device-and-browser-matrix.md)). |
| `MAX_PADS = 4` | `gamepad.ts:43` | Inherited limit, no stated reason in the source and no ADR of its own — that part stands. The boundary fixture [ADR-0018](0018-testing-strategy.md) asked for is written: `src/gamepad/gamepad.browser.test.ts:304-314` polls four pads and ignores a fifth, from a harness offering six slots. |

## Alternatives considered

- **Event-driven design, waiting for the proposal.** Rejected: `gamepadrawinputchanged` is an
  explainer at the exploration stage, implemented by no browser, and polling will not be deprecated
  (input.md §0). Waiting would mean shipping no gamepad support at all.
- **Per-axis dead zones.** Rejected: they carve a square hole, which biases diagonals — the stick
  reads as stronger off-axis than on it (`dead-zone.ts:1-17`, and the two references below).
- **A single dead-zone treatment for both sticks.** Rejected: one flick must mean exactly one move
  for navigation, and scrolling must be continuous. One treatment cannot be both.
- **Automatic confirm/cancel swap on Nintendo pads.** Rejected as a default, kept as an option: the
  standard mapping normalises by position, so swapping again moves confirm off the usual thumb.

## Evidence

- Rationale: miralabs-ui `docs/research/input.md` §0 and §2 — the engine specification of 2026-08-27,
  deleted by commit `289fa607` and readable with `git show 289fa607^:docs/research/input.md`, read
  2026-09-18. Every "input.md" reference above points at that file.
- Source URLs quoted by that document: <https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API>,
  <https://microsoftedge.github.io/MSEdgeExplainers/GamepadEventDrivenInputAPI/explainer.html>,
  <https://www.gamedeveloper.com/business/doing-thumbstick-dead-zones-right>,
  <https://minimuino.github.io/thumbstick-deadzones/>.
- Code read on 2026-09-18 in miralabs-ui (read-only): `packages/core/src/input/gamepad/gamepad.ts`
  (450 lines), `mapping.ts` (91), `dead-zone.ts` (95), `repeat.ts` (63), counted with `wc -l` the
  same day. Every line reference above points there; in this repository those files are
  `src/gamepad/*.ts`, and the design they describe was extracted unchanged. The `assign` signature
  was corrected from input.md §2.6 (`assign(padIndex, scopeId)`) to what shipped.
- The engine as extracted, and its coverage, read 2026-09-20:
  `src/gamepad/{gamepad,mapping,dead-zone,repeat}.ts`, with unit cases in
  `src/gamepad/{dead-zone,mapping,repeat}.test.ts` and the frame-driven suite in
  `src/gamepad/gamepad.browser.test.ts` — the `GamepadRuntime` seam this ADR describes is what
  drives it, one frame at a time, with no hardware and no timers. `gamepadPlugin` also carries its
  own public types on the `./gamepad` subpath (`src/gamepad/gamepad.ts:48-56`), so a consumer can
  name what it passes and what it gets back without importing the core entry
  ([ADR-0011](0011-package-layout-and-adapters.md)).
- Size, measured here rather than inherited: the gamepad engine is 2.48 kB min+gzip against a
  2.50 kB cap, `bun run build && bun run check:size` on 2026-09-20 — the one line at 99 % of its
  cap, and the next commit that grows it needs an amendment to
  [ADR-0017](0017-size-budgets.md) first.
- Competitor claim: [docs/research/competitors.md](../research/competitors.md), "No Gamepad API use
  in any of the eighteen" (2026-09-18).
- Related: [ADR-0018](0018-testing-strategy.md), [ADR-0003](0003-package-boundaries.md).
