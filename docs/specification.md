# Product specification

Project: standarnav — the input and spatial navigation engine published as `@standarx/nav`.
Status: draft, v0 in progress. Nothing is published to npm and nothing has been run on a television.
Date: 2026-09-18. Owner: Wesley Cormier.

This document states the problem, the boundaries, the user contract, the functional requirements and
— for every claim the project intends to make in public — the gate that proves it. The engine exists
as working code inside the repository miralabs-ui and is being extracted; paths of the form
`packages/core/src/...` point to that repository at commit `289fa607`, read on 2026-09-18.

## 1. Problem

### 1.1 The platform gave up on spatial navigation

Spatial navigation — moving focus up, down, left and right through a two-dimensional layout — was
specified as CSS Spatial Navigation Level 1. It never shipped. The CSSWG resolved to move the topic
out of CSS (`https://github.com/w3c/csswg-drafts/issues/1948`), the WICG document
(`https://wicg.github.io/spatial-navigation/`) dates from 2017 and was last updated in November 2019,
and no browser implemented it. The Chromium flag `--enable-spatial-navigation` is an internal
vestige that a page cannot ask for. These findings were recorded on 2026-08-27 in the engine
specification of miralabs-ui, §0 — a file deleted by commit `289fa607` and readable with
`git show 289fa607^:docs/research/input.md`; the status of the Chromium flag today was not re-verified
on 2026-09-18. The consequence: on the web, spatial navigation is userland code or it does not exist.

### 1.2 What breaks when a library uses virtual focus

The cheapest way to build a spatial navigation library is to keep the "focused" element in a
JavaScript variable — a focus key, an id, a node in a tree — and paint it with a CSS class.
`document.activeElement` never moves. That costs the screen reader, which follows real focus and is
told nothing by a class change; the native control behaviour that hangs off `:focus`, text entry and
scroll anchoring included; `:focus`, `:focus-visible` and `:focus-within` in the application's own
stylesheets; extensions, developer tools and tests that read the active element; and interoperability
with any other library that moves focus, because there are now two cursors.

This is decision D9 of the miralabs-ui cahier des charges, 2026-08-27: the gamepad drives real DOM
focus. This project starts from it — never a virtual focus, and arrow keys and the d-pad produce
exactly the same intents (miralabs-ui, `git show 289fa607^:docs/cahier-des-charges.md`, §3). It is
restated here as [ADR-0005](adr/0005-real-dom-focus.md).

### 1.3 What TV, kiosk and game developers do today

Twenty fact sheets covering eighteen distinct projects — two of them are listed twice under two npm
names — were written on 2026-09-18, each verified by reading the library's own source; the table
lives in [docs/research/competitors.md](research/competitors.md). Two findings shape this project:

- Real DOM focus is **not** a differentiator. lrud-spatial, the WICG polyfill, Tabster,
  Enact Spotlight, js-spatial-navigation, salutejs, arrow-navigation, dpad-nav and
  react-js-spatial-navigation all move real focus.
- None of them calls `navigator.getGamepads`. Analog sticks, dead zones, trigger thresholds,
  repeat acceleration and pad-type glyphs are absent from every one of them.

So the gap is not "spatial navigation for the web" — several answers exist, some active, some
abandoned since 2017. The gap is one engine where a keyboard, a TV remote and a gamepad produce the
same intents, and where the gamepad half is part of the library rather than left to the caller.

## 2. Non-goals

These are refusals, not backlog items. Each will be reconsidered only through an ADR.

| Non-goal | Reason |
|---|---|
| Shadow DOM traversal in v0 | Piercing open roots means walking every root on every move; the source module is light-DOM-only by explicit choice (`packages/core/src/focus/tabbable.ts:10-11`). Components that need it can pass their own root. See [ADR-0008](adr/0008-shadow-dom.md). |
| RTL mirroring of directions | `moveLeft` means left on the screen. An application that mirrors its layout decides what its left arrow means; the engine does not guess. |
| A component library | No menu, no dialog, no grid. The engine navigates whatever markup it is given. miralabs-ui is the component library, and becomes a consumer of this package — the owner's decision of 2026-09-18, recorded in [ADR-0004](adr/0004-relationship-with-miralabs-ui.md). |
| Styling beyond focus ring defaults | The package ships the focus ring overlay and the custom properties it reads. It ships no theme, no reset, no component CSS. |
| Native SDKs | No Tizen `.wgt` tooling, no webOS CLI wrapper, no Android TV leanback integration. The deliverable is a web package. |
| React Native | The engine measures DOM rects and calls `element.focus()`. Neither exists in React Native. |

## 3. Targets

| Target | What it means here | Status |
|---|---|---|
| Smart TV web apps — Tizen, webOS | Remote keycodes mapped out of the box; d-pad and OK button drive focus | Keycodes present in `packages/core/src/input/keymap.ts:79-85`; never run on a real set |
| Smart TV web apps — Vidaa, Vizio | Same intents, keycodes unknown | Untested, no public Chromium version for either runtime (checked 2026-09-18) |
| Steam Deck and HTPC launchers | Gamepad-first browsing of an ordinary web UI | Steam client CEF 109.0.5414.120 in the Steam Deck beta client of 2024-01-18; no newer version disclosed (note below) |
| HTML game UIs | Menus, inventories and settings screens driven by the same pad as the game | Supported by design; no example application yet |
| Kiosks | Arrow keys or a physical d-pad, `mode: "app"`, no mouse | Supported by design |
| Keyboard-only accessibility | Real focus means the browser's own accessibility path is intact; Tab stays sequential and untouched | Enforced by the contract in §4 |

Steam Deck note. The Steam client's embedded Chromium (CEF) was 109.0.5414.120 in the beta client of
2024-01-18 (`https://steamdeckhq.com/news/steam-deck-beta-client-1-18-24-descriptions/`, fetched
2026-09-18). No newer version has been disclosed as of 2026-09-18: Valve confirmed a rebuild of the
embedded browser in November 2025, moving it from the Alloy runtime to the Chrome runtime, without
giving a version number
(`https://steamcommunity.com/groups/SteamClientBeta/discussions/3/688615792191756981/`, fetched
2026-09-18). Anything this project says about the Steam Deck therefore assumes Chromium 109 or newer
and has never been run on the device.

### 3.1 Browser tiers

The owner's decision of 2026-09-18, recorded in
[ADR-0013](adr/0013-browser-baseline-and-fallbacks.md): newest first, with fallbacks for older
runtimes. The build target is **es2020**. Its parsing floor is set by the two newest syntax features
of that level: optional chaining `?.` — Chrome 80, Safari 13.1, Firefox 74, Samsung Internet 13.0
(`https://caniuse.com/mdn-javascript_operators_optional_chaining`) — and nullish coalescing `??` —
Chrome 80, Safari 13.1, Firefox 72, Samsung Internet 13.0
(`https://caniuse.com/mdn-javascript_operators_nullish_coalescing`), both fetched 2026-09-18. The two
combined put the floor at Chromium 80, Safari 13.1, Firefox 74 and Samsung Internet 13.0. Any newer
API is feature-detected.

| Tier | Runtimes | Commitment |
|---|---|---|
| Supported and tested | Chromium ≥ 85, Safari ≥ 15, Firefox ≥ 79 | The browser suite runs one engine per local run, chosen by `SNAV_BROWSER`, and all three — chromium, firefox, webkit — as a CI matrix (`.github/workflows/ci.yml:61-83`) |
| Best-effort | TV runtimes of 2020-2021: Tizen 5.5 and 6.0 (Chromium 69 and 76), webOS 5.x and 6.x (Chromium 68 and 79) | The es2020 output does not parse below Chromium 80. A separate legacy build is a roadmap question with a decision date, not a v0 promise |
| Out of scope | Anything older | — |

Runtime-to-Chromium mapping from the Samsung "Web Engine Specifications" and LG "Web API and Web
Engine" pages, fetched 2026-09-18: Tizen 4.0/5.0/5.5/6.0/6.5/7.0/8.0/9.0 = Chromium
56/63/69/76/85/94/108/120; webOS 4.x/5.x/6.x/22/23/24/25 = Chromium 53/68/79/87/94/108/120. The full
table with its source URLs is
[docs/research/tv-runtime-compatibility.md](research/tv-runtime-compatibility.md).

Feature detection required by this tiering (browser support from caniuse and MDN BCD, fetched
2026-09-18):

| API | Available from | Fallback |
|---|---|---|
| `WeakRef` | Chrome 84, Safari 14.1, Firefox 79 | Strong reference validated with `isConnected` before use |
| `checkVisibility` | Chrome 105, Safari 17.4, Firefox 106 | `offsetParent === null && getClientRects().length === 0` (already in `packages/core/src/focus/tabbable.ts:45`) |
| `inert` | Chrome 102, Safari 15.5, Firefox 112 | `closest("[inert]")` reads the attribute everywhere |
| `Array.prototype.at` | Chrome 92, Safari 15.4, Firefox 90, Samsung Internet 16.0 (`https://caniuse.com/mdn-javascript_builtins_array_at`) | Avoided outright. Unlike every other row, its floor is **above** the supported tier, so the source use at `packages/core/src/focus/tabbable.ts:85` throws on Chromium 85-91, Safari 15.0-15.3 and Firefox 79-89 — and `getTabbableEdges` is the entry point for `getFirstTabbable` and `getLastTabbable`. Rewriting it to index arithmetic is mandatory, and a `lib` bump would hide the break rather than fix it |

`tsconfig.json` declares `target: "es2020"` and `lib: ["es2020", "dom", "dom.iterable"]`, so neither
`WeakRef` nor `Array.prototype.at` type-checks by accident: `WeakRef` has to be declared locally
behind its feature check, and a call to `at` is a compile error rather than a review catch.

## 4. User contract

**Focusable in the platform's sense = navigable.** If the browser would focus an element, the engine
will move to it. Nothing has to be registered, wrapped in a hook, or listed in a tree. There is no
`useFocusable`, no `focusKey`, no `MutationObserver`: candidates are queried and measured at each
move, so a virtualised or freshly mutated DOM needs no cache invalidation.

"Focusable in the platform's sense" is the selector at `packages/core/src/focus/tabbable.ts:16-31`:
`input` (also excluding `[type='hidden']`), `select`, `textarea` and `button`, each excluding
`[disabled]`; then `a[href]`, `area[href]`, `iframe`, `object`, `embed`, `audio[controls]`,
`video[controls]`, `summary`, `[contenteditable]` that is not `false`, and anything carrying
`[tabindex]` — minus hidden and inert elements.

The rule has exactly four documented exceptions. Each is deliberate, and each must be stated in the
README because each surprises someone.

1. **A clickable `div` without `tabindex` is not navigable.** The browser will not focus it either.
   The fix is `tabindex="-1"` or `tabindex="0"`, which is also the fix for keyboard users; the engine
   does not invent focusability the platform withholds.
2. **`aria-hidden` elements stay reachable.** `isFocusable` does not filter `aria-hidden`
   (`packages/core/src/focus/tabbable.ts:52-59`). Hiding a subtree from assistive technology while
   leaving it focusable is already an authoring error; an element that should not be reached is
   removed, made `inert`, or marked `data-snav-ignore`. See
   [ADR-0009](adr/0009-hidden-candidates.md), whose status is Proposed, and open question 1 below.
3. **`aria-disabled` stays focusable.** The APG wants disabled menu items and toolbar buttons
   reachable, unlike natively disabled form controls (comment at
   `packages/core/src/focus/tabbable.ts:56-57`).
4. **Light DOM only.** Elements inside a shadow root are not collected; a component that needs it
   passes its own root (§2).

## 5. Functional requirements

Behaviour below is verified in the source on 2026-09-18 unless marked otherwise, and every constant
carries the file and line it comes from. Where a file length is quoted, it is `wc -l` on the
miralabs-ui working tree, run 2026-09-18.

### 5.1 Intent layer

- **R1.** One intent vocabulary: `moveUp`, `moveDown`, `moveLeft`, `moveRight`, `select`,
  `secondary`, `back`, `contextMenu`, `tabNext`, `tabPrev`, `pageUp`, `pageDown`, `home`, `end`,
  `scrollX`, `scrollY` (`packages/core/src/types.ts:11-27`). The last two carry a `value` in -1..1.
- **R2.** An `IntentEvent` carries `intent`, `source` (`keyboard` | `gamepad` | `remote`), `repeat`,
  optional `value`, `originalEvent`, `defaultPrevented` and `preventDefault()`
  (`packages/core/src/types.ts:9`, `:29`).
- **R3. Founding invariant.** Arrow keys and d-pad produce the same `IntentEvent`. Nothing downstream
  can tell them apart except by reading `source`, and nothing in the engine branches on it other than
  the two documented mode rules of §5.4.
- **R4.** Dispatch is a LIFO scope stack (`packages/core/src/input/intent-bus.ts`);
  returning `true` ends the walk. A `trapped` scope swallows everything except `back`, `tabNext` and
  `tabPrev`. Scopes marked `base` are still asked past a trap — the only user is the spatial plugin,
  so a d-pad still moves inside a modal.
- **R5.** `createInputSystem({ doc, plugins, keymap, allowVerticalInText })` is an instance, never a
  global singleton (`packages/core/src/input/input-system.ts`): two coexist in one page,
  and no `document` or `window` access happens outside initialisation, so hydration is safe.
- **R6.** An unclaimed `select` from a non-keyboard source clicks the focused element, so a pad
  activates an ordinary `<button>` with no wiring. `preventDefault()` reaches the native event only
  when a scope consumed the intent; arrow-key scrolling stays intact otherwise.
- **R7.** Engage mode: `select` on a value control pushes a scope where directions adjust the value,
  `select` commits and `back` restores (`packages/core/src/input/engage.ts`). A shared mechanic, not
  a component.

### 5.2 Keyboard and TV remote keymap

- **R8.** `resolveKeyIntent` is pure (`packages/core/src/input/keymap.ts`). Defaults: arrows to
  `move*`; `Enter` and `Space` to `select`; `Escape` to `back`; `Tab` and `Shift+Tab` to `tabNext`
  and `tabPrev`; `PageUp`, `PageDown`, `Home`, `End` direct; `ContextMenu` to `contextMenu`.
- **R9.** Remote keys resolve with `source: "remote"` — by name (`GoBack`, `BrowserBack`, `Exit` to
  `back`; `ChannelUp`, `ChannelDown` to `pageUp`, `pageDown`) and by keycode
  (`packages/core/src/input/keymap.ts:79-85`): 461 webOS Back, 10009 Tizen Return, 10182 Tizen Exit,
  427 Channel Up, 428 Channel Down. Nothing exists for Vidaa, Vizio, Roku, Fire TV or Android TV, and
  the documentation says so rather than implying coverage.
- **R10.** Overrides by `key` and by `keyCode`, `null` disabling a key outright — the supported way
  to add a Vidaa or Roku remote today.
- **R11.** Text-entry guards: no directional intents while focus is in an `input`, `textarea` or
  `contenteditable`, except vertical moves when `allowVerticalInText` says so. Keydown is captured,
  IME composition is respected, `select` never auto-repeats.
- **R12.** Modality is written on `<html>` as `data-snav-input="keyboard|pointer|touch|gamepad"`,
  synchronously, before focus moves (`packages/core/src/interaction/modality.ts`, 180 lines). A
  pointer only takes over on `pointerdown` or after 300 ms of continuous movement
  (`POINTER_INTENT_MS`, `.../modality.ts:27`, applied at `:54`), so brushing a
  mouse mid-session does not kill the ring. `:focus-visible` is a complement, never the source of
  truth.

### 5.3 Gamepad engine

- **R13.** Polling only. As surveyed on 2026-08-27, no browser emits gamepad state events, and the
  Microsoft Edge explainer for `gamepadrawinputchanged`
  (`https://microsoftedge.github.io/MSEdgeExplainers/GamepadEventDrivenInputAPI/explainer.html`) was
  at exploration stage. The internals stay event-shaped so such an API could be plugged in without an
  API break.
- **R14.** The `requestAnimationFrame` loop runs only while a pad is connected, the document is
  visible and the plugin is mounted; on return to visibility state is re-read silently, so a button
  pressed while the tab was hidden never fires a synthetic `select`. Zero allocation per frame,
  through reused typed arrays (`packages/core/src/input/gamepad/gamepad.ts:129-131`).
- **R15.** Dead zones, two treatments. Continuous analog (`scrollX`, `scrollY`): radial dead zone
  `0.15` with magnitude renormalisation (`packages/core/src/input/gamepad/dead-zone.ts:28`). Discrete
  navigation: four 90° sectors with double hysteresis — enter at `0.5`, release at `0.3`, `12°` of
  margin to change sector (`.../dead-zone.ts:55-57`). One flick of the stick is exactly one move.
- **R16.** Repeat: `400 ms` delay, then `130 ms`, then `60 ms` after the sixth repeat
  (`packages/core/src/input/gamepad/repeat.ts:20-23`). On a stick the interval is modulated by
  magnitude, `250 ms` at half deflection down to `60 ms` at full (`.../repeat.ts:26-27,41`). `select`
  never repeats.
- **R17.** Standard mapping: A `select`, B `back`, X `secondary`, Y `contextMenu`, LB/RB
  `tabPrev`/`tabNext`, LT/RT `pageUp`/`pageDown`, right stick `scrollX`/`scrollY`. This is what the
  mapping **produces**; four of those intents have no consumer in the package — see R29a.
- **R18.** `setMapping` covers pads reporting `mapping === ""`; the library applies, the application
  persists, and no storage I/O happens in the package. `padType` is detected from `Gamepad.id` so an
  application can show the right glyphs; `swapNintendoConfirm` exists and is off by default.
- **R19.** Multi-pad merged by default, so any pad in the room drives the UI;
  `assign(padIndex, route)` sends one pad's intents to a handler for local multiplayer. Haptics are
  progressive enhancement through `vibrationActuator.playEffect`, never automatic.
- **R20.** A `GamepadRuntime` seam lets tests drive the engine without hardware — CI has no pads.
  `MAX_BUTTONS = 20` (`packages/core/src/input/gamepad/gamepad.ts:44`) against the 16 standard
  entries of `packages/core/src/input/gamepad/mapping.ts:18-34`, to absorb pads that report more.

### 5.4 Spatial engine

- **R21.** Live geometry, no precomputed graph: candidates are queried and measured with
  `getBoundingClientRect` at each move, reads only. Focus is real —
  `element.focus({ preventScroll: true })` (`packages/core/src/input/spatial/spatial.ts`, 508
  lines). **The source does not verify that the focus landed.** `commit()` calls `focusElement`
  and returns `true` unconditionally (`.../spatial.ts:258-281`); every `document.activeElement`
  read in that file supplies the `from` argument *before* the move. So a focus the browser refuses
  is reported as a successful move, `data-snav-focused` is written on an unfocused element and the
  container memory records it. Verifying the landing is therefore a **requirement of this
  extraction**, not a description of inherited behaviour, and the corresponding row of §6 is a test
  obligation rather than a gate that already passes.
- **R22.** Declarative containers, attributes renamed to this project's prefix — the owner's decision
  of 2026-09-18, recorded in [ADR-0001](adr/0001-name-scope-and-attribute-prefix.md). Read:
  `data-snav="container"`, `data-snav-enter`, `data-snav-wrap`, `data-snav-block`, `data-snav-trap`,
  `data-snav-scroll`, `data-snav-ignore`, `data-snav-up|down|left|right`. Written:
  `data-snav-focused` on the focused element, `data-snav-active` on every container on the path.
  Four attributes are styling hooks: the two above, plus `data-snav-input` on `<html>` (R12) and
  `data-snav-focus-ring` on the overlay (R32). The package writes a fifth name that is not a hook —
  `aria-hidden="true"`, set on the focus-ring overlay the plugin creates
  (`packages/core/src/input/focus-ring/focus-ring.ts:198`) — so "four attributes" is the count a
  consumer styles against, not the count the package writes. All five land on elements the package
  owns; none is ever written on the consumer's markup.
- **R23.** Directional filter with an overlap tolerance of `0.3`
  (`packages/core/src/input/spatial/geometry.ts:41`), the value lrud-spatial uses.
- **R24.** Scoring weights `30` horizontal and `2` vertical (`.../geometry.ts:42-43`), from Blink's
  `kOrthogonalWeightForLeftRight` and `kOrthogonalWeightForUpDown`, declared at lines 673 and 674 of
  `third_party/blink/renderer/core/page/spatial_navigation.cc` on `main` (read 2026-09-18). **The
  score formula itself is not Blink's** and is never described as such.
- **R25.** Alignment bias: one loop with two accumulators, `aligned` and `any`, returning
  `aligned ?? any` — semantically the tvOS two-pass rule, not literally two passes, and the
  documentation says so. Ties go to DOM order. The provenance of R23 to R25 is recorded in
  [ADR-0016](adr/0016-scoring-constants-provenance.md).
- **R26.** Entry strategies `last | first | nearest`, default `last`
  (`packages/core/src/input/spatial/containers.ts`), with per-container focus memory in a
  `WeakMap<HTMLElement, WeakRef<HTMLElement>>` (`.../spatial.ts:198,235`) that must gain the
  `WeakRef` fallback of §3.1.
- **R27.** With no candidate, in order: wrap if the container wraps on that axis; else scroll one
  step and rescan; else bubble to the parent container; else no-op and emit `onBoundsHit`. An
  `onWillMove` veto fires before the real `focus()` call, so a component can refuse a move.
- **R28.** Explicit redirections `data-snav-up|down|left|right` take CSS selectors resolved against
  the whole document — documented as the last resort for pathological layouts.
- **R29.** Two modes. `composite` (default): arrows are spatial only inside composites, as the APG
  requires, and only the gamepad crosses composite boundaries, so an ordinary site becomes
  pad-drivable without losing its keyboard conventions. `app` (TV, kiosk, game): arrows drive global
  spatial navigation too. In both, `Tab` is untouched — sequential tabbing stays the browser's.
  Recorded as [ADR-0007](adr/0007-navigation-modes.md).
- **R29a.** Four of the sixteen intents of R1 are **emitted and not consumed** by this package:
  `tabNext`, `tabPrev`, `secondary` and `contextMenu`. The keymap and the pad mapping produce them
  (R8, R17), and `tabNext`/`tabPrev` are even allowed past a trap (R4), but no module in the
  extraction perimeter acts on any of them: the spatial engine handles the four moves and the two
  scrolls and returns `false` for everything else
  (`packages/core/src/input/spatial/spatial.ts:428-439`), the input system acts on `select` alone
  (`.../input-system.ts:98-112`), and engage mode consumes `select`, `back` and its eight adjust
  intents (`.../engage.ts:18-26`). `pageUp`, `pageDown`, `home` and `end` likewise do nothing
  outside engage mode. In miralabs-ui these were consumed by four component machines — calendar,
  dialog, pagination, tabs — none of which is extracted, so the gap is created by the extraction
  and is not an omission in the source. Pressing RB on a pad therefore moves no focus today: the
  intent reaches the application through `onIntent`, which is the documented way to act on it. A
  built-in tab-order handler is a v1 item, not a port, because it has to decide whether the engine
  or the application owns sequential focus.
- **R30.** `pointerFollowsFocus`, default on in `app` mode, so mouse and pad do not fight over two
  cursors. No test covers it today.
- **R31.** Visible limits, documented because a user meets them: container nesting is bounded at
  `MAX_CONTAINER_DEPTH = 16` (`packages/core/src/input/spatial/spatial.ts:55`), and the zero-size
  filter is `width === 0 && height === 0` (`.../spatial.ts:141`), so a 0×40 element stays a
  candidate.

### 5.5 Focus ring

- **R32.** One optional overlay module, zero bytes when not imported, listening to `focusin`
  (`packages/core/src/input/focus-ring/focus-ring.ts`), animated with the Web Animations
  API, hidden under `pointer` and `touch` modality, crossfading under `prefers-reduced-motion`. The
  overlay element carries `data-snav-focus-ring`, the fourth attribute the package writes.
- **R33.** If the ring ships in v0, it ships with its default values inlined. In the source, colour,
  width, radius and z-index come from `packages/styles/scss/components/_focus-ring.scss`, which stays
  in miralabs-ui: publishing without defaults produces an invisible ring. Custom properties are
  renamed `--snav-focus-ring-*`. Whether the overlay is in v0 at all, and in which of the three
  shapes, is the open question recorded in [ADR-0004](adr/0004-relationship-with-miralabs-ui.md) and
  restated as open question 3 below.

### 5.6 Adapters

- **R34.** Delivery order, the owner's decision of 2026-09-18, recorded in
  [ADR-0011](adr/0011-package-layout-and-adapters.md): React first — the only adapter in the source
  (`packages/react/src/input.tsx`, 209 lines) — then vanilla helpers that auto-mount from attributes,
  then Vue, Svelte, Angular.
- **R35.** Every adapter is a subpath export (`@standarx/nav/react`, `/vue`, `/svelte`, `/angular`)
  with an optional peer dependency, and stays a thin binding — provider, scope host, modality hook.
  It never imports the engines; the consumer passes `gamepadPlugin()` or `spatialPlugin()`.
  `vanilla` is the core itself.
- **R36.** No adapter ships until it passes the same browser suite as React (parity gate, §6).

## 6. Measurable claims and their gates

A claim without a gate does not go in the README.

| Claim | Gate | State today |
|---|---|---|
| Zero runtime dependencies | `package.json` has no `dependencies` field, checked by `bun run check:package` on the packed tarball, wired at `.github/workflows/ci.yml:46-47` | The field is absent from `package.json` (read 2026-09-18). `scripts/check-package.ts` exists: it refuses a `private` manifest, packs with `bun pm pack` into a temporary directory, then runs `publint` and `attw --profile esm-only` on the tarball — the only artifact npm ever receives. It has nothing to lint until `src/` and a build exist |
| Blocking size budgets | `scripts/size-budget.ts` run by `bun run check:size` (`.github/workflows/ci.yml:48-49`); a measured line without a cap fails the run | The script exists, with six lines: core (`index.js`), gamepad engine, spatial engine and focus ring (each measured with the siblings `../*` and `../../*` external, so each number is the marginal cost next to the core), debug (`./*` external), and the whole package (the four runtime entries bundled once through a synthetic re-export module, nothing external). Sizes are minified with `Bun.build` and gzipped at Bun's default level, which reads heavier than `gzip -9`. Every cap is `null` today, so the run prints each measurement and fails by design until the caps are written from those numbers, per [ADR-0017](adr/0017-size-budgets.md). It also fails with a clear message while `dist/` is missing, which it is until `src/` exists. Inherited reference figures below |
| Never virtual focus | A browser test asserting `document.activeElement` after every move, plus a check that no id-keyed focus map exists in the source | Not written |
| Geometry fixtures do not depend on CSS classes | Geometry fixtures positioned with inline styles only, so a fixture failure means the algorithm changed, never the stylesheet | Not written |
| Adapter parity | The same browser suite runs against every adapter | Coverage in the source is React only: `packages/react/src/primitives.browser.test.tsx` holds 16 cases, of which the provider and modality ones exercise the adapter, and `packages/react/src/components/gamepad.browser.test.tsx` holds 8 that drive it through the input system (`it(` occurrences counted against miralabs-ui on 2026-09-18). The shared suite does not exist yet |
| Scoring performance | A bench of `findBestCandidate` **and** an end-to-end move measurement | Neither is written here |

Inherited size figures for reference only — `bun run check:size` in miralabs-ui on 2026-09-18 (dist
built the same day, min+gzip, externals `../*` and `../../*`): input system with engage 1.93 kB of a
2.00 kB cap, gamepad engine 2.35 kB of 3.00 kB, spatial engine 2.81 kB of 3.00 kB, modality tracker
0.74 kB of 1.00 kB. They describe the source, not this package. Two warnings travel with them. The
same spatial engine measured **without** externals came to 3303 B, above the 3 kB cap — a single
measurement of 2026-09-18 that has not been reproduced, which is why perimeters precede caps.
And the figures of the 2026-08-27 release notes (2.48 kB gamepad, 2.89 kB spatial, 1.34 kB focus
ring, 4.3 µs for 200 candidates) are historical and are labelled as such wherever they appear.

The performance gate needs the same care. The inherited bench
`packages/core/src/input/spatial/geometry.bench.ts` measures `findBestCandidate` alone on 200 and
2000 candidates, and the guard at `packages/core/src/input/spatial/geometry.test.ts:156-177`
(median of 51 samples under 1 ms) has the same blind spot: neither measures `collectNavNodes`,
`getBoundingClientRect`, `querySelectorAll` or `checkVisibility`. A move is not the arithmetic.
Of the two, only the guard is ported — `vitest` 5.0.1 exports no `bench` — so v0 ships that blind
spot with no benchmark beside it. See [ADR-0018](adr/0018-testing-strategy.md).

## 7. Success criteria and decision date (proposed)

Everything here is a **proposal** for the owner to accept, amend or reject; none of the numbers is
measured yet. Proposed review date: **2027-03-31**, on which the project continues as is, narrows its
scope, or is archived — written as an ADR rather than left implicit. Proposed criteria:

1. **Adoption.** At least five identifiable external users: a public repository depending on
   `@standarx/nav`, a third-party issue that is not from the owner, or a written report of use. Five
   is a proposed threshold, not a measurement; it separates "someone found it" from "nobody did".
2. **Downloads, recorded rather than remembered.** Once published, record npm weekly downloads every
   Monday with `curl -s https://api.npmjs.org/downloads/point/last-week/@standarx/nav` and append the
   dated result to a log in the repository. The criterion is the log's existence and a non-decreasing
   trend over the last eight weeks, not a threshold: a threshold set before the first week of data
   would be invented.
3. **Hardware truth.** At least one real television (Tizen or webOS) and at least one physical
   gamepad verified against a published test page, each recorded in a device report issue
   (`.github/ISSUE_TEMPLATE/device_report.yml`). Until then, no document claims TV support.
4. **The gates of §6 are green.** All six rows implemented and passing in CI, with the size caps set
   from measurements taken after the extraction.

Proposed failure condition, stated so it can actually fire: if on 2027-03-31 criterion 3 is unmet and
criterion 1 stands at zero, the honest move is to archive the standalone package and keep the engine
inside miralabs-ui, where it already has a consumer.

## 8. Open questions

1. **`aria-hidden`.** The engine specification of 2026-08-27 lists "not inside an `aria-hidden`
   subtree" among the candidate filters (§3.2, step 1;
   `git show 289fa607^:docs/research/input.md`), but the shipped code does not filter it. §4 of this
   document follows the code. Which one is the contract?
2. **Legacy build.** Is a second build targeting Chromium 68-79 (TV 2020-2021) worth its cost, and by
   what date is that decided?
3. **Focus ring in v0.** Inline default tokens in the plugin, a small optional stylesheet, or out of
   v0 entirely? Open since the initialisation of 2026-09-18, recorded as an open question in
   [ADR-0004](adr/0004-relationship-with-miralabs-ui.md); no ADR decides it yet.
4. **Dependency direction with miralabs-ui.** Its core imports `pushEngageScope` and
   `isTextEntryTarget` by value. After extraction, does miralabs-ui depend on `@standarx/nav` for
   those two, or do they stay in miralabs-ui?
5. **Budget perimeters.** `scripts/size-budget.ts` already fixes one perimeter per line (§6) and
   leaves every cap `null`. Are those the right perimeters, and what does each number then mean to a
   consumer? Settle that before writing any cap ([ADR-0017](adr/0017-size-budgets.md)).
6. **Untested behaviours inherited from the source.** `scrollAndRescan`, `pointerFollowsFocus`,
   `data-snav-scroll="center"`, the whole of `debug.ts` (whose winner rule is a re-implementation,
   not a shared one) and right-stick horizontal scroll have no tests. Specify and test, or drop?
7. **Remote coverage.** Do Vidaa, Vizio, Roku, Fire TV and Android TV keycodes enter the default
   keymap, and how are they verified without the hardware?
8. **CI billing.** `gh run list -R miralabs-tech/miralabs-ui --limit 8` on 2026-09-18 returned 8
   failures out of 8, annotated "The job was not started because recent account payments have failed
   or your spending limit needs to be increased." The same must be checked for
   `StandarX-miralabs-tech` before any claim depends on green CI.
9. **Name risk.** A third-party GitHub organisation `standarx` has existed since 2024-12-24 with a
   live site at standarx.com, predating `StandarX-miralabs-tech`, created 2026-09-18 (`gh api
   users/standarx`, run 2026-09-18). No INPI, EUIPO or USPTO search has been run. This is a
   family-level risk, not specific to this project.
10. **Shadow DOM after v0.** If it comes back, does it come back as an opt-in root list or as real
    traversal, and what does that cost per move?
