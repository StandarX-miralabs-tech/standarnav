# ADR-0013: Browser baseline: most recent first, fallbacks for older runtimes

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One rider inside this ADR is Proposed and still needs the owner's confirmation: the decision date
for a separate legacy build (see "Legacy build" in the Decision section).

## Context

The engine this package ships (see [ADR-0003](0003-package-boundaries.md)) was written before this
repository existed, under a runtime floor that was never more than a build target: it compiled with
`target: "es2022"` and `lib: ["es2023", "dom", "dom.iterable"]`, inherited from the predecessor
implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. Nothing has ever
been run on a television, a console browser or a handheld — TV and consoles (webOS, Tizen) are out
of scope for want of the hardware and of an emulator, and the device verification is still open
([ROADMAP.md](../../ROADMAP.md)).

A library whose entire purpose is d-pad, remote and gamepad navigation is aimed exactly at the
runtimes this project still cannot test. So the floor has to be decided on paper, from published
engine versions, and it has to be honest about which parts are promises and which parts are hopes.

Two things set the floor today. The first is syntax: the compiled output must parse. The second is
APIs: four modern APIs appear in the code, and only some of them degrade.

The "used at" column below cites this repository; the amendment of 2026-09-20 at the foot of this
record is where every row was re-read against the code as it now stands, and says what changed.
The amendment of 2026-09-21 after it adds the API this table has no axis for: one whose floors are
below the supported tier on every engine, and which a runtime removes anyway.

| API | Chrome | Safari | Firefox | Used at | Behaviour when absent |
|---|---|---|---|---|---|
| `WeakRef` | 84 | 14.1 | 79 | `src/spatial/spatial.ts:130` constructs it inside `elementHandle()` (`:127-131`); `:109-111` is the `WeakRefCtor` type position and erases; `:131` reads through `deref()`; the per-container `memory` at `:248` holds that handle, not a bare reference, and is read back at `:344` | `ReferenceError` on the **first successful move**, not at construction — the construction sits in `elementHandle()`, reached from `remember()` (`:276`, `memory.set(container, elementHandle(element))` at `:286`), so an unguarded build would mount, render and accept focus, then throw the first time the user pressed a direction. That timing is why the detection is at the call site (`:129`) and not at module scope |
| `Element.checkVisibility()` | 105 | 17.4 | 106 | `src/tabbable.ts:45-47`, in `isHidden` | Falls back to `offsetParent === null && getClientRects().length === 0` (`:49`), which reads layout boxes only and so does not see `visibility: hidden` |
| `inert` attribute | 102 | 15.5 | 112 | `src/tabbable.ts:52-54`, in `isInert` | `closest("[inert]")` works everywhere; only the native focus-blocking effect is missing |
| `Array.prototype.at` | 92 | 15.4 | 90 | Nowhere: the call was removed rather than guarded — `getTabbableEdges` does index arithmetic at `src/tabbable.ts:89-92` | `TypeError` — and the only row whose floor is **above** the supported tier below, so it would throw on Chromium 85-91, Safari 15.0-15.3 and Firefox 79-89: runtimes this ADR promises to support. Not a `lib` question |

Versions from caniuse / MDN BCD, fetched 2026-09-18; URLs in the Evidence section.

These four rows are three different problems and were previously read as one. `WeakRef` sits inside
the supported tier on all three engines but below the **parsing floor** this ADR also declares
(Chromium 80, Safari 13.1, Firefox 74), so its fallback is what the best-effort band and the floor
need, and keeping `lib` at `es2020` is what keeps the fallback from being deleted as dead code.
`Array.prototype.at` is the one row above the supported tier, which makes rewriting it mandatory
and makes a `lib` bump the wrong fix — raising `lib` would silence the compiler and ship the break.
`Element.checkVisibility()` is above the supported tier on all three engines too, so the weaker
`offsetParent` path is not a fallback for old runtimes but **the live path across the whole
supported tier**; the table above should not be read as promising parity between the two branches,
and [ADR-0009](0009-hidden-candidates.md) is where that divergence is decided. Only `inert` behaves
the way a fallback row normally reads.

Mapped onto television firmware (Samsung and LG published engine tables, fetched 2026-09-18):

| Model year | Tizen | Chromium | webOS | Chromium |
|---|---|---|---|---|
| 2018 | 4.0 | 56 | 4.x | 53 |
| 2019 | 5.0 | 63 | 4.x | 53 |
| 2020 | 5.5 | 69 | 5.x | 68 |
| 2021 | 6.0 | 76 | 6.x | 79 |
| 2022 | 6.5 | 85 | 22 | 87 |
| 2023 | 7.0 | 94 | 23 | 94 |
| 2024 | 8.0 | 108 | 24 | 108 |
| 2025 | 9.0 | 120 | 25 | 120 |

Model years and firmware versions from the vendor tables above; the same mapping, with its source
URLs, is published in
[docs/research/tv-runtime-compatibility.md](../research/tv-runtime-compatibility.md).

Two limits stack on those sets. The unguarded `WeakRef` puts the runtime floor at Chrome 84,
Safari 14.1 and Firefox 79 (caniuse / MDN BCD, fetched 2026-09-18). The `es2022` output this code
was first compiled to — inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here — puts a syntax floor near
Chromium 85, because of `??=`, `||=` and class fields (compatibility survey of 2026-09-18, an
estimate). The first firmware at or above both is Tizen 6.5 (Chromium 85) and webOS 22
(Chromium 87), the 2022 model year. Every 2020 and 2021 set
fails, and the syntax limit fails at parse time, which is the worse of the two: no feature
detection can rescue a file the engine refused to read.

## Decision

1. The build target is **`es2020`** and the type library is **`lib: ["es2020", "dom", "dom.iterable"]`**,
   both in place (`tsconfig.json`). `es2020` syntax parses on Chromium 80+, Safari 13.1+,
   Firefox 74+ and Samsung Internet 13.0+, the floor set by optional
   chaining and nullish coalescing (caniuse, fetched 2026-09-18; URLs under Evidence). Keeping `lib`
   at `es2020` is the enforcement mechanism: `WeakRef` and `Array.prototype.at` become type errors, so
   using one is a compile failure unless it is written behind a feature check with a local ambient
   declaration in the module that guards it.
2. Every API newer than the floor is feature-detected and has a fallback:
   - `WeakRef` → a strong reference in the per-container focus memory, validated with
     `isConnected` when it is read back. The weak reference existed so a removed child would be
     forgotten for free; `isConnected` on read gives the same observable behaviour, at the cost of
     holding one element per container until the next read.
   - `checkVisibility` → the fallback already written here, inside `isHidden`: the detection and
     call at `src/tabbable.ts:45-47`, the fallback expression at `:49`, kept as is, including its
     known blind spot for `visibility: hidden` — `:49` reads layout boxes and nothing else.
   - `inert` → `closest("[inert]")` is an attribute read and works on every engine we target; only
     the native effect differs, and the library does not rely on it.
   - `Array.prototype.at` → index arithmetic (`list[list.length - 1]`).
3. Support is published in three tiers, and the words mean different things:

| Tier | Runtimes | What is claimed |
|---|---|---|
| Supported and tested | Chromium ≥ 85, Safari ≥ 15, Firefox ≥ 79 (tier boundaries decided by the owner on 2026-09-18 and recorded in this ADR) | Syntax parses, every API used is present or guarded, and the browser suite runs on chromium, firefox and webkit in CI ([ADR-0014](0014-device-and-browser-matrix.md)) |
| Best-effort | TV 2020-2021: Tizen 5.5/6.0 (Chromium 69/76), webOS 5.x/6.x (Chromium 68/79) | No claim. The `es2020` output does not parse below Chromium 80, so webOS 6.x (79) and everything under it are expected to fail at load |
| Unknown | Hisense Vidaa, Vizio SmartCast, Steam Deck | No vendor-published engine version for Vidaa or Vizio. The Steam client's embedded Chromium was 109 in the beta client of 2024-01-18; no newer version disclosed as of 2026-09-18 |

The "supported and tested" tier is a statement about engines, not about devices. No device is
claimed until a dated device report exists; that rule is [ADR-0014](0014-device-and-browser-matrix.md).

**Legacy build (Proposed).** Reaching the 2020-2021 sets needs a second artefact — a lower target
plus the transforms that come with it — not another flag on the current one. That is a roadmap
item with a decision date, not a v0 promise. Proposed decision date: **2026-12-31**, by which the
owner either commits to a legacy build or records it as a non-goal. Until then the answer to "does
it work on a 2021 Tizen set" is "no, and there is no work in progress".

## Consequences

- The size budgets this package started from were measured on `es2022` output and were never valid
  here: they are inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. They have been replaced by
  measurements of this repository's own `es2020` output: `bun run build && bun run check:size`,
  2026-09-21, min+gzip — core 3.13 kB of a 3.25 kB
  cap, gamepad engine 2.49 of 2.50, spatial engine 3.04 of 3.25, focus ring 1.51 of 1.75, debug
  0.49 of 0.50, react adapter 1.30 of 1.50, keyboard 2.82 of 3.00, the three layouts 0.36 to 0.49
  against 0.50 each, whole package 12.40 of 12.50, every line under its cap
  ([ADR-0017](0017-size-budgets.md)). Those inherited figures — spatial 2.81 kB of 3.00, input
  system 1.93 of 2.00 — remain context about a build measured elsewhere and are not comparable line
  for line, because the lines were drawn differently. Downlevelling did not blow a budget, which was
  the open worry here.
- A CI check must still be added that greps the built `dist` for `WeakRef` and for `.at(` and fails
  when either appears outside the single module that guards it. The workflow
  (`.github/workflows/ci.yml`) now runs six jobs — lint (`:18`), typecheck (`:32`), build (`:42`),
  test (`:60`, the unit suite), react-floor (`:75-101`, the declared peer floor re-typechecked and
  re-run on chromium) and browser (`:103-129`, a matrix over chromium, firefox and webkit), which is
  eight checks — and the build job runs `bun run build`, the `git diff --exit-code` exports-map drift
  gate (`:53`), `check:package` (`:55`) and `check:size` (`:57`). **None of them is this grep**:
  neither `WeakRef` nor `.at(` appears anywhere in that file. Without it, one refactor silently
  restores the Chrome 84 floor and nothing notices — the CI browsers are current engines, so they
  have every API the fallbacks exist for.
- The fallback paths are the ones no CI browser exercises, so they need a test that hides the
  modern API from the module under test. The `WeakRef` one is written:
  `src/spatial/spatial.browser.test.ts:794-826` deletes `WeakRef` from `globalThis` for the
  duration of the case and asserts that the memory still remembers and still forgets a removed
  child, which is the only thing that ever runs the strong-reference branch. The other two rows
  have no such test: nothing hides `checkVisibility` from `src/tabbable.ts`, and the
  `Array.prototype.at` row cannot have one because the rewrite removed the call rather than
  guarding it.
- The documented floor and the tested floor are different numbers, and both go in the README. The
  library is built to parse on Chromium 80; the suite runs on whatever engines the pinned Playwright
  release ships.

## Amendment, 2026-09-20: the baseline checked against the code that now exists

The four rows of the Context table were settled before this code existed, and each has since been
re-read against the code that now ships. Decision 2 holds on every row; what changed is that the
line numbers are local and one row is no longer a fallback at all.

| API | What the code does here | Read at |
|---|---|---|
| `WeakRef` | Feature-detected at call time, not at module scope, and the constructor is read off `globalThis` so a test can delete it. Present → a real `WeakRef`; absent → a strong reference that drops itself on the first read finding the element detached | `src/spatial/spatial.ts:109-141` |
| `Element.checkVisibility()` | Feature-detected through an `unknown` cast to an interface whose method is optional, with the comment saying the cast exists so the fallback does not read as dead code. Present → `checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })`; absent → `offsetParent === null && getClientRects().length === 0` | `src/tabbable.ts:34-50` |
| `inert` | `closest("[inert]")`, an attribute read with no detection and no fallback, because the attribute is readable on every engine in the tier and only the native focus-blocking effect differs | `src/tabbable.ts:52-54` |
| `Array.prototype.at` | **Not detected — removed.** `getTabbableEdges` uses `tabbables[tabbables.length - 1]`, with a comment naming this ADR's tier as the reason | `src/tabbable.ts:85-93` |

The last row is the one that changed category. Decision 2 listed `.at` among the APIs with a
fallback; there is no fallback, because there is no call. That is the stronger outcome and it is
what this ADR asked for — "raising `lib` would silence the compiler and ship the break" — but the
row should read "rewritten", not "falls back to".

The enforcement mechanism is in place and working: `tsconfig.json` is `"target": "es2020"` and
`"lib": ["es2020", "dom", "dom.iterable"]`, so `WeakRef` is not in the type
environment, and the module that uses it declares its own `WeakRefCtor` interface locally
(`src/spatial/spatial.ts:109-111`) — exactly the "local ambient declaration in the module that
guards it" decision 1 describes. `bun run typecheck` is green in CI on that configuration.

One API this ADR does not list is now in the code and should be: `Element.animate` (WAAPI), called
unguarded three times by the focus ring (`src/focus-ring/focus-ring.ts:150`, `:190`, `:192`). Its
support floor across the three engines has **not been verified here** — no caniuse or BCD fetch was
made for it on 2026-09-20 — so it gets no row in the table above until someone fetches it. The
exposure is bounded: the focus ring is an opt-in subpath, and a missing `animate` would throw in
the overlay rather than in the engine. Verifying it, and guarding the call if the floor turns out
to sit above Chromium 85, is a v0 follow-up.

## Amendment, 2026-09-21: the Gamepad API, absent by runtime rather than by version

The amendment above left one API unlisted for want of a fetch. Here is a second, fetched and
listed — and it is the row that shows why the Context table cannot be the only place this ADR
looks.

| API | Chrome | Safari | Firefox | Samsung Internet | Used at |
|---|---|---|---|---|---|
| Gamepad API (`navigator.getGamepads`) | 21 | 10.1 | 29 | 4 | `src/gamepad/gamepad.ts:130-144`, in `defaultRuntime` |

Versions from caniuse, fetched 2026-09-21; URL in the Evidence section. Every floor sits far
**below** the supported tier, which is what makes this row different in kind from the four above:
no version this ADR promises to support is missing the API, so reading the table by version says
the call is safe. It is not. What removes the Gamepad API is the runtime, not the version —
Playwright's WebKit ships without `navigator.getGamepads` at any version, measured here on
2026-09-21, and a television runtime that omits it is the same shape. Decision 2 asks what happens
when an API is absent; on this axis the table had no answer because it had no row.

What the unguarded call cost is the point. `Element.animate` in the amendment above is called
unguarded too, and the exposure there is bounded — it would throw in an opt-in overlay. This one
was read during `setup`, so the `TypeError` came out of `createInputSystem` itself and took the
keyboard, the focus ring and every other plugin with it: a page that merely *registered* the
gamepad plugin went dark on a runtime with no pads. An engine that cannot find a device must
report no device, never fail the system that asked.

The guard is the answer this repository had already written for a document with no window:
`defaultRuntime` returns `null` when `navigator.getGamepads` is not callable, and a `null` runtime
is the state in which the plugin registers nothing and tears down cleanly. Three browser cases
cover it (`src/gamepad/gamepad.browser.test.ts:582-645`), two of which fail without the guard.

One hole stays open and is not guarded: a `getGamepads` that exists and *throws* — a permissions
policy in a cross-origin frame is the plausible case — is still an exception out of `setup`. It has
not been reproduced here, so it gets no guard and no claim, only this sentence.

## Alternatives considered

- **Keep the inherited `es2022` target.** Rejected. `es2022` was the starting point — inherited from
  the predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here
  — and its syntax floor sits near Chromium 85 (survey of 2026-09-18 cited above), which excludes
  every 2020 and 2021 television, and it does so invisibly: the failure is a `SyntaxError` at load
  with no stack pointing at a feature. A floor set by an API at least produces a named error at the
  call site.
- **Target `es2018` and cover 2018-2019 sets.** Rejected for v0. It costs output size on the lines
  already nearest their caps — the gamepad engine at 2.49 kB of 2.50 (100 %) and the core at 3.13 of
  3.25 (96 %), with the spatial engine at 3.04 of 3.25 (94 %), the figures recorded above
  ([ADR-0017](0017-size-budgets.md)) — for firmware whose engines (Chromium 53-63) lack far more
  than syntax. It stays available if the legacy build above is ever accepted.
- **Ship two builds from day one, modern and legacy.** Rejected for v0. Two artefacts means two
  exports maps, two size budgets and two failure modes to explain, before a single device report
  exists to say the legacy one works. The decision is deferred with a date rather than guessed now.
- **Polyfill `WeakRef` instead of falling back.** Rejected. A `WeakRef` polyfill is a strong
  reference wearing the API's name, which is exactly the fallback chosen here, minus the honesty and
  plus the bytes.

## Evidence

- `tsconfig.json`: `"target": "es2020"`, `"lib": ["es2020", "dom", "dom.iterable"]`.
- This repository's own guards: `src/spatial/spatial.ts:109-141` — `WeakRefCtor` declared locally at
  `:109-111`, the constructor read off `globalThis` at call time in `elementHandle` (`:127-128`), the
  real reference built at `:130` and read through at `:131`, and the self-releasing
  strong-reference fallback at `:134-140`; `:248` is the per-container focus memory
  (`new WeakMap<HTMLElement, ElementHandle>()`), written in `remember` at `:286` and read back
  through `deref()` at `:344`. `src/tabbable.ts:34-50` (`isHidden`: `VisibilityCheck` with an
  optional method, the `unknown` cast and its comment, the detection and call at `:45-47`, and the
  `offsetParent`/`getClientRects` fallback at `:49`); `:52-54` (`isInert`, `closest("[inert]")`);
  `:85-93` (`getTabbableEdges`, `tabbables[tabbables.length - 1]` at `:92` with the comment naming
  this ADR's tier at `:89-91`). The fallback that has a test:
  `src/spatial/spatial.browser.test.ts:794-826`.
- The `"target": "es2022"` and `"lib": ["es2023", "dom", "dom.iterable"]` that this code was first
  compiled under: inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here.
- No television, console browser or handheld has been tested here: `ROADMAP.md` records that
  nothing has been run on a television, and `:138-139` keeps one verified set, Tizen or webOS, with a
  dated device report, open ([ROADMAP.md](../../ROADMAP.md)). There is no hardware for it here and no
  emulator.
- Syntax floor for `es2020` output, fetched 2026-09-18 — optional chaining `?.` Chrome 80, Safari 13.1, Firefox 74, Samsung Internet 13.0: https://caniuse.com/mdn-javascript_operators_optional_chaining · nullish coalescing `??` Chrome 80, Safari 13.1, Firefox 72, Samsung Internet 13.0: https://caniuse.com/mdn-javascript_operators_nullish_coalescing · the two combined give Chrome 80, Safari 13.1, Firefox 74, Samsung Internet 13.0.
- API support, fetched 2026-09-18: https://caniuse.com/mdn-javascript_builtins_weakref · https://caniuse.com/mdn-api_element_checkvisibility · https://caniuse.com/mdn-html_global_attributes_inert
- `Array.prototype.at` (Chrome 92, Safari 15.4, Firefox 90, Samsung Internet 16.0), fetched 2026-09-18: https://caniuse.com/mdn-javascript_builtins_array_at
- Gamepad API (Chrome 21, Safari 10.1, Firefox 29, Samsung Internet 4), fetched 2026-09-21: https://caniuse.com/gamepad — and the runtime that has none of it regardless of version, measured here on 2026-09-21: Playwright's WebKit exposes no `navigator.getGamepads`, which is why `src/gamepad/gamepad.browser.test.ts:582-645` builds the case by deleting the accessor rather than by picking an engine.
- Television engine tables, fetched 2026-09-18: https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html · https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- The method behind the two inherited size figures: `check:size` against a same-day `dist`, min+gzip,
  externals `../*` and `../../*` — inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, which is why those lines are
  not comparable with this package's own. This repository's measurement is dated in the Consequences
  section and governed by [ADR-0017](0017-size-budgets.md).
- Compatibility survey with the full table: [docs/research/tv-runtime-compatibility.md](../research/tv-runtime-compatibility.md) (2026-09-18).
- Steam Deck: the Steam client's embedded Chromium (CEF) was 109.0.5414.120 in the beta client of 2024-01-18, https://steamdeckhq.com/news/steam-deck-beta-client-1-18-24-descriptions/ · no newer version is disclosed as of 2026-09-18; Valve confirmed a November 2025 rebuild from the Alloy to the Chrome runtime without giving a version, https://steamcommunity.com/groups/SteamClientBeta/discussions/3/688615792191756981/ · the row therefore stays "unknown".
