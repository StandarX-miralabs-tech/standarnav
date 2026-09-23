# ADR-0009: Which candidates count as visible

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

The owner settled the two behaviour changes on 2026-09-20, and they were settled the opposite way
from each other. **(C1)**, dropping a candidate with any zero dimension, is **accepted for v0** and
is the one change this record announces; it is written and shipped in this pull request, with three
fixtures holding it in place. **(C2)**, dropping `opacity: 0`, is **refused for v0 and deferred to
v1**. They do not ship together — which is what this ADR originally assumed — and the amendment at
the foot of the record says why. Every other rule below describes what the code already does: it is
inherited from the predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not
re-derived here.

## Context

A move is only as good as its candidate list. Every element the engine keeps is a place the focus can
land, and every element it drops is a place the user cannot reach. The rule has to be one rule, in one
place, or the d-pad and the Tab key disagree.

The rules as they stand in this repository, all of them in two modules. Every rule below except the
last was inherited from the predecessor implementation ([ADR-0002](0002-license-and-copyright.md))
and not re-derived here; the last is the one (C1) has since changed.

| Rule | Where | What it does |
|---|---|---|
| `FOCUSABLE_SELECTOR` | `src/tabbable.ts:17-34` | The shape of a candidate: form controls without `disabled`, `a[href]`, `area[href]`, `iframe`, `object`, `embed`, `audio/video[controls]`, `summary`, `[contenteditable]`, `[tabindex]`. |
| `isHidden` | `src/tabbable.ts:43-52` | `checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })` where the browser has it; otherwise `offsetParent === null && getClientRects().length === 0`. |
| `isInert` | `src/tabbable.ts:54-56` | `closest("[inert]")`. An inert subtree is still visible, so it is a separate question. |
| `aria-disabled` | `isFocusable`, `src/tabbable.ts:58-67`, with the comment saying so at `:64-65` | Stays focusable, on purpose: APG wants disabled menu items and toolbar buttons reachable, unlike natively disabled controls. |
| `aria-hidden` | not filtered anywhere | Deliberate. A roving item is `tabindex="-1"` so the container owns one tab stop, and steering to it is the d-pad's whole job. The opt-out is `data-snav-ignore`, not a filter. |
| Zero-size filter | `collectNavNodes`, `src/spatial/spatial.ts:188` | `rect.width === 0 \|\| rect.height === 0`. Either dimension, since (C1); the inherited rule asked for both, so a 0x40 element stayed a candidate. |

The `aria-hidden` reading is documented and tested, not accidental:
`src/spatial/spatial.browser.test.ts:451-507` states the trap ("the trap that caught two components
in one day"), then pins three cases together — the d-pad reaches a
focusable the tab order skipped even when it is `aria-hidden`; the ignore attribute closes it and the
move lands on what is behind; and a roving item stays reachable, which is what stops someone "fixing"
the first case by filtering every `tabindex="-1"` out of the engine.

What is tested today: `hidden`, `display: none`, `inert` and `aria-disabled` — "ignores hidden and
inert subtrees" and "keeps aria-disabled items reachable, as APG asks"
(`src/tabbable.browser.test.ts:36-51`).

What is not tested, and where the rules are therefore only as good as a reading:

| Gap | Current behaviour, by reading | Consequence |
|---|---|---|
| `visibility: hidden` on the fallback path | `checkVisibility({ visibilityProperty: true })` excludes it; the fallback does not, because such an element still has client rects and an offset parent | The rule differs between a modern desktop browser and the fallback runtimes — and the fallback is the live path on the whole supported TV tier, since `checkVisibility` is Chrome 105 / Safari 17.4 / Firefox 106 (caniuse and MDN BCD, fetched 2026-09-18) while the supported tier starts at Chromium 85 ([ADR-0013](0013-browser-baseline-and-fallbacks.md)) |
| `opacity: 0` | Kept. Not asked of `checkVisibility` (the `opacityProperty` option is not passed at `src/tabbable.ts:49`) and invisible to the fallback | A fade-out overlay stays a target while it is transparent |
| `clip-path` | Kept. Nothing reads it | An element clipped to nothing is a target |
| Clipped by an `overflow: hidden` ancestor | Kept | Sometimes right, sometimes not: see the decision |
| Outside the scroller's viewport | Kept | This is exactly how a long list works: the move lands, then `scrollFocusIntoView` brings it in with `scrollIntoView` (`src/spatial/spatial.ts:294-306`) |

The last two are the reason this ADR is not "exclude everything you cannot see". `scrollAndRescan`
(`src/spatial/spatial.ts:382-407`) scrolls by `SCROLL_STEP_RATIO` of the scroller and rescans one
frame later, precisely because a virtualised list mounts its next rows on the scroll. A visibility rule that drops
off-screen candidates would break the feature that exists to reach them.

## Decision

Fixtures first. No rule below changes in the code until a browser fixture exists that fails on today's
behaviour and passes on the new one. The fixture set lives in `src/spatial/spatial.browser.test.ts`
and `src/tabbable.browser.test.ts`, one case per line of the gap table above, including the two cases
that are expected to keep their current behaviour.

Both files exist at HEAD and part of that set is written: the three zero-size
cases at `src/spatial/spatial.browser.test.ts:648-696`, and `hidden`, `inert` and `aria-disabled` at
`src/tabbable.browser.test.ts:36-51`. The rows still without a fixture are `visibility: hidden` on
the fallback path, `opacity: 0`, `clip-path`, and the two clipping rows — each of them a row whose
rule this decision leaves unchanged, except the first, which rule 5 changes and which therefore
still owes its fixture.

Then, in order:

1. **(C1) Exclude a candidate whose rect has any zero dimension — accepted for v0.**
   `rect.width === 0 || rect.height === 0` replaces the `&&` inherited from the predecessor
   implementation ([ADR-0002](0002-license-and-copyright.md)). A 0x40 element occupies no space on
   screen; scoring it gives the focus a destination with no visible
   location. The owner accepted it on 2026-09-20 over the objection that a 0-width cell is a
   plausible way to model a collapsed column: a collapsed column should be skipped over rather than
   entered, which is what the change does. It is **implemented at HEAD**:
   `src/spatial/spatial.ts:188` is `if (rect.width === 0 || rect.height === 0) continue;`, inside
   `collectNavNodes`, and the comment above it (`:183-187`) names this rule and the ADR it comes
   from. Three fixtures hold it: "drops an element with no size at all"
   (`src/spatial/spatial.browser.test.ts:663`), "drops one
   that is flat on a single axis" (`:672`, the case that fails if the operator is put back) and
   "keeps an element the width of a hairline" (`:686`, which bounds the rule at zero so a 1px
   divider stays a target).
2. **(C2) Exclude `opacity: 0` — refused for v0, deferred to v1.** The mechanism would be
   `opacityProperty: true` passed to `checkVisibility` where the browser accepts it, with
   `getComputedStyle(node).opacity === "0"` on the element itself where it does not. Refused on two
   counts, both of which are about the fallback rather than the modern path. Opacity is only
   readable from a computed style, so the fallback costs one `getComputedStyle` per candidate in the
   hot loop — and the fallback is the live path across the whole supported tier, because
   `checkVisibility` is Chrome 105 / Safari 17.4 / Firefox 106 while the tier starts at Chromium 85
   ([ADR-0013](0013-browser-baseline-and-fallbacks.md)). And the test it buys is incomplete anyway:
   opacity inherited from an ancestor does not reach the child's computed value, so a candidate
   inside a transparent parent still passes. Paying a per-candidate style read for a test that
   misses the common case is the wrong trade for v0. It is a v1 item, and v1 is where the ancestor
   question is answered rather than skipped.
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

- The visibility rule stays in one module (`src/tabbable.ts`), asked by the tab order helpers
  (`getTabbables`) and by the spatial engine's `collectNavNodes` alike — and by anything that comes
  to trap or restore focus, a feature inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. A divergence between the Tab
  key and the d-pad becomes a test failure, not a support ticket.
- One new `getComputedStyle` call appears on the fallback path, for rule 5 and only for candidates
  that already passed the selector test; the modern path stays one `checkVisibility` call per
  candidate. With (C2) refused, that is one style read per candidate and not two, which is the
  measurable part of refusing it. Neither is measured: this repository has no benchmark at all, and
  the timing guard it does have (`src/spatial/geometry.test.ts:156-177`, median of 51 samples under
  1 ms for 200 candidates) calls `findBestCandidate` alone — never `collectNavNodes`,
  `getBoundingClientRect`, `querySelectorAll` or `checkVisibility`. Measuring the full scan is a
  separate task; see [ADR-0018](0018-testing-strategy.md), decision 7, for why there is no bench.
- (C1) is breaking for anyone relying on the tolerance it replaced, and it is the only breaking change
  this record announces. It ships on its own, with a line in CHANGELOG naming the escape hatch:
  `data-snav-ignore` to remove a candidate, a non-zero size on both axes to keep one. (C2) carries
  no announcement because it does not ship; when it reaches v1 it gets its own line, and an element
  kept only by its transparency is a candidate until then.
- The documentation gains a short "why can my element not be reached" list, which is the same list the
  development-mode scan of [ADR-0010](0010-dev-mode-diagnostics.md) reports.
- The fixtures for the zero-size rule exist (`src/spatial/spatial.browser.test.ts:648-696`, three
  cases) and they pin the decided rule, which is what made (C1) land as a visible inversion rather
  than as a silent edit: the case at `:672` fails the moment the operator goes back to `&&`, and the
  case at `:686` fails the moment the rule creeps from zero to small. The README claims nothing
  about clipping, and states the same size and opacity rules as this record: an element with a
  zero dimension on either axis is not a candidate, and `opacity: 0` is kept for v0 and deferred
  to v1.

## Amendment, 2026-09-20: the two changes are separated

This record was written on the premise that (C1) and (C2) would land in one version, and every
consequence above was costed for the pair. The owner settled them separately, so the premise is
gone and the record is rewritten around the split rather than left reading as one decision.

What separates them is the fallback path, not the rule. (C1) reads a rect the engine already takes
— `getBoundingClientRect` is called for every candidate whatever else happens
(`src/spatial/spatial.ts:182`) — so changing `&&` to `||` costs nothing and asks
for no new browser API. (C2) reads a property that exists only in a computed style. On the modern
path that is an option flag on the `checkVisibility` call the engine already makes; on the fallback
path, which is the live path across the supported tier, it is a fresh `getComputedStyle` for every
candidate of every move. And the answer it returns is partial either way, because opacity
inherited from an ancestor is not in the child's computed value: the fade-out overlay this ADR gave
as the motivating case is usually the ancestor, not the candidate.

So the two changes have different costs, different risks and different completeness, and bundling
them would have made the cheap one wait for the expensive one. (C1) is v0 work and is done, behind
the fixtures this record asked for first. (C2) is a v1 item and is recorded in
[ROADMAP.md](../../ROADMAP.md) as one.

The status line moves from Proposed to Accepted with this amendment. The decision the record now
carries is a decision, not a question: rules 3 to 6 were never in doubt, rule 5 is a divergence
removal rather than a behaviour change, and the two riders that held the status open are closed.

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
so it stays rejected: `src/spatial/spatial.browser.test.ts:451-507`.

## Evidence

- `src/tabbable.ts:17-34`, `:43-52`, `:54-56`, `:58-67` — `FOCUSABLE_SELECTOR`, `isHidden`,
  `isInert`, `isFocusable` and the `aria-disabled` comment at `:64-65`.
- `src/tabbable.browser.test.ts:36-51` — the only visibility coverage that exists:
  `hidden`, `display: none`, `inert`, `aria-disabled`.
- `src/spatial/spatial.ts:188` — the zero-size filter, either dimension, inside `collectNavNodes`
  (`:170-193`).
- `src/spatial/spatial.ts:294-306`, `:382-407` — `scrollFocusIntoView` on landing, and
  `scrollAndRescan` one frame later.
- `src/spatial/spatial.browser.test.ts:451-507` — the `aria-hidden` decision and
  its three cases (the block comment at `:451-472`, then the cases at `:474`, `:486` and `:499`).
- The guard `src/spatial/geometry.test.ts:156-177`, "scores 200 candidates in well under a
  millisecond", and what it does not measure. Any benchmark figure for the full scan is inherited
  from the predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived
  here: this repository has no benchmark and no `bench` script ([ADR-0018](0018-testing-strategy.md),
  decision 7).
- State at HEAD in this repository: the zero-size filter is
  `rect.width === 0 || rect.height === 0` at `src/spatial/spatial.ts:188`, under a comment at
  `:183-187` naming (C1) and this record — so (C1) is decided and written.
  `src/tabbable.ts:43-52` carries `isHidden` with the
  `checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })` call and the
  `offsetParent === null && getClientRects().length === 0` fallback: `opacityProperty` is not
  passed, and the fallback has no `visibility` test, so rule 5 is also still to be written.
  `src/tabbable.ts:58-67` is `isFocusable`, with `aria-disabled` deliberately absent and the
  comment saying so; nothing filters `aria-hidden` anywhere.
- Fixtures in this repository: `src/spatial/spatial.browser.test.ts:648-696`, the
  candidate filter — "drops an element with no size at all" (`:663`), "drops one that is flat on a
  single axis" (`:672`) and "keeps an element the width of a hairline" (`:686`), the last being the
  bound that stops (C1) reaching a real target. A shared helper at `:656-661` resets padding, border
  and `min-width`, because a Chromium UA button measures 16 x 6 at width 0 and would never reach the
  filter at all. `src/spatial/spatial.browser.test.ts:473-507`, the three `aria-hidden` cases,
  carrying the trap they pin. Suite state at HEAD: `bun run test:unit` → 110 passed in
  11 files; `bun run test:browser` → 271 passed and 1 skipped in 13 files, the skip being the
  shadow-DOM fixture of [ADR-0008](0008-shadow-dom.md).
- `checkVisibility` availability: Chrome 105, Safari 17.4, Firefox 106 (caniuse and MDN browser-compat
  data, fetched 2026-09-18; table with URLs in
  [docs/research/tv-runtime-compatibility.md](../research/tv-runtime-compatibility.md)). Supported
  tier of this project: Chromium 85, Safari 15, Firefox 79
  ([ADR-0013](0013-browser-baseline-and-fallbacks.md), decided 2026-09-18).
- Behaviour of `visibility: hidden` and `opacity: 0` under the fallback is derived by reading the two
  lines of `src/tabbable.ts:47-51`, not measured in a browser. The fixtures required by this decision are
  what will turn that reading into a fact.
