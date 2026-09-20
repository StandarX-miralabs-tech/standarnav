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

Those browser tests are not unit tests of a plugin in isolation: `miralabs-ui: packages/core/src/input/spatial/spatial.browser.test.ts:2` and
`miralabs-ui: .../gamepad/gamepad.browser.test.ts:3` both import `createInputSystem` and mount the plugin inside it.
The scope stack, the keyboard source and the modality writer are therefore under test on every
assertion.

Two blind spots are inherited with the suite. The benchmark measures `findBestCandidate` alone
(`miralabs-ui: .../spatial/geometry.bench.ts:32-44`), and the regression gate in
`spatial/geometry.test.ts:156-177` (median of 51 samples under 1 ms for 200 candidates) has the
same shape: neither one calls `collectNavNodes`, `getBoundingClientRect`, `querySelectorAll` or
`checkVisibility`. And several behaviours ship with no test at all; they are listed in decision 6
below.

## Decision

**1. Two Vitest projects, as configured today.**

| Project | Environment | Include | What runs there |
|---|---|---|---|
| `unit` | node | `src/**/*.test.ts(x)`, `scripts/**/*.test.ts` | geometry, containers parsers, dead-zone, repeat, keymap, intent-bus |
| `browser` | `@vitest/browser-playwright` | `src/**/*.browser.test.ts(x)` | spatial, input-system, gamepad plugin, focus-ring, modality, adapters |

The config declares one browser instance, chosen by `SNAV_BROWSER` and defaulting to chromium
(`vitest.config.ts:8-9`, `:30-36`). The three-browser matrix lives in CI instead: chromium, firefox
and webkit (`.github/workflows/ci.yml:94-120`). The file suffix is the routing rule:
`*.browser.test.ts` is excluded from the node project (`vitest.config.ts:23`). Both projects also
take `.tsx`, which they did not on 2026-09-18, because the React adapter and its tests are `.tsx`
(`:22-23`, `:29`). All read 2026-09-20.

**2. Fixtures are positioned with inline styles only, never with CSS classes.** A geometric test
must read as its own specification: the numbers the assertion depends on are in the fixture string,
not in a stylesheet a later refactor can move. The source's helper is the model to keep
(`miralabs-ui: .../spatial/spatial.browser.test.ts:11-13`, one `style="position:absolute;left:…"` per box).

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
destroys the system, scope pushed on mount and released on unmount, innermost asked first, modality
readable, intents reaching a handler, no leak after unmount) live in a single suite that each adapter
mounts with its own mounting function. React first, then vanilla, Vue, Svelte, Angular, in the
adapter order this repository adopted. An adapter that does not pass the suite does not ship.

Amended 2026-09-19, when the suite was written and React ran it: this originally required scopes to
be *released in LIFO order* on unmount. React tears a tree down parent-first, so its outer scope is
released before its inner one — and it makes no difference, because `createIntentBus` removes a
scope by identity (`indexOf` then `splice`, `src/intent-bus.ts:119-120`) rather than by position.
The requirement would have failed every adapter for something unobservable while saying nothing
about a real leak, so the suite asserts that every scope pushed is released and that nothing reaches
a handler afterwards. Dispatch order, which *is* observable, is asserted separately and still LIFO.

**6. Port first, then fill the gaps.** The 160 core cases and the React adapter cases are ported
before new behaviour is written. Then these, which the source does not cover:

| Test to add | Why |
|---|---|
| Scroll-and-rescan on a virtualised scroller | `miralabs-ui: .../spatial/spatial.ts:327-351` is one frame of `raf` behind a `rescanning` lock, untested |
| `pointerFollowsFocus` in `app` mode | default-on path, `miralabs-ui: .../spatial/spatial.ts:193`, untested |
| `data-snav-scroll="center"` | rail centring, read at `miralabs-ui: .../spatial/spatial.ts:249`, untested |
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
and `cancelFrame` are injected (`miralabs-ui: .../gamepad/gamepad.ts:59-63`, `:92-93`; here `src/gamepad/gamepad.ts:73-77` and `:107`), so a test
advances time and pad state frame by frame with no hardware and no timers. See
[ADR-0019](0019-gamepad-engine-design.md).

## Amendment, 2026-09-20: the eight gaps of decision 6 are closed

The port landed and the table in decision 6 is no longer a list of gaps. Every row has a fixture,
and one row was factually reversed by the work rather than merely filled. Each entry below names
the file that covers it; all read 2026-09-20.

| Row of decision 6 | Covered by |
|---|---|
| Scroll-and-rescan on a virtualised scroller | `src/spatial/spatial.browser.test.ts:713-771` — two cases: it scrolls when nothing is reachable and lands a frame later (`:740`), and it scrolls four fifths of the viewport rather than a whole one (`:760`) |
| `pointerFollowsFocus` in `app` mode | `src/spatial/spatial.browser.test.ts:512-545` — three cases, including that it is off in `composite` and that it bypasses the `onWillMove` veto |
| `data-snav-scroll="center"` | `src/spatial/spatial.browser.test.ts:547-581` — centres when the container asks, stays at `nearest` when it does not |
| `explainMove` parity with the real winner | `src/debug.browser.test.ts:56-111` and `:113-180` — see the reversal below |
| The spatial plugin's handling of `scrollX` | `src/spatial/spatial.browser.test.ts:645-711` — five cases: both signs, a zero value, the 24-pixel rate at full and half deflection, and silence when scrolling is off |
| Zero-size filter with one zero dimension | `src/spatial/spatial.browser.test.ts:583-631` — three cases pinning the `||` filter [ADR-0009](0009-hidden-candidates.md) C1 shipped in this pull request: no size at all (`:598`), flat on a single axis (`:607`), and a 1px hairline kept (`:621`), which is the bound that stops the rule reaching a real target |
| `WeakRef` fallback path | `src/spatial/spatial.browser.test.ts:794-826` — the property is deleted from `globalThis` for the duration of the case, so the strong-reference branch actually runs |
| The inherited hard limits | depth 16 at `src/spatial/spatial.browser.test.ts:773-792`; `MAX_PADS = 4` and `MAX_BUTTONS = 20` at `src/gamepad/gamepad.browser.test.ts:303-325`, driven by a harness offering six slots and a settable button count so the engine's own bound is what the assertion reads |

**The `explainMove` row is reversed, not filled.** Decision 6 recorded that `debug.ts:58-63`
re-implements the winner rule instead of sharing it. That is no longer true: `src/debug.ts` imports
`findBestCandidate` and calls it for the winner (`src/debug.ts:13-19`, `:68`), keeping
`scoreCandidates` only for the per-candidate table it displays (`:67`). There is one ranking
implementation, which is what [ADR-0010](0010-dev-mode-diagnostics.md) decision 4 asked for. The
tests that remain are therefore not parity tests against a second implementation but assertions
about where the *diagnostic* is meant to differ from the *engine* —
`src/debug.browser.test.ts:113-180` pins three such places: `explainMove` does not model a
directional redirection, scores one container while the engine walks out of it, and does not model
wrapping. Those differences are now the interesting thing to assert, because the winner rule is
shared and can no longer drift.

**The adapter parity suite of decision 5 grew.** `src/adapter-parity.ts` is the shared suite and
React passes it (`src/react/react.browser.test.tsx:340`). It now exposes a `ParityTree` shape and an
`update(tree)` capability on `ParityAdapter` (`src/adapter-parity.ts:48-55`, `:70`), which is what
lets a case re-render the tree rather than only mount and unmount it. The behaviours it asserts
beyond the original list: LIFO dispatch order, a scope released when only its own subtree unmounts
while the tree stays up, a trap stopping the walk before the scope beneath it, a base scope still
asked through that trap, and a base scope re-registering when it changes on a rerender — the last
being the shape of bug where a prop is honoured on mount and ignored on update
(`src/adapter-parity.ts:118`, `:133`, `:150`, `:161`, `:174`).

**A composition test was added, which decision 6 did not ask for.**
`src/composition.browser.test.ts` mounts the gamepad plugin, the spatial plugin and the focus ring
on one `createInputSystem` and asserts what only the composition can show: a pad press moves the
focus and takes the ring with it, the modality lands on the document once whichever engine moved
last, one `destroy()` unwinds all three, and a pause stops the focus moving until resume
(`:96-160`). Decision 4 says what ships is the composition, so the composition is what is measured;
this is that decision taken one level further up than a single plugin.

**Suite state on the day of this amendment.** `bun run test:unit` → 100 passed in 10 files.
`bun run test:browser` → 169 passed and 1 skipped in 10 files. 269 passed, 1 skipped in total,
across 20 test files. The single skip is the shadow-DOM fixture of
[ADR-0008](0008-shadow-dom.md) (`src/spatial/spatial.browser.test.ts:855-877`), which ships skipped
on purpose. Both commands run in this repository on 2026-09-20, vitest 5.0.1, the browser project
on chromium.

One configuration change belongs here too: `vitest.config.ts` no longer sets `passWithNoTests`, so
a project that matches no file now fails the run instead of passing it. That was harmless while
there was nothing to run and is a real gate now that there is.

## Consequences

- CI runs the browser project three times, once per matrix entry (`ci.yml:94-120`), and a fourth
  time on chromium alone in the `react-floor` job (`ci.yml:66-92`). It is the price
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

- `vitest.config.ts` in this repository (read 2026-09-20): projects `unit` and `browser`, provider
  `playwright()`, `SNAV_BROWSER` selector, include and exclude globs, `.tsx` in both projects, and
  no `passWithNoTests` — the comment at `:13-16` records why it was there and why it is gone.
- `.github/workflows/ci.yml` (read 2026-09-20): six jobs — `lint` (`:13`), `typecheck` (`:23`),
  `build` (`:33`), `test` (`:51`), `react-floor` (`:66`) and `browser` (`:94`) fanned over
  chromium, firefox and webkit at `:94-120` with `fail-fast: false` and `SNAV_BROWSER` set per
  entry, which is eight checks. The `build` job runs `bun run build`, then `git diff --exit-code`
  as the exports-map drift gate, then `check:package`, then `check:size` (`:33-49`). `react-floor`
  installs `react@^18.3.1` over the lockfile and re-runs `typecheck` and the chromium browser
  project against the declared peer floor (`:66-92`), so the range `package.json` advertises is a
  range something actually runs.
- Suite counts, this repository, 2026-09-20: `bun run test:unit` → 100 passed in 10 files;
  `bun run test:browser` → 169 passed, 1 skipped, in 10 files. The skip is
  `src/spatial/spatial.browser.test.ts:856` ([ADR-0008](0008-shadow-dom.md)).
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
  packages/core/src/input/spatial/spatial.browser.test.ts` → no match on 2026-09-18.
- Historical figure, not re-measured: 4.3 µs for 200 candidates, miralabs-ui release notes of
  2026-08-27. Quote it only with that date attached.
- Related: [ADR-0003](0003-extraction-scope.md), [ADR-0005](0005-real-dom-focus.md),
  [ADR-0009](0009-hidden-candidates.md), [ADR-0019](0019-gamepad-engine-design.md).
