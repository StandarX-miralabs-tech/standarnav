# ADR-0018: Testing strategy

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

This repository extracts an input system ([ADR-0003](0003-extraction-scope.md)) whose contract is
written in the DOM: which element `document.activeElement` points to after a move, whether a
candidate is visible, what a composed path contains, what a scroller does when the focus leaves the
viewport. The parts that are not DOM are ordinary arithmetic and string parsing: geometry, the
container parsers, the dead zones, the repeat ladder, the keymap table, the intent bus.

The source repository already split its tests along that line, and this repository inherits the
split: `vitest.config.ts:4-7` states it in the file itself — "anything that touches the DOM runs
against a real engine, because focus order, composed paths and computed visibility are exactly
where jsdom and the browsers disagree".

The material to port is known. Counted on 2026-09-18 with
`grep -cE "^\s*(it|test)\(" <file>` over the twelve test files of
`packages/core/src/input/**` in miralabs-ui: 7 + 8 + 13 + 18 + 8 + 9 + 19 + 11 + 17 + 9 + 16 + 25 =
**160 cases**. The same command on `packages/react/src/components/gamepad.browser.test.tsx`, the
only test file of the React adapter that drives the input system, returns **8 cases**.

Those browser tests are not unit tests of a plugin in isolation: `spatial.browser.test.ts:2` and
`gamepad/gamepad.browser.test.ts:3` both import `createInputSystem` and mount the plugin inside it.
The scope stack, the keyboard source and the modality writer are therefore under test on every
assertion.

Two blind spots are inherited with the suite. The benchmark measures `findBestCandidate` alone
(`spatial/geometry.bench.ts:32-44` in the source), and the regression gate in
`spatial/geometry.test.ts:156-177` (median of 51 samples under 1 ms for 200 candidates) has the
same shape: neither one calls `collectNavNodes`, `getBoundingClientRect`, `querySelectorAll` or
`checkVisibility`. And several behaviours ship with no test at all; they are listed in decision 6
below.

## Decision

**1. Two Vitest projects, as configured today.**

| Project | Environment | Include | What runs there |
|---|---|---|---|
| `unit` | node | `src/**/*.test.ts(x)`, `scripts/**/*.test.ts` | geometry, containers parsers, dead-zone, repeat, keymap, intent-bus, size-budget script |
| `browser` | `@vitest/browser-playwright` | `src/**/*.browser.test.ts(x)` | spatial, input-system, gamepad plugin, focus-ring, modality, adapters |

The config declares one browser instance, chosen by `SNAV_BROWSER` and defaulting to chromium
(`vitest.config.ts:8-9`, `vitest.config.ts:28-34`). The three-browser matrix lives in CI instead:
chromium, firefox and webkit (`.github/workflows/ci.yml:61-83`, read 2026-09-18). The file suffix is
the routing rule: `*.browser.test.ts` is excluded from the node project (`vitest.config.ts:19`).

**2. Fixtures are positioned with inline styles only, never with CSS classes.** A geometric test
must read as its own specification: the numbers the assertion depends on are in the fixture string,
not in a stylesheet a later refactor can move. The source's helper is the model to keep
(`spatial/spatial.browser.test.ts:11-13`, one `style="position:absolute;left:…"` per box).

**3. The "never virtual focus" gate.** Every move assertion reads `document.activeElement`, never a
key, an index or a library-held pointer. This is the executable form of
[ADR-0005](0005-real-dom-focus.md): if the engine ever grows a virtual mode, the whole browser suite
fails, which is the point.

**4. Tests go through the real input system.** The browser tests keep constructing
`createInputSystem({ plugins: [plugin] })` and emitting intents into it, rather than driving a
plugin through a hand-written host. What ships is the composition, so the composition is what is
measured. A small fake host is added for one purpose only: the plugin contract itself — `setup`
returning its teardown, `pause`/`resume`, the context methods a plugin may call — where a real
system would hide which call actually happened.

**5. One adapter parity suite.** The behaviours an adapter must reproduce (provider mounts and
destroys the system, scope pushed on mount and released on unmount in LIFO order, modality readable,
intents reaching a handler, no leak after unmount) live in a single suite that each adapter mounts
with its own mounting function. React first, then vanilla, Vue, Svelte, Angular, in the adapter
order this repository adopted. An adapter that does not pass the suite does not ship.

**6. Port first, then fill the gaps.** The 160 core cases and the React adapter cases are ported
before new behaviour is written. Then these, which the source does not cover:

| Test to add | Why |
|---|---|
| Scroll-and-rescan on a virtualised scroller | `spatial/spatial.ts:327-351` is one frame of `raf` behind a `rescanning` lock, untested |
| `pointerFollowsFocus` in `app` mode | default-on path, `spatial/spatial.ts:193`, untested |
| `data-snav-scroll="center"` | rail centring, read at `spatial/spatial.ts:249`, untested |
| `explainMove` parity with the real winner | `debug.ts:58-63` re-implements the winner rule instead of sharing it |
| The spatial plugin's handling of `scrollX` | `scrollY` is covered by four cases (`spatial.browser.test.ts:333-383`); no case emits `scrollX` into the plugin (`grep -n "scrollX" packages/core/src/input/spatial/spatial.browser.test.ts` → no match, 2026-09-18) |
| Zero-size filter with one zero dimension | the filter is `width === 0 && height === 0` (`spatial/spatial.ts:141`), so a 0x40 element stays a candidate; [ADR-0009](0009-hidden-candidates.md) requires this fixture before the filter changes |
| `WeakRef` fallback path | the strong reference validated with `isConnected`, the fallback the browser baseline requires, needs its own run |
| The inherited hard limits | container depth 16 (`spatial/spatial.ts:55`), `MAX_PADS = 4` and `MAX_BUTTONS = 20` (`gamepad/gamepad.ts:43-44`) are asserted nowhere; one fixture each pins the behaviour at the boundary |

**7. Benchmarks: two, not one — and neither exists yet.** The intent stands: `findBestCandidate` on
200 and 2 000 candidates, plus a second benchmark measuring an end-to-end move — candidate
collection, `getBoundingClientRect`, filtering, scoring — on 200 candidates in the browser project.
Neither is written. `vitest` 5.0.1 exports no `bench` function (only the `vitest bench` CLI
survives, and it renames the project, so a `--project` filter no longer matches), so the inherited
`geometry.bench.ts` is not ported and a runner has to be chosen first. Until then the only
performance gate is the median-of-51 guard, kept as an ordinary test in `geometry.test.ts` with a
margin of roughly two hundred times the historical figure — enough to catch an algorithmic
regression and not enough to flake on a loaded runner. Every published figure records the machine,
the browser and the date of the run; without them it is not a number this project prints.

**8. Gamepad tests drive frames through the `GamepadRuntime` seam.** `getGamepads`, `requestFrame`
and `cancelFrame` are injected (`gamepad/gamepad.ts:59-63`, `gamepad/gamepad.ts:92-93`), so a test
advances time and pad state frame by frame with no hardware and no timers. See
[ADR-0019](0019-gamepad-engine-design.md).

## Consequences

- CI runs the browser project three times, once per matrix entry (`ci.yml:61-83`). It is the price
  of testing focus in engines that disagree about focus, and it is what makes a webkit regression
  visible before a user finds it.
- Playwright browsers must be installed in CI, and a test that needs a browser cannot run in a
  bare node environment. Contributors run one browser locally by default.
- Tests are slower to write than jsdom tests: a fixture must be laid out, not merely rendered.
- Real hardware stays out of reach. No test in this repository proves anything about a television,
  a Steam Deck or a physical pad; device testing is a roadmap item, not a claim.
- The end-to-end benchmark will likely be slower than the arithmetic one by a wide margin. That
  number is not measured yet; no budget is written until it is.

## Alternatives considered

- **jsdom for everything.** Rejected. Focus order, composed paths, computed visibility and scroll
  geometry are approximations there, and they are precisely the engine's contract. A green jsdom
  suite would assert the approximation.
- **`@playwright/test` as a separate runner.** Rejected for now: a second runner means a second
  config, a second reporter and a second way to write a fixture, for a gain that
  `@vitest/browser-playwright` already delivers inside one command. Revisit only if visual or
  multi-page scenarios appear.
- **A fake host for all plugin tests.** Rejected as the default: it tests the plugin against a mock
  of the system rather than against the system. Kept for the plugin contract alone (decision 4).
- **Real-device CI.** Out of scope for v0; no hardware, no budget, and nothing to gate on yet.

## Evidence

- `vitest.config.ts` in this repository (read 2026-09-18): projects `unit` and `browser`, provider
  `playwright()`, `SNAV_BROWSER` selector, include and exclude globs.
- `.github/workflows/ci.yml:61-83` (read 2026-09-18): the `browser` job, matrix chromium, firefox,
  webkit, `SNAV_BROWSER` set per entry.
- Case count, 2026-09-18: `grep -cE "^\s*(it|test)\(" <file>` over
  `packages/core/src/input/{engage,input-system.browser,intent-bus,keymap}.test.ts`,
  `input/gamepad/{dead-zone,gamepad.browser,mapping,repeat}.test.ts`,
  `input/spatial/{containers,geometry,spatial.browser}.test.ts`,
  `input/focus-ring/focus-ring.browser.test.ts` → 160, and over
  `packages/react/src/components/gamepad.browser.test.tsx` → 8.
- `packages/core/src/input/spatial/spatial.browser.test.ts:1-60` (miralabs-ui, read-only): fixtures
  built from inline styles; `createInputSystem` used in the scene helper.
- `packages/core/src/input/gamepad/gamepad.browser.test.ts:1-60`: `GamepadRuntime` stub with a
  single pending frame callback.
- `packages/core/src/input/spatial/geometry.bench.ts:32-44` and
  `packages/core/src/input/spatial/geometry.test.ts:156-177`: scope of the inherited measurement —
  200 and 2 000 candidates, and the median of 51 samples under 1 ms.
- Untested behaviours: `grep -rn "rescan\|pointerFollowsFocus"
  packages/core/src/input/spatial/spatial.browser.test.ts` → no match on 2026-09-18, and the same
  gaps are listed in [docs/journal/2026-09-18.md](../journal/2026-09-18.md).
- Historical figure, not re-measured: 4.3 µs for 200 candidates, miralabs-ui release notes of
  2026-08-27. Quote it only with that date attached.
- Related: [ADR-0003](0003-extraction-scope.md), [ADR-0005](0005-real-dom-focus.md),
  [ADR-0009](0009-hidden-candidates.md), [ADR-0019](0019-gamepad-engine-design.md).
