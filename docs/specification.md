# Product specification

Project: standarnav — the input and spatial navigation engine published as `@standarx/nav`.
Status: draft, v0 in progress. The engine is extracted and lives in `src/`; `0.1.0` is on npm since
2026-09-22, and nothing has been run on a television.
Date: 2026-09-18, revised 2026-09-20 against the extracted tree. Owner: Wesley Cormier.

This document states the problem, the boundaries, the user contract, the functional requirements and
— for every claim the project intends to make in public — the gate that proves it. The extraction has
landed, so paths of the form `src/...` are files of **this** repository, read at HEAD on 2026-09-20,
and every line number below was checked against them on that date.

## 1. Problem

### 1.1 The platform gave up on spatial navigation

Spatial navigation — moving focus up, down, left and right through a two-dimensional layout — was
specified as CSS Spatial Navigation Level 1. It never shipped. The CSSWG resolved to move the topic
out of CSS (`https://github.com/w3c/csswg-drafts/issues/1948`), the WICG document
(`https://wicg.github.io/spatial-navigation/`) dates from 2017 and was last updated in November 2019,
and no browser implemented it. The Chromium flag `--enable-spatial-navigation` is an internal
vestige that a page cannot ask for; its status has not been re-verified since 2026-08-27. The
consequence: on the web,
spatial navigation is userland code or it does not exist.

### 1.2 What breaks when a library uses virtual focus

The cheapest way to build a spatial navigation library is to keep the "focused" element in a
JavaScript variable — a focus key, an id, a node in a tree — and paint it with a CSS class.
`document.activeElement` never moves. That costs the screen reader, which follows real focus and is
told nothing by a class change; the native control behaviour that hangs off `:focus`, text entry and
scroll anchoring included; `:focus`, `:focus-visible` and `:focus-within` in the application's own
stylesheets; extensions, developer tools and tests that read the active element; and interoperability
with any other library that moves focus, because there are now two cursors.

This project starts from the opposite position: the gamepad drives real DOM focus, never a virtual
one, and arrow keys and the d-pad produce exactly the same intents. It is
[ADR-0005](adr/0005-real-dom-focus.md).

### 1.3 What TV, kiosk and game developers do today

Twenty fact sheets covering eighteen distinct projects — two of them are listed twice under two
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
| Shadow DOM traversal in v0 | Piercing open roots means walking every root on every move; the module is light-DOM-only by explicit choice (`src/tabbable.ts:10-12`). So `getFocusables` stops at a shadow boundary while the `contains` of `src/dom/query.ts:24-39` walks `getRootNode()` and hosts and crosses one — an inconsistency this version keeps deliberately, pinned by the skipped fixture at `src/spatial/spatial.browser.test.ts:921`, with coherence a v1 goal. Components that need it can pass their own root. See [ADR-0008](adr/0008-shadow-dom.md). |
| RTL mirroring of directions | `moveLeft` means left on the screen. An application that mirrors its layout decides what its left arrow means; the engine does not guess. |
| A component library | No menu, no dialog, no grid. The engine navigates whatever markup it is given, and the boundary that keeps it that way is [ADR-0003](adr/0003-package-boundaries.md). |
| Styling beyond focus ring defaults | The package ships the focus ring overlay and the six custom properties it reads (R33). No stylesheet ships at all — the overlay paints itself inline ([ADR-0020](adr/0020-focus-ring-defaults.md)) — and there is no theme, no reset, no component CSS. |
| Native SDKs | No Tizen `.wgt` tooling, no webOS CLI wrapper, no Android TV leanback integration. The deliverable is a web package. |
| React Native | The engine measures DOM rects and calls `element.focus()`. Neither exists in React Native. |

## 3. Targets

| Target | What it means here | Status |
|---|---|---|
| Smart TV web apps — Tizen, webOS | Remote keycodes mapped out of the box; d-pad and OK button drive focus | Keycodes present in `src/keymap.ts:79-85` and covered by `src/keymap.test.ts`; never run on a real set |
| Smart TV web apps — Vidaa, Vizio | Same intents, keycodes unknown | Untested, no public Chromium version for either runtime (checked 2026-09-18) |
| Steam Deck and HTPC launchers | Gamepad-first browsing of an ordinary web UI | Steam client CEF 109.0.5414.120 in the Steam Deck beta client of 2024-01-18; no newer version disclosed (note below) |
| HTML game UIs | Menus, inventories and settings screens driven by the same pad as the game | Supported by design; no example application. The nearest thing is the development playground (`bun run dev`, `playground/`), which mounts the three engines in `mode: "app"` against fixture markup and is not a sample to copy |
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
| Supported and tested | Chromium ≥ 85, Safari ≥ 15, Firefox ≥ 79 | The browser suite runs one engine per local run, chosen by `SNAV_BROWSER` and defaulting to chromium (`vitest.config.ts`), and all three — chromium, firefox, webkit — as a CI matrix (`.github/workflows/ci.yml:103-129`). The three matrix jobs passed on the last run of the extraction pull request (2026-09-20). A fourth browser run is declared and has not run yet: the same suite on chromium against react 18.3, because every other job installs the lockfile's react 19 and the bottom of the declared peer range was otherwise never exercised (`.github/workflows/ci.yml:75-101`) |
| Best-effort | TV runtimes of 2020-2021: Tizen 5.5 and 6.0 (Chromium 69 and 76), webOS 5.x and 6.x (Chromium 68 and 79) | The es2020 output does not parse below Chromium 80. A separate legacy build is a roadmap question with a decision date — **2026-12-31**, and no device report by then means no build — not a v0 promise |
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
| `WeakRef` | Chrome 84, Safari 14.1, Firefox 79 | Written. `elementHandle` returns a `WeakRef` where the constructor exists and a strong reference that drops itself on the first read finding the element detached — `isConnected` — where it does not (`src/spatial/spatial.ts:127-141`). The constructor is read per call rather than at module scope, so a test can delete the global and exercise the fallback |
| `checkVisibility` | Chrome 105, Safari 17.4, Firefox 106 | `offsetParent === null && getClientRects().length === 0` (`src/tabbable.ts:51`) |
| `inert` | Chrome 102, Safari 15.5, Firefox 112 | `closest("[inert]")` reads the attribute everywhere (`src/tabbable.ts:55`) |
| `Array.prototype.at` | Chrome 92, Safari 15.4, Firefox 90, Samsung Internet 16.0 (`https://caniuse.com/mdn-javascript_builtins_array_at`) | Avoided outright, and the rewrite is done: `getTabbableEdges` indexes `tabbables[tabbables.length - 1]` (`src/tabbable.ts:104-107`). Unlike every other row its floor is **above** the supported tier, so the use it replaced threw on Chromium 85-91, Safari 15.0-15.3 and Firefox 79-89, and `getTabbableEdges` is the entry point for `getFirstTabbable` and `getLastTabbable`. A `lib` bump would have hidden the break rather than fixed it |

`tsconfig.json` declares `target: "es2020"` and `lib: ["es2020", "dom", "dom.iterable"]` (read
2026-09-20), so neither `WeakRef` nor `Array.prototype.at` type-checks by accident: `WeakRef` is
declared locally behind its feature check (`src/spatial/spatial.ts:109-111`), and a call to `at` is a
compile error rather than a review catch. `bun run typecheck` is its own CI job.

## 4. User contract

**Focusable in the platform's sense = navigable.** If the browser would focus an element, the engine
will move to it. Nothing has to be registered, wrapped in a hook, or listed in a tree. There is no
`useFocusable`, no `focusKey`, no `MutationObserver`: candidates are queried and measured at each
move, so a virtualised or freshly mutated DOM needs no cache invalidation.

"Focusable in the platform's sense" is the selector at `src/tabbable.ts:17-34`:
`input` (also excluding `[type='hidden']`), `select`, `textarea` and `button`; then `a[href]`,
`area[href]`, `iframe`, `object`, `embed`, `audio[controls]`, `video[controls]`, `summary`,
`[contenteditable]` that makes its element editable, and anything carrying `[tabindex]` — minus
hidden, inert and disabled elements. Disabled is what the browser calls `:disabled` — a form
control carrying `disabled`, or one inside a `<fieldset disabled>` anywhere but in that fieldset's
first `<legend>` — plus exception 5 below: `isFocusable` rejects `:disabled,[disabled]`
(`src/tabbable.ts:61-63`).
A link or a `[tabindex]` element inside such a fieldset is not disabled and stays a candidate.
Tests: "drops what a disabled fieldset disables, and keeps its first legend and its links" and
"reports the edges of a surface that ends in a disabled fieldset" in `src/tabbable.browser.test.ts`,
and "steps over the controls of a disabled fieldset" in `src/spatial/spatial.browser.test.ts`.
The browser agrees: a `<button>` in the first `<legend>` takes the focus, one in a second
`<legend>` or in the fieldset body does not, and the link and the `[tabindex]` element do, on
chromium, firefox and webkit (Playwright, 2026-09-23).

The `contenteditable` arm is `[contenteditable]:read-write` (`src/tabbable.ts:30-32`), so it keeps
exactly the elements `isContentEditable` calls editable: `false` in any letter case, and `inherit`
or an invalid value under a parent that is not editable, are left out. On chromium, firefox and
webkit (Playwright, 2026-09-23) `:read-write` and `isContentEditable` agreed on all thirteen
variants probed, and no uneditable one without a `tabindex` took the focus. `:read-write` is
Chrome 1, Safari 4 and Firefox 78, under the floor of §3.1 (MDN browser-compat-data,
`https://github.com/mdn/browser-compat-data/blob/main/css/selectors/read-write.json`, fetched
2026-09-23). Test: "drops a contenteditable attribute that does not make its element editable"
in `src/tabbable.browser.test.ts`.

Tabbable is focusable and in the sequential order: `tabIndex >= 0`, or an **editing host** — an
editable element whose parent is not editable — that carries no `tabindex` attribute
(`inTabOrder`, `src/tabbable.ts:71-78`, shared by `isTabbable` and `getTabbables`). A host
reports `tabIndex` -1 and is a Tab stop all the same; what is editable inside it is not a stop,
and `tabindex="-1"` takes a host out. Measured on chromium, firefox and webkit (Playwright,
2026-09-23, with Alt+Tab on webkit, whose plain Tab skips links): a host's `tabIndex` is -1 on all
three, and the native Tab order visits a host, a `plaintext-only` host and an editable island inside
`contenteditable="false"`, and never a nested editable. Tests: "counts an editing host as a Tab
stop, and not what is editable inside it" and "reports an editing host as the last edge" in
`src/tabbable.browser.test.ts`. `isTabbable` is public; `getTabbables`, `getTabbableEdges`,
`getFirstTabbable` and `getLastTabbable` are module-internal, and no entry point exports them
(`src/index.ts`).

The rule has exactly five documented exceptions. Each is deliberate, and each must be stated in the
user documentation the README sends a reader to — [docs/en/navigation.md](en/navigation.md), with
its French mirror — because each surprises someone.

1. **A clickable `div` without `tabindex` is not navigable.** The browser will not focus it either.
   The fix is `tabindex="-1"` or `tabindex="0"`, which is also the fix for keyboard users; the engine
   does not invent focusability the platform withholds.
2. **`aria-hidden` elements stay reachable.** `isFocusable` does not filter `aria-hidden`
   (`src/tabbable.ts:58-67`). Hiding a subtree from assistive technology while leaving it focusable
   is already an authoring error; an element that should not be reached is removed, made `inert`, or
   marked `data-snav-ignore`. See [ADR-0009](adr/0009-hidden-candidates.md) and open question 1
   below: the candidate filters of that ADR are settled (R31), `aria-hidden` itself is not.
3. **`aria-disabled` stays focusable.** The APG wants disabled menu items and toolbar buttons
   reachable, unlike natively disabled form controls (comment at `src/tabbable.ts:64-65`).
4. **Light DOM only.** Elements inside a shadow root are not collected; a component that needs it
   passes its own root (§2).
5. **`disabled` on an element that is not a form control is rejected, although the browser
   focuses it.** The attribute means nothing to a `<div tabindex="0">` or an `<a href>`, and both
   still take the focus on chromium, firefox and webkit (Playwright, 2026-09-23). `isFocusable`
   drops them anyway, because `disabled` is the opt-out [ADR-0009](adr/0009-hidden-candidates.md)
   rule 6 gives an `aria-disabled` item; that is why the test is `:disabled,[disabled]` and not
   `:disabled` alone (`src/tabbable.ts:61-63`). Test: "still rejects disabled on an element the
   browser would focus, ADR-0009 rule 6" in `src/tabbable.browser.test.ts`.

## 5. Functional requirements

Behaviour below is verified in `src/` at HEAD on 2026-09-20 unless marked otherwise, and every
constant carries the file and line it comes from. Where a file length is quoted, it is `wc -l` on
this working tree, run 2026-09-20.

### 5.1 Intent layer

- **R1.** One intent vocabulary: `moveUp`, `moveDown`, `moveLeft`, `moveRight`, `select`,
  `secondary`, `back`, `contextMenu`, `tabNext`, `tabPrev`, `pageUp`, `pageDown`, `home`, `end`,
  `scrollX`, `scrollY` (`src/types.ts:11-27`). The last two carry a `value` in -1..1.
- **R2.** An `IntentEvent` carries `intent`, `source` (`keyboard` | `gamepad` | `remote`), `repeat`,
  optional `value`, `originalEvent`, `defaultPrevented` and `preventDefault()` — all seven present
  and in that order at `src/types.ts:29-40`, with `IntentSource` at `:9`. `defaultPrevented` is a
  readonly field of the event, not a method: a scope reads what an earlier scope did to the native
  event without being able to undo it.
- **R3. Founding invariant.** Arrow keys and d-pad produce the same `IntentEvent`. Nothing downstream
  can tell them apart except by reading `source`, and the engine branches on it in exactly two
  places, both documented: the unclaimed `select` that a keyboard must not double-fire
  (R6, `src/input-system.ts:127`) and the composite-mode arrow rule (R29,
  `src/spatial/spatial.ts:493`). `grep -rn "source ===" src` on 2026-09-20 returns five hits: those
  two, one assertion in `src/input-system.browser.test.ts`, and two in `src/react/react.tsx` (`:151`,
  `:160`) that are an unrelated local of the same name in the adapter's value-or-thunk helper.
- **R4.** Dispatch is a LIFO scope stack (`src/intent-bus.ts`);
  returning `true` ends the walk. A `trapped` scope swallows everything except `back`, `tabNext` and
  `tabPrev`. Scopes marked `base` are still asked past a trap — the only user is the spatial plugin,
  so a d-pad still moves inside a modal. Amended by [ADR-0025](adr/0025-trap-within-its-surface.md):
  a trap that names its surface through `within` (an element, or a getter read at dispatch) still
  asks a scope beneath it whose own `within` lies inside that surface — after the trap, never
  before it, since containment does not reorder the stack. A trap or a scope without `within` is
  unchanged, and every trap asked sets the surface, so a dialog nested in another narrows it
  (`src/intent-bus.browser.test.ts`). Amended by [ADR-0026](adr/0026-native-handler-answer.md): a
  handler returns `true`, `false`, nothing, or `"native"` (`IntentHandler`). `"native"` ends the
  walk too — no scope beneath is asked, `base` scopes and the spatial engine included — but
  unclaimed: the dispatch reports `consumed: false` and the event's own `defaultPrevented`, exactly
  as for an intent nobody answered. A `"native"` answer from any scope the walk asks, through a trap
  too, keeps the default; a trap nobody answered still swallows (`src/intent-bus.test.ts`,
  "createIntentBus — the native answer (ADR-0026)").
- **R5.** `createInputSystem({ doc, plugins, keymap, allowVerticalInText })` is an instance, never a
  global singleton (`InputSystemOptions`, `src/input-system.ts:50-56`): two coexist in one page,
  and no `document` or `window` access happens outside initialisation, so hydration is safe.
- **R6.** An unclaimed `select` from a non-keyboard source clicks the focused element, so a pad
  activates an ordinary `<button>` with no wiring (`src/input-system.ts:119-133`, which also skips a
  repeat and a text-entry target). `preventDefault()` reaches the native event only when a scope
  consumed the intent; arrow-key scrolling stays intact otherwise. A scope answering `"native"`
  (R4) consumes nothing, so the key keeps its browser default and a pad `select` answered that way
  still gets the click ([ADR-0026](adr/0026-native-handler-answer.md); "leaves the native default
  of a keyboard intent a scope answered native" and "lets the emulated click run for a pad select
  answered native, as for one nobody claimed" in `src/input-system.browser.test.ts`).
- **R7.** Engage mode: `select` on a value control pushes a scope where directions adjust the value,
  `select` commits and `back` restores (`src/engage.ts`). A shared mechanic, not a component.

### 5.2 Keyboard and TV remote keymap

- **R8.** `resolveKeyIntent` is pure (`src/keymap.ts`). Defaults: arrows to
  `move*`; `Enter` and `Space` to `select`; `Escape` to `back`; `Tab` and `Shift+Tab` to `tabNext`
  and `tabPrev`; `PageUp`, `PageDown`, `Home`, `End` direct; `ContextMenu` to `contextMenu`.
- **R9.** Remote keys resolve with `source: "remote"` — by name (`GoBack`, `BrowserBack`, `Exit` to
  `back`; `ChannelUp`, `ChannelDown` to `pageUp`, `pageDown`) and by keycode
  (`REMOTE_KEY_CODES`, `src/keymap.ts:79-85`): 461 webOS Back, 10009 Tizen Return, 10182 Tizen Exit,
  427 Channel Up, 428 Channel Down. Nothing exists for Vidaa, Vizio, Roku, Fire TV or Android TV, and
  the documentation says so rather than implying coverage.
- **R10.** Overrides by `key` and by `keyCode`, `null` disabling a key outright — the supported way
  to add a Vidaa or Roku remote today.
- **R11.** Text-entry guards: no directional intents while focus is in an `input`, `textarea` or
  `contenteditable`, except vertical moves when `allowVerticalInText` says so. Keydown is captured,
  IME composition is respected, `select` never auto-repeats. A radio, a checkbox, a range and the
  other non-text `input` types are not text entry (`NON_TEXT_INPUT_TYPES`, `src/keymap.ts:138-149`),
  so their arrows do reach the scopes, and in `app` mode the spatial engine takes them. A scope
  answering `"native"` (R4) leaves them to the browser: with real key presses on chromium, firefox
  and webkit, ArrowDown checks the next radio and ArrowRight steps a range
  (`src/native-answer.browser.test.ts`, 2026-09-23).
- **R12.** Modality is written on `<html>` as `data-snav-input="keyboard|pointer|touch|gamepad"`,
  synchronously, before focus moves (`src/modality.ts`, 179 lines). A
  pointer only takes over on `pointerdown` or after 300 ms of continuous movement
  (`POINTER_INTENT_MS`, `src/modality.ts:26`, applied at `:53`), so brushing a
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
  through reused typed arrays (`src/gamepad/gamepad.ts:151-157`).
- **R15.** Dead zones, two treatments. Continuous analog (`scrollX`, `scrollY`): radial dead zone
  `0.15` with magnitude renormalisation (`src/gamepad/dead-zone.ts:28`). Discrete
  navigation: four 90° sectors with double hysteresis — enter at `0.5`, release at `0.3`, `12°` of
  margin to change sector (`dead-zone.ts`). One flick of the stick is exactly one move.
- **R16.** Repeat: `400 ms` delay, then `130 ms`, then `60 ms` after the sixth repeat
  (`src/gamepad/repeat.ts:20-23`). On a stick the interval is modulated by magnitude, `250 ms` at
  half deflection down to `60 ms` at full (`repeat.ts`). `select` never repeats.
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
  `MAX_BUTTONS = 20` (`src/gamepad/gamepad.ts:58`) against the 16 standard entries of
  `src/gamepad/mapping.ts:19-34`, to absorb pads that report more.

### 5.4 Spatial engine

- **R21.** Live geometry, no precomputed graph: candidates are queried and measured with
  `getBoundingClientRect` at each move, reads only. Focus is real —
  `element.focus({ preventScroll: true })` (`src/spatial/spatial.ts`, 573 lines by `wc -l` on
  2026-09-23). **The landing is verified since 2026-09-23.** At HEAD on 2026-09-20 `commit()` called `focusElement`, wrote the
  attributes and returned `true` unconditionally, so a focus the browser refused was reported as a
  successful move, `data-snav-focused` was written on an unfocused element and the container memory
  recorded it. `commit()` now compares the target with the active element of the target's own root
  after the focus call — `to.getRootNode()`, so a root inside a shadow tree
  ([ADR-0008](adr/0008-shadow-dom.md)) still sees its landing — and on a refusal returns `false`
  having written nothing: no attribute, no memory, no scroll (`src/spatial/spatial.ts:329-336`).
  The move is then reported as not made, and the engine does not try the next candidate. Tests:
  "writes nothing when the focus does not land" and "reports a move whose target refused the
  focus as not made" in `src/spatial/spatial.browser.test.ts`. Their witness is a second
  `<summary>` in an open `<details>`: it matches the selector, is visible and sized, and `focus()`
  leaves it alone on chromium, firefox and webkit (Playwright, 2026-09-23). An `onWillMove`
  listener is still called before the focus, so it can hear of a move the browser then refuses.
- **R22.** Declarative containers, attributes renamed to this project's prefix — the owner's decision
  of 2026-09-18, recorded in [ADR-0001](adr/0001-name-scope-and-attribute-prefix.md). Read:
  `data-snav="container"`, `data-snav-enter`, `data-snav-wrap`, `data-snav-block`, `data-snav-trap`,
  `data-snav-scroll`, `data-snav-ignore`, `data-snav-up|down|left|right`. Written:
  `data-snav-focused` on the focused element, `data-snav-active` on every container on the path.
  Four attributes are styling hooks: the two above, plus `data-snav-input` on `<html>` (R12) and
  `data-snav-focus-ring` on the overlay (R32). The package writes a fifth name that is not a hook —
  `aria-hidden="true"`, set on the focus-ring overlay the plugin creates
  (`src/focus-ring/focus-ring.ts:239-241`) — so "four attributes" is the count a consumer styles
  against, not the count the package writes. Two of the five do land on the consumer's own elements,
  because that is what a styling hook is for: `data-snav-focused` and `data-snav-active`
  (`spatial.ts`). The other three land on `<html>` and on the overlay the package
  created, and `aria-hidden` is the only ARIA attribute the package writes anywhere — never on
  markup it did not create (`grep -rn "aria-" src` on 2026-09-20: twelve hits, of which two are
  outside the tests — the write at `src/focus-ring/focus-ring.ts:241` and the `aria-disabled`
  comment at `src/tabbable.ts:64` — and the other ten are fixtures). The attribute **names** are
  the public contract; the constants that hold them are module-internal and no entry point
  publishes them (`src/spatial/containers.ts:10-18`, reachable from no path in the exports map).
  `./spatial` publishes `containerOf` and
  `collectNavNodes` and no attribute constant, so a consumer writes the string or reads it from its
  own markup.
- **R23.** Directional filter with an overlap tolerance of `0.3`
  (`src/spatial/geometry.ts:40`), the value lrud-spatial uses.
- **R24.** Scoring weights `30` horizontal and `2` vertical (`geometry.ts`), from Blink's
  `kOrthogonalWeightForLeftRight` and `kOrthogonalWeightForUpDown`, declared at lines 673 and 674 of
  `third_party/blink/renderer/core/page/spatial_navigation.cc` on `main` (read 2026-09-18). **The
  score formula itself is not Blink's** and is never described as such.
- **R25.** Alignment bias: one loop with two accumulators, `aligned` and `any`, returning
  `aligned ?? any` — semantically the tvOS two-pass rule, not literally two passes, and the
  documentation says so. Ties go to DOM order. The provenance of R23 to R25 is recorded in
  [ADR-0016](adr/0016-scoring-constants-provenance.md).
- **R26.** Entry strategies `last | first | nearest`, default `last` (`src/spatial/containers.ts`),
  with per-container focus memory in a `WeakMap<HTMLElement, ElementHandle>`
  (`spatial.ts`, where it is also read back). The handle is the indirection the `WeakRef`
  fallback of §3.1 needed, and it is written: the map is also dropped whole on teardown
  (`spatial.ts`), which is what releases the elements the fallback path holds strongly.
- **R27.** With no candidate, in order: wrap if the container wraps on that axis; else scroll one
  step and rescan; else bubble to the parent container, unless it traps or blocks that direction;
  else no-op and emit `onBoundsHit` (`src/spatial/spatial.ts:427-449`). The rescan waits exactly one
  frame, because a virtualised list mounts its next rows on the scroll (`spatial.ts`).
  An `onWillMove` veto fires before the real `focus()` call, so a component can refuse a move
  (`spatial.ts`).
- **R28.** Explicit redirections `data-snav-up|down|left|right` take CSS selectors resolved against
  the whole document, read off the focused element and answered *before* anything is scored
  (`src/spatial/spatial.ts:418-422`) — documented as the last resort for pathological layouts.
  A redirect is taken only when its target passes `isFocusable` (`:421`). A selector that matches
  nothing, or a target that is disabled, hidden, inert or not focusable at all, is ignored, and
  the geometric search runs as if the attribute were absent — the owner's decision of 2026-09-23.
  Test: "ignores a redirection to a target that cannot take the focus" in
  `src/spatial/spatial.browser.test.ts`.
- **R29.** Two modes. `composite` (default): arrows are spatial only inside composites, as the APG
  requires, and only the gamepad crosses composite boundaries, so an ordinary site becomes
  pad-drivable without losing its keyboard conventions. In this package the rule is one line —
  `mode === "composite" && event.source === "keyboard"` returns `false` (`src/spatial/spatial.ts:493`)
  — so the engine declines every keyboard arrow in that mode and the composite's own arrow handling
  belongs to whoever pushed a scope above it. This package ships no component layer, so under
  `composite` a keyboard arrow moves focus only if the application acts on
  it (R29a). `app` (TV, kiosk, game): arrows drive global spatial navigation too. In both, `Tab` is
  untouched — sequential
  tabbing stays the browser's. Recorded as [ADR-0007](adr/0007-navigation-modes.md).
- **R29a.** Four of the sixteen intents of R1 are **emitted and not consumed** by this package:
  `tabNext`, `tabPrev`, `secondary` and `contextMenu`. The keymap and the pad mapping produce them
  (R8, R17), and `tabNext`/`tabPrev` are even allowed past a trap (R4), but no module in the
  extraction perimeter acts on any of them: the spatial engine handles the four moves and the two
  scrolls and returns `false` for everything else (`src/spatial/spatial.ts:484-495`), the input
  system acts on `select` alone (`src/input-system.ts:119-133`), and engage mode consumes `select`,
  `back` and its eight adjust intents (`src/engage.ts:18-26`, read at `:61-72`). `pageUp`,
  `pageDown`, `home` and `end` likewise do nothing
  outside engage mode. They are the application's to act on: the package produces the intent, and a
  component decides what it means. Pressing RB on a pad therefore moves no focus today: the
  intent reaches the application through `onIntent`, which is the documented way to act on it. A
  built-in tab-order handler is a v1 item, not a port, because it has to decide whether the engine
  or the application owns sequential focus.
- **R30.** `pointerFollowsFocus`, default on in `app` mode and off in `composite`
  (`src/spatial/spatial.ts:239`), so mouse and pad do not fight over two cursors. Covered by the
  browser fixtures at `src/spatial/spatial.browser.test.ts:577` — it is no longer the untested
  option it was in the predecessor implementation ([ADR-0002](adr/0002-license-and-copyright.md)).
- **R31.** Visible limits, documented because a user meets them: container nesting is bounded at
  `MAX_CONTAINER_DEPTH = 16` (`src/spatial/spatial.ts:60`), and the zero-size filter is
  `width === 0 || height === 0` (`spatial.ts`) — **either** dimension, so a 0×40 element
  is not a candidate. That is [ADR-0009](adr/0009-hidden-candidates.md) filter **C1, accepted for v0
  and implemented**, against the `&&` it replaced, which let such an element through: a rect with
  a zero dimension paints nothing and its projection onto the cross axis is empty, so the alignment
  pass can never call it aligned and it is scored on the distance to a centre that is really an
  edge. Three fixtures pin it, including the one that says the rule is zero and not small — a
  one-pixel hairline stays a candidate (`src/spatial/spatial.browser.test.ts:663-695`).
  Filter **C2 is refused for v0** and deferred to v1: dropping `opacity: 0` candidates costs a
  `getComputedStyle` per candidate in the hot loop, and an opacity inherited from an ancestor
  escapes the test anyway. The two do not ship together, which is the premise the ADR was written
  on.

### 5.5 Focus ring

- **R32.** One optional overlay module, zero bytes when not imported, listening to `focusin` and not
  to the spatial engine, so it rings a Tab, a pad move and a programmatic `focus()` alike
  (`src/focus-ring/focus-ring.ts`). Animated with the Web Animations API; hidden under `pointer` and
  `touch` modality (`focus-ring.ts`); travelling from its own live rect rather than from
  the element it left, so a burst of presses retargets from where the ring visually is (`:175`);
  crossfading instead of travelling under `prefers-reduced-motion` (`:188-191`); appearing and
  disappearing over a 150 ms WAAPI fade, which is itself skipped under reduced motion and when the
  ring's resolved duration — the `duration` option, else `--snav-focus-ring-duration` — is zero or
  less (`:147-154`; `src/focus-ring/focus-ring.browser.test.ts:210-235` on three engines, with the
  150 ms default guarded at `:197-208`; [ADR-0020](adr/0020-focus-ring-defaults.md), amendment of
  2026-09-23). The overlay element carries `data-snav-focus-ring`, the fourth attribute the package
  writes.
- **R33.** **Settled: the ring ships in v0 and paints itself.** No stylesheet ships with the package
  — the overlay is created with its paint in a `cssText` string (`src/focus-ring/focus-ring.ts:51-52`,
  applied at `:242`), so importing the subpath is the whole installation. The contract is
  six custom properties, read off the overlay's own computed style:

  | Custom property | Fallback | Read at |
  |---|---|---|
  | `--snav-focus-ring-offset` | `2` px | `src/focus-ring/focus-ring.ts:104-106` |
  | `--snav-focus-ring-duration` | 260 ms, 150 ms under reduced motion | `focus-ring.ts` |
  | `--snav-focus-ring-easing` | `cubic-bezier(0.22, 1, 0.36, 1)` | `focus-ring.ts` |
  | `--snav-focus-ring-color` | `#1a73e8` | `focus-ring.ts` |
  | `--snav-focus-ring-width` | `3px` | `focus-ring.ts` |
  | `--snav-focus-ring-z-index` | `1700` | `focus-ring.ts` |

  One of those fallbacks was computed here and two were restored from the predecessor
  implementation ([ADR-0002](adr/0002-license-and-copyright.md)). `#1a73e8` was
  measured here — 4.51:1 on white and 4.36:1 on `#0b0b0f`, both above the 3:1 that WCAG SC 1.4.11
  asks of a non-text indicator (commit `71dc53c`). `3px` and `1700` are the values the
  predecessor's stylesheet shipped, put back after the extraction's first pass wrote `2px` and no
  z-index at all: `2px` is a width the predecessor never shipped and `3px` is the one it did
  (cited in commit `92a5f89`), and `1700` is the rung that
  stylesheet gave the ring — above its modal, popover, toast and tooltip. The rung is load-bearing:
  `position: fixed` opens no stacking context, so without it the overlay paints in DOM order and
  goes behind the first dialog it meets. The radius is not a property at all: it is read off the
  target, so the ring wears the shape of whatever it surrounds (`:114-116`).

  Two limits travel with an inline style. A custom property of the wrong type still substitutes,
  which makes the declaration invalid at computed-value time with no earlier declaration to fall
  back to — one typo computes the ring to nothing, silently. And `forced-colors: active` suppresses
  `box-shadow`, so the ring disappears in a forced-colours theme; an inline style cannot carry the
  media query the stylesheet used for that. The fix is a v1 roadmap item, not a v0 one.

### 5.6 Adapters

- **R34.** Delivery order, the owner's decision of 2026-09-18, recorded in
  [ADR-0011](adr/0011-package-layout-and-adapters.md): React first (`src/react/react.tsx`), then
  vanilla helpers that auto-mount from attributes, then
  Vue, Svelte, Angular. React is the only adapter that exists; the others are not written.
- **R35.** Every adapter is a subpath export (`@standarx/nav/react`, `/vue`, `/svelte`, `/angular`)
  with an optional peer dependency, and stays a thin binding — provider, scope host, modality hook.
  Only `./react` is published today (`package.json` exports), with `react` and
  `react-dom` as optional peers. It never imports the engines — `src/react/react.tsx` imports the
  input system, the bus types, the keymap types and the modality tracker, and nothing from
  `gamepad/`, `spatial/` or `focus-ring/` (`react.tsx`) — so the consumer passes
  `gamepadPlugin()` or `spatialPlugin()` in. `vanilla` is the core itself, and the auto-mount
  helper `@standarx/nav/auto` sits beside the adapters without being one: it has no peer, imports
  no engine, and adds two behaviours to `createInputSystem`
  ([ADR-0023](adr/0023-vanilla-auto-mount.md)).
- **R36.** No adapter ships until it passes the shared suite of `src/adapter-parity.ts`, the same one
  React passes (parity gate, §6). Among what it asserts: a provider that builds a new system under
  mounted scopes gives them back in the order they were opened, not the order they are declared,
  and a composite nested in a trapping surface and mounted in the same commit is still asked when
  both pass their element as `within`. `/auto` is not an adapter and does not run it: the suite asserts
  what a provider does across a render, and that helper has neither. It carries fourteen browser
  cases of its own.

## 6. Measurable claims and their gates

A claim without a gate does not go in the README.

| Claim | Gate | State today |
|---|---|---|
| Zero runtime dependencies | `package.json` declares no `dependencies`, and `scripts/check-package.ts:34-40` exits 1 naming them if it ever does; run by `bun run check:package` on the packed tarball, wired at `.github/workflows/ci.yml:55-56` | **Green.** The field is absent and the claim now has its gate rather than a reading: the dependency check runs before the pack, so the build fails on the manifest itself. The script then refuses a `private` manifest, refuses a missing `dist/`, packs with `bun pm pack` into a temporary directory and runs `publint --strict` and `attw --profile esm-only` on the tarball — the only artifact npm ever receives. `react` and `react-dom` stay optional peers, which a consumer already has or does not want. `bun run build && bun run check:package` here on 2026-09-20: passed for `@standarx/nav@0.0.0`, publint clean and `attw` green on both resolutions it is asked about |
| Blocking size budgets | `scripts/size-budget.ts` run by `bun run check:size` (`.github/workflows/ci.yml:57-58`); a line over its cap fails the run, and so does a line with no cap at all | **Green, eleven lines, every one capped, and every built module charged to one of them.** Measured here, not inherited: `bun run build && bun run check:size` on this package on 2026-09-22, min+gzip at Bun's default gzip level (which reads heavier than `gzip -9`): core 3.13 / 3.25 · gamepad engine 2.49 / 2.50 · spatial engine 3.04 / 3.25 · focus ring 1.51 / 1.75 · debug 0.49 / 0.50 · auto mount 0.60 / 0.75 · react adapter 1.30 / 1.50 · keyboard 2.82 / 3.00 · the three keyboard layouts 0.36 to 0.49, each capped at 0.50 kB. Each subpath is measured with the layers it imports and a consumer already pays for named external **file by file**: a glob is forbidden, because `*` does not cross a path separator and would silently stop measuring (`scripts/size-budget.ts:67-79`). So every subpath figure is the marginal cost of adding it next to what it already needs — the core for the three engines and the React adapter, and the spatial engine for `debug`, whose externals are `./spatial/spatial.js`, `./spatial/geometry.js` and `./tabbable.js` (`scripts/size-budget.ts:108-117`) — and a coverage check names any built module every line hands away, which is what a whole-package sum used to stand in for before 2026-09-23 ([ADR-0017](adr/0017-size-budgets.md)). Caps and the defects the first runs exposed are in [ADR-0017](adr/0017-size-budgets.md) |
| Never virtual focus | A browser test asserting `document.activeElement` after every move, plus a check that no id-keyed focus map exists in this package | **Half green.** The browser half is written: the spatial scene helper's `active()` reads `document.activeElement` and nothing else (`src/spatial/spatial.browser.test.ts:57`), and the fixtures of that file — 48 running cases and the one skipped shadow-DOM fixture, counted 2026-09-20 — check where the focus went through it alone, so a move that did not move real focus fails. The second half is still a reading rather than a check — the public surface carries no focus key, moves are addressed by direction and answered with a boolean, the elements they carry are real `HTMLElement`s on `WillMoveEvent.from`/`.to` (`src/spatial/spatial.ts:64-71`), and `plugin.focus` takes an element or a selector, so there is no id and no key anywhere on the surface — and R21's landing verification is unwritten |
| Geometry fixtures do not depend on CSS classes | Geometry fixtures positioned with inline styles only, so a fixture failure means the algorithm changed, never the stylesheet | **Green.** The unit fixtures score plain `Rect` literals with no DOM at all (`src/spatial/geometry.test.ts:10-12`), and every browser fixture is positioned by an inline `style` attribute (`src/spatial/spatial.browser.test.ts:12-14`). The package ships no stylesheet, so there is none for a fixture to depend on |
| Adapter parity | The shared suite `src/adapter-parity.ts` runs against every adapter; one that does not pass does not ship (R36) | **Written, and React passes it.** It is a callable runner, not a file to copy: an adapter supplies `mount`, `update`, `unmount`, `settle` and `act` over a tree of two scopes whose elements are nested in the DOM (`ParityTree` and `ParityAdapter`, `src/adapter-parity.ts:49-107`) and inherits 16 cases — one system per provider and never during the first render, delivery to the scopes, LIFO order, a scope released when only its own subtree unmounts, a trap stopping the walk, a `base` scope asked through that trap, a composite nested in a trapping surface and mounted in the same commit asked after the trap when both pass `within` and still silenced when neither does (ADR-0025), a scope re-registered in its place when its `base` changes on a rerender, the open order kept across a system rebuild in three shapes (the default tree, a scope declared first and opened last, and the same scope opened over a trap), every scope released on unmount, the reported modality, nothing listening after unmount, and a scope disposed after the provider was destroyed. React runs it at `src/react/react.browser.test.tsx:895`, over the adapter built at `:784-893`, alongside 29 adapter-specific cases. It is a one-adapter gate today because React is the only adapter that exists |
| Scoring performance | A bench of `findBestCandidate` **and** an end-to-end move measurement | **Neither exists, and one of them cannot yet.** There is no bench script and no benchmark: `vitest` 5.0.1 exports no `bench`. What is ported is the guard — the median of 51 samples scoring 200 candidates, asserted under 1 ms (`src/spatial/geometry.test.ts:156-177`) |

The guard carries the blind spot the inherited bench had: it measures `findBestCandidate` alone, and
not `collectNavNodes`, `getBoundingClientRect`, `querySelectorAll` or `checkVisibility`. A move is
not the arithmetic, and no end-to-end move is measured anywhere in this package. The benchmark that
measured 200 and 2000 candidates is not ported, for want of a `bench` export. See
[ADR-0018](adr/0018-testing-strategy.md).

## 7. Success criteria and decision date

Settled by the owner on 2026-09-20. Review date: **2027-03-31**, on which the project continues as
is, narrows its scope, or is archived — written as an ADR rather than left implicit. Two criteria,
deliberately: one about whether anybody outside found it, one about whether it was still being
worked on. Both are checked by looking, not by remembering.

1. **One identifiable external user.** One, not five. The evidence accepted is unchanged: a public
   repository depending on `@standarx/nav`, a third-party issue that is not from the owner, or a
   written report of use. One separates "someone found it" from "nobody did", and every number above
   one would have been invented before the first week of data existed.
2. **The package is published and still moving.** A first release on npm, and a CHANGELOG carrying
   entries dated after it. The first half is done, `0.1.0` on 2026-09-22; the second is a target
   and not a claim, and saying so is the point of writing the criterion down. Six released
   versions by 2027-03-31 is roughly one a month across the project's first two quarters: enough to show the work continued,
   few enough that it does not become a chore performed for the metric. It is checked by reading the
   registry and the CHANGELOG, neither of which can be back-dated.

Failure condition, stated so it can actually fire: if on 2027-03-31 there is no identifiable external
user **and** the package has not reached six released versions, the honest move is to archive the
standalone package and keep the engine where it already has a consumer. One of the two met is a
reason to look again, not to archive.

Two obligations survive outside the criteria, because they gate what the documents may claim rather
than whether the project continues: no document claims TV support until a real television and a
physical gamepad are recorded in a device report issue
(`.github/ISSUE_TEMPLATE/device_report.yml`), and the gates of §6 stay green in CI.

## 8. Open questions

1. **`aria-hidden`.** The engine specification this package inherits lists "not inside an
   `aria-hidden` subtree" among the candidate filters, but the shipped code does not filter it. §4 of
   this document follows the code. Which one is the contract? ADR-0009's other filters are settled
   (R31); this one is not.
2. **What a legacy build would have to show.** Whether a second build targeting Chromium 68-79
   (televisions of 2020-2021) is worth its cost is decided by **2026-12-31**, and the default is no:
   with no device report from such a runtime by that date, it is not built
   ([ADR-0013](adr/0013-browser-baseline-and-fallbacks.md)). What remains open is only what a device
   report would have to show to change that.
3. **Remote coverage.** Do Vidaa, Vizio, Roku, Fire TV and Android TV keycodes enter the default
   keymap, and how are they verified without the hardware?
4. **Name risk.** A third-party GitHub organisation `standarx` has existed since 2024-12-24 with a
   live site at standarx.com. No INPI, EUIPO or USPTO search has been run. This is a family-level
   risk, not specific to this project.
5. **Shadow DOM after v0.** Half answered. v0's position is settled and deliberate: no traversal in
   `getFocusables`, a shadow-aware `contains` beside it, the inconsistency documented, and the
   skipped fixture at `src/spatial/spatial.browser.test.ts:921` kept as the acceptance test of any
   future attempt ([ADR-0008](adr/0008-shadow-dom.md)). Coherence between the two is a v1 goal. What
   stays open is the shape — an opt-in root list or real traversal — and what it costs per move.
6. **Controls that hold a value: settled as recipes, not as shipped behaviour.** `pushEngageScope`
   now has four consumers — slider, number field, wheel picker and splitter — in
   `playground/widgets.ts`, driven by `src/engage.browser.test.ts`; the listbox added beside them
   opens a trapped `bus.pushScope` instead, not the engage grammar. None of them is exported: the
   package stays a navigation engine and a consumer copies the pattern rather than importing a
   component. The `<select>` half is [ADR-0021](adr/0021-native-select-on-television.md) — a
   `scanNativeSelects` diagnostic in the debug subpath names the trap, and the listbox replaces it.
   What stays open is whether the listbox eventually earns a subpath of its own, which needs a real
   television first.
7. **Virtual keyboard: built, and amended three times against a real page.**
   [ADR-0022](adr/0022-virtual-keyboard.md) settles the layout data shape, that a layout is passed in
   rather than registered, the `beforeinput`-mutate-`input` insertion order, and that composition is
   deferred to its own record. `back` closes and keeps what was typed, deliberately unlike engage
   mode. The field draws no caret while the keys hold the focus; the keyboard's own preview row does,
   mirrored from the field's selection, and the directions move it from that row — the reversal of
   the record's decision 9, argued in its amendment of 2026-09-21. The risk the record named as
   unverified, whether a controlled React input notices a programmatic mutation, was real on one path
   and is pinned by tests. What stays open is in [ROADMAP.md](../ROADMAP.md): a CJK layout and its
   composition record, `contenteditable`, and the action keys the preview row now makes wanted.
