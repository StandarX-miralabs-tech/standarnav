# TV and runtime compatibility

This document lists which JavaScript APIs the input engine relies on, the first
browser version that supports each one, and the TV runtime versions that ship
those browsers. Every table below is dated **fetched 2026-09-18**, and every
version number carries the URL it was read from.

standarnav is unreleased (extraction in progress). Nothing in this document
implies the package has been tested on a physical TV or device; see
`../adr/0013-browser-baseline-and-fallbacks.md` for the baseline decision and
its status.

## API support

Sources: caniuse.com / MDN Browser Compatibility Data, fetched 2026-09-18. The
paths in the "Used at" column are relative to the source repository
miralabs-ui, from which this engine is being extracted.

| API | Chrome | Safari | Firefox | Used at (source engine) | Behaviour if absent |
|---|---|---|---|---|---|
| `WeakRef` | 84 | 14.1 | 79 | `packages/core/src/input/spatial/spatial.ts:198,235` | Source engine: no fallback, `ReferenceError` at plugin creation. Planned for standarnav: a fallback using a strong reference validated with `element.isConnected` instead of `WeakRef` — see `../adr/0013-browser-baseline-and-fallbacks.md`. |
| `Element.checkVisibility()` | 105 | 17.4 | 106 | `packages/core/src/focus/tabbable.ts:41-45` | Fallback already present in source: `offsetParent === null && getClientRects().length === 0`. Degrades cleanly; this fallback does not detect `visibility: hidden`. |
| `[inert]` attribute effect | 102 | 15.5 | 112 | `packages/core/src/focus/tabbable.ts:48-50` | `closest("[inert]")` works everywhere as an attribute check; only the browser's native inert *behaviour* (blocking focus/pointer/AOM automatically) is missing. Degrades cleanly. |
| `Array.prototype.at` | 92 | 15.4 | 90 | `packages/core/src/focus/tabbable.ts:85` (`tabbables.at(-1)`) | Source engine: `TypeError` if unsupported. standarnav avoids `.at()` in the extracted code and uses index arithmetic (`list[list.length - 1]`) instead — see `../adr/0013-browser-baseline-and-fallbacks.md`. This repository's `tsconfig.json` declares `lib: ["es2020", "dom", "dom.iterable"]`, so a call to `.at()` is a type error here as well as a runtime risk. First Samsung Internet version: 16.0. |
| ES2020 syntax (optional chaining `?.`, nullish coalescing `??`) | 80 | 13.1 | 74 | Whole build output. The `es2020` TypeScript target is the owner's decision of 2026-09-18, recorded in `../adr/0013-browser-baseline-and-fallbacks.md` | Below this floor the whole bundle fails to parse (`SyntaxError`) before any fallback logic runs. The floor is the higher of the two operators: `?.` is Chrome 80 / Safari 13.1 / Firefox 74, `??` is Chrome 80 / Safari 13.1 / Firefox 72. First Samsung Internet version for both: 13.0. Note: the source repository miralabs-ui targets `es2022` (`tsconfig.base.json:3-4`, read 2026-09-18; floor Chromium 85), a stricter floor than the `es2020` target chosen here. |

Sources: https://caniuse.com/mdn-javascript_builtins_weakref ·
https://caniuse.com/mdn-api_element_checkvisibility ·
https://caniuse.com/mdn-html_global_attributes_inert ·
https://caniuse.com/mdn-javascript_builtins_array_at ·
https://caniuse.com/mdn-javascript_operators_optional_chaining ·
https://caniuse.com/mdn-javascript_operators_nullish_coalescing

The same version numbers appear in
`../adr/0013-browser-baseline-and-fallbacks.md`.

## TV runtime versions

Sources: Samsung Developers, "Web Engine Specifications"
(https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
and LG webOS TV, "Web API and Web Engine"
(https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine),
both fetched 2026-09-18.

| TV year | Tizen version | Tizen Chromium | webOS version | webOS Chromium |
|---|---|---|---|---|
| 2018 | 4.0 | 56 | 4.x | 53 |
| 2019 | 5.0 | 63 | 4.x | 53 |
| 2020 | 5.5 | 69 | 5.x | 68 |
| 2021 | 6.0 | 76 | 6.x | 79 |
| 2022 | 6.5 | 85 | 22 | 87 |
| 2023 | 7.0 | 94 | 23 | 94 |
| 2024 | 8.0 | 108 | 24 | 108 |
| 2025 | 9.0 | 120 | 25 | 120 |

### Unverified runtimes

| Runtime | Status | What was searched |
|---|---|---|
| Hisense VIDAA | Not measured yet | No public Chromium version number found for any VIDAA generation as of 2026-09-18. |
| Vizio SmartCast | Not measured yet | No public Chromium version number found for any SmartCast generation as of 2026-09-18. |
| Steam Deck (Steam client CEF) | Documented once, then stale | The Steam Deck beta client of 2024-01-18 shipped embedded Chromium (CEF) 109.0.5414.120 (https://steamdeckhq.com/news/steam-deck-beta-client-1-18-24-descriptions/). No newer version number has been disclosed as of 2026-09-18: Valve confirmed a November 2025 rebuild of the client browser (Alloy runtime to Chrome runtime) without naming a Chromium version (https://steamcommunity.com/groups/SteamClientBeta/discussions/3/688615792191756981/). Treat any build after 2024-01-18 as not measured yet. |

## What this means for the engine

Each row below restates the "behaviour if absent" column above as a design
consequence, and names the resulting compatibility tier from
`../adr/0013-browser-baseline-and-fallbacks.md`.

- **`WeakRef` absent**: without the planned fallback, the plugin cannot even
  be constructed. Among the APIs above, `WeakRef` has the lowest support
  threshold (Chromium 84 / Safari 14.1 / Firefox 79), but it still sits four
  versions above the Chromium 80 syntax floor of the `es2020` target, so
  leaving it unguarded would raise the effective floor from 80 to 84. The
  fallback recorded in `../adr/0013-browser-baseline-and-fallbacks.md` (strong
  reference plus an `isConnected` check) removes `WeakRef` as a constraint,
  which is what lets the syntax target become the single floor. For
  comparison, the source engine builds to `es2022` (floor Chromium 85, Tizen
  6.5, model year 2022) and carries no such fallback.
- **`checkVisibility()` absent**: no functional risk. The existing fallback in
  `tabbable.ts` is a strict subset of what `checkVisibility()` detects
  (it misses `visibility: hidden`), so visibility-filtering degrades in
  precision, not correctness of the happy path.
- **`inert` attribute effect absent**: no functional risk for this engine's
  own logic, because it reads the attribute directly (`closest("[inert]")`)
  rather than relying on the browser's native inert behaviour. Pages that
  depend on the *native* inert effect (rather than this engine's read of the
  attribute) for anything else keep whatever native support their runtime
  has.
- **`Array.prototype.at` absent**: functional risk only where the source
  engine calls it (`tabbable.ts:85`). The plan is to remove the call rather
  than add a fallback.
- **Below the ES2020 syntax floor**: the entire bundle fails to parse. There
  is no fallback for a syntax floor; the only levers are the build target
  itself and, if ever built, a separate legacy build.

### Resulting tiers (see `../adr/0013-browser-baseline-and-fallbacks.md`)

- **Supported and tested tier**: Chromium ≥ 85 (TV 2022 and newer: Tizen 6.5,
  webOS 22), Safari ≥ 15, Firefox ≥ 79. The ADR states that this tier is a
  claim about engines, not about devices.
- **Best-effort tier**: TV 2020-2021 (Tizen 5.5/6.0 = Chromium 69/76, webOS
  5.x/6.x = Chromium 68/79). Every runtime in this tier is below Chromium 80,
  so the ES2020 output is expected to fail at load on all four of them.
  Reaching them needs a separate legacy build with a lower target. Whether
  that build is a v1 goal is a roadmap decision, not a v0 promise — see the
  ADR for the proposed decision date.
- **Unknown**: Hisense VIDAA, Vizio SmartCast, and Steam Deck beyond the
  Chromium 109 snapshot documented for the beta client of 2024-01-18.

No claim in this document implies that any of these tiers has been verified
against physical hardware. Device testing is a roadmap item.
