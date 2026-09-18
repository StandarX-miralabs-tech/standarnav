# ADR-0009: Which candidates count as visible

Status: Proposed
Date: 2026-09-18
Deciders: Wesley Cormier

Two behaviour changes, marked (C1) and (C2) below, need the owner's confirmation; every other rule
describes what the source already does and is inherited as is.

## Context

A move is only as good as its candidate list. Every element the engine keeps is a place the focus can
land, and every element it drops is a place the user cannot reach. The rule has to be one rule, in one
place, or the d-pad and the Tab key disagree.

The inherited rules, read in the source on 2026-09-18:

| Rule | Where | What it does |
|---|---|---|
| `FOCUSABLE_SELECTOR` | `packages/core/src/focus/tabbable.ts:16-31` | The shape of a candidate: form controls without `disabled`, `a[href]`, `area[href]`, `iframe`, `object`, `embed`, `audio/video[controls]`, `summary`, `[contenteditable]`, `[tabindex]`. |
| `isHidden` | `tabbable.ts:40-46` | `checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })` where the browser has it; otherwise `offsetParent === null && getClientRects().length === 0`. |
| `isInert` | `tabbable.ts:48-50` | `closest("[inert]")`. An inert subtree is still visible, so it is a separate question. |
| `aria-disabled` | `tabbable.ts:56-58` | Stays focusable, on purpose: APG wants disabled menu items and toolbar buttons reachable, unlike natively disabled controls. |
| `aria-hidden` | not filtered anywhere | Deliberate. A roving item is `tabindex="-1"` so the container owns one tab stop, and steering to it is the d-pad's whole job. The opt-out is `data-snav-ignore`, not a filter. |
| Zero-size filter | `packages/core/src/input/spatial/spatial.ts:141` | `rect.width === 0 && rect.height === 0`. Both dimensions. A 0x40 element stays a candidate. |

The `aria-hidden` reading is documented and tested, not accidental:
`packages/core/src/input/spatial/spatial.browser.test.ts:386-442` states the trap ("the trap that
caught two components in one day, 2026-09-05"), then pins three cases together — the d-pad reaches a
focusable the tab order skipped even when it is `aria-hidden`; the ignore attribute closes it and the
move lands on what is behind; and a roving item stays reachable, which is what stops someone "fixing"
the first case by filtering every `tabindex="-1"` out of the engine.

What is tested today: `hidden`, `display: none`, `inert` and `aria-disabled`
(`packages/core/src/focus/focus.browser.test.ts:60-75`).

What is not tested, and where the rules are therefore only as good as a reading:

| Gap | Current behaviour, by reading | Consequence |
|---|---|---|
| `visibility: hidden` on the fallback path | `checkVisibility({ visibilityProperty: true })` excludes it; the fallback does not, because such an element still has client rects and an offset parent | The rule differs between a modern desktop browser and the fallback runtimes — and the fallback is the live path on the whole supported TV tier, since `checkVisibility` is Chrome 105 / Safari 17.4 / Firefox 106 (caniuse and MDN BCD, fetched 2026-09-18) while the supported tier starts at Chromium 85 ([ADR-0013](0013-browser-baseline-and-fallbacks.md)) |
| `opacity: 0` | Kept. Not asked of `checkVisibility` (the `opacityProperty` option is not passed, `tabbable.ts:43`) and invisible to the fallback | A fade-out overlay stays a target while it is transparent |
| `clip-path` | Kept. Nothing reads it | An element clipped to nothing is a target |
| Clipped by an `overflow: hidden` ancestor | Kept | Sometimes right, sometimes not: see the decision |
| Outside the scroller's viewport | Kept | This is exactly how a long list works: the move lands, then `scrollIntoView` brings it in (`spatial.ts:243-255`) |

The last two are the reason this ADR is not "exclude everything you cannot see". Scroll-and-rescan
(`spatial.ts:322-351`) scrolls by `SCROLL_STEP_RATIO` of the scroller and rescans one frame later,
precisely because a virtualised list mounts its next rows on the scroll. A visibility rule that drops
off-screen candidates would break the feature that exists to reach them.

## Decision

Fixtures first. No rule below changes in the code until a browser fixture exists that fails on today's
behaviour and passes on the new one. The fixture set lives in `src/spatial/spatial.browser.test.ts`
and `src/tabbable.browser.test.ts`, one case per line of the gap table above, including the two cases
that are expected to keep their current behaviour.

Then, in order:

1. **(C1) Exclude a candidate whose rect has any zero dimension.** `rect.width === 0 || rect.height === 0`
   replaces the `&&` at `spatial.ts:141`. A 0x40 element occupies no space on screen; scoring it gives
   the focus a destination with no visible location. This is a behaviour change and needs the owner's
   confirmation, because a 0-width cell is a plausible way to model a collapsed column that should
   still be skipped over rather than entered.
2. **(C2) Exclude `opacity: 0`.** Pass `opacityProperty: true` to `checkVisibility` where the browser
   accepts it, and fall back to `getComputedStyle(node).opacity === "0"` on the element itself where it
   does not. The fallback deliberately does not walk ancestors: a parent's opacity is inherited into
   the rendering, not into the computed value of the child, and walking every ancestor on every
   candidate is the kind of cost this engine refuses in the hot path. This is a behaviour change and
   needs confirmation, because a fade-in animation starting at `opacity: 0` would make its own trigger
   briefly unreachable.
3. **Keep overflow-clipped candidates reachable.** They are not excluded. They are reached through
   scroll-and-rescan, which is how virtualised lists work. If a fixture later shows a case where that
   produces a move to nowhere, the answer is a better rescan, not a filter.
4. **Leave `clip-path` as a documented limitation.** No code, no cost, one line in the documentation.
   Reading `clip-path` means parsing a shape and intersecting it with a rect, per candidate, per move.
   It stays out until a fixture proves a real need.
5. **Align the fallback with `checkVisibility` for `visibility: hidden`.** The fallback gains a
   `getComputedStyle(node).visibility === "hidden"` test so the two paths answer the same thing on the
   tier the project actually supports. This is not a behaviour change on the modern path; it is the
   removal of a divergence.
6. **Keep `aria-disabled` and `aria-hidden` as they are.** Both are load-bearing, both are tested, and
   both have an opt-out (`disabled`, `data-snav-ignore`). See [ADR-0008](0008-shadow-dom.md) for the
   other half of "what the scan can see".

## Consequences

- The visibility rule stays in one module (`src/tabbable.ts`), used by the tab order, the focus trap
  and the spatial engine alike. A divergence between the Tab key and the d-pad becomes a test failure,
  not a support ticket.
- Two new `getComputedStyle` calls appear on the fallback path only, and only for candidates that
  already passed the selector test. The modern path stays one `checkVisibility` call per candidate.
  Neither is measured yet: the existing bench covers `findBestCandidate` alone and explicitly not
  `getBoundingClientRect`, `querySelectorAll` or `checkVisibility` (`geometry.bench.ts`, and the same
  blind spot in `geometry.test.ts:156-177`). Measuring the full scan is a separate task.
- (C1) and (C2) are breaking for anyone relying on the current tolerance. They land together, in the
  same version, with a line in CHANGELOG naming the escape hatch (`data-snav-ignore` to remove a
  candidate, a non-zero size or a non-zero opacity to keep one).
- The documentation gains a short "why can my element not be reached" list, which is the same list the
  development-mode scan of [ADR-0010](0010-dev-mode-diagnostics.md) reports.
- Until the fixtures exist, none of this is in the code. The status of this ADR stays Proposed and the
  README claims nothing about opacity, clipping or zero-size elements.

## Alternatives considered

**IntersectionObserver-based visibility.** Observe every candidate, keep a live set of what is on
screen, filter the scan against it. Rejected: it is asynchronous by construction, so the first move
after a mutation reads a stale set; it needs an observer per scroll root and a lifecycle to tear them
down; and it answers "is on screen", which is the wrong question — off-screen candidates are exactly
what scroll-and-rescan exists to reach.

**Pure geometric clipping against every scroll ancestor.** For each candidate, walk up to the root
intersecting the rect with each clipping ancestor. Rejected for the hot path: it multiplies the per-move
cost by the depth of the tree, on runtimes whose supported tier starts at Chromium 85
([ADR-0013](0013-browser-baseline-and-fallbacks.md)), and it still
answers the wrong question for virtualised lists. It stays a plausible tool for the development-mode
scan, where cost does not matter.

**Exclude everything a screen reader ignores (`aria-hidden` included).** Rejected, and pinned by a test
so it stays rejected: `spatial.browser.test.ts:386-442`.

## Evidence

- `packages/core/src/focus/tabbable.ts:16-31`, `:40-46`, `:48-50`, `:52-59` — selector, `isHidden`,
  `isInert`, `isFocusable` and the `aria-disabled` comment.
- `packages/core/src/focus/focus.browser.test.ts:60-75` — the only visibility coverage that exists:
  `hidden`, `display: none`, `inert`, `aria-disabled`.
- `packages/core/src/input/spatial/spatial.ts:141` — the zero-size filter, both dimensions.
- `packages/core/src/input/spatial/spatial.ts:243-255`, `:322-351` — `scrollIntoView` on landing, and
  scroll-and-rescan one frame later.
- `packages/core/src/input/spatial/spatial.browser.test.ts:386-442` — the `aria-hidden` decision and
  its three cases (the block comment at `:386-407`, then the cases at `:409`, `:421` and `:434`).
- `packages/core/src/input/spatial/geometry.bench.ts` and `geometry.test.ts:156-177` — the bench and
  the guard, and what they do not measure.
- Source repository miralabs-ui at commit `289fa607`, read on 2026-09-18, read-only.
- `checkVisibility` availability: Chrome 105, Safari 17.4, Firefox 106 (caniuse and MDN browser-compat
  data, fetched 2026-09-18; table with URLs in
  [docs/research/tv-runtime-compatibility.md](../research/tv-runtime-compatibility.md)). Supported
  tier of this project: Chromium 85, Safari 15, Firefox 79
  ([ADR-0013](0013-browser-baseline-and-fallbacks.md), decided 2026-09-18).
- Behaviour of `visibility: hidden` and `opacity: 0` under the fallback is derived by reading the two
  lines of `tabbable.ts:45`, not measured in a browser. The fixtures required by this decision are
  what will turn that reading into a fact.
