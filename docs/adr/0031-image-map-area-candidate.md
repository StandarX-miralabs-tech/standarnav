# ADR-0031: An image-map area is a candidate, scored by its shape over its image

Status: Accepted
Date: 2026-09-26
Deciders: Wesley Cormier

## Context

Answers [issue #30](https://github.com/StandarX-miralabs-tech/standarnav/issues/30). An
`<area href>` of an image map is focused by every engine, and a Tab reaches it, yet `isFocusable`
answered `false` for it on chromium and webkit, so the d-pad never reached it there; on firefox it
was a candidate, and every area of one map was scored by the same rect, the image's.
[ADR-0030](0030-refused-focus-next-candidate.md) left it for its own issue (Consequences, Evidence).

An `<area href>` of a map an `<img usemap>` uses, on 2026-09-26 (Chromium 153.0.8010.12, Firefox
155.0, WebKit 26.6, Playwright 1.63.0; Evidence). Each row held for every shape tried: a rectangle,
a circle, a polygon, `default`, no `shape`, reversed coords, coords separated by spaces, radius 0.

| The area | chromium | firefox | webkit |
|---|---|---|---|
| `getBoundingClientRect()` | all zero | the image's whole rect | all zero |
| `getClientRects().length`, `checkVisibility()` | 0, `false` | 1, `true` | 0, `false` |
| `focus()` from a button, then Tab | lands, reached | lands, reached | lands, reached |
| the box its `coords` are laid over | the image's border box | none exposed: `elementFromPoint` answers the image | the image's content box |
| `area.scrollIntoView()`, image below the fold | no scroll | scrolls | no scroll |
| `pointerover` and `click` target; a click moves the focus | the area; yes | the area; no | the area; yes |

Refused on all three: an area of a map no image uses, an area outside any `<map>`, an area whose
image is `display: none`, `visibility: hidden` or under a `display: none` parent, a `usemap` whose
letter case differs from the map's `name`, and a map only an `<object usemap>` uses. Focused on all
three: an area whose image is 0 x 0, or has no `src` or a broken one (its box is then its `width`
and `height`), a map anywhere in the document, a map two images use (chromium and webkit hit-test
the area over both; firefox's rect follows the last image), `<area href disabled>`, and a map inside
`inert` while its image is outside. Split: `<area href tabindex="-1">`, an image inside `inert`
with its map outside, and a map two images use, the first `display: none` or `visibility: hidden`
and the second shown, are refused by chromium and webkit, where firefox focuses the area and Tab
reaches it; a map found by its `id` with no `name`, and `<area tabindex="0">` with no `href`, by
webkit; an area of a map an `<input type=image usemap>` uses is focused by firefox alone.

## Decision

**1. The core asks the image.** `isHidden` answers for an `<area>` with the image that uses its
map, before the `checkVisibility` read: hidden when there is none, otherwise what `isHidden` says
of the image (`src/tabbable.ts:49-52`). `imageOf` (`:155-176`, exported) takes the area's enclosing
`<map>` and, among the `img[usemap]` of the area's own tree whose `usemap` after its first `#`
equals the map's `name` or `id`, compared as written, as the engines compare it, returns the first
in tree order that `isHidden` does not drop, or the last when it drops them all. The first visible
one rather than the first: firefox focuses the area while any of its images shows, so a hidden
first image leaves it a candidate, which chromium and webkit refuse (decision 4). `<img>` only: no engine wires an `<object usemap>`, and only firefox an `<input type=image>`. The
`id` is accepted because chromium and firefox focus such an area. The core holds the rule for
ADR-0030's reason: `isFocusable` and `isTabbable` are exports an application reads too.

**2. The geometry comes from the shape, on every engine, in `src/dom/platform.ts`.** `rectOf`
(`:14-48`) returns `getBoundingClientRect()` for any element but an area with an image. For such an
area it lays the shape over the image's `getBoundingClientRect()`, its border box: `default`, in any
letter case, is the image's rect (`:23`); `circle` or `circ` the square around the centre and the
radius; `poly` or `polygon` the bounding box of the pairs, a trailing odd coordinate dropped;
anything else — `rect`, `rectangle`, no `shape`, an unknown one — a rectangle normalised so reversed
coords work. The coords are the numbers in the attribute, commas and spaces both separating,
negative and decimal accepted (`:26-30`). A circle with fewer than three numbers or a negative
radius, a polygon with fewer than six and a rectangle with fewer than four describe nothing: a zero
rect (`:32-34`), which filter C1 of [ADR-0009](0009-hidden-candidates.md) drops
(`src/spatial/spatial.ts:188`). `rectOf` is not beside `imageOf` because of the hole
[ADR-0017](0017-size-budgets.md) records in its amendment of 2026-09-26: a helper at the foot of
`tabbable.js` that `index.js` does not re-export is charged to no size line. `dom/platform.js` is
charged to the spatial and focus ring lines and no root export reaches it; it imports `imageOf` from
`tabbable.ts`, which imports only `dom/query`, so there is no cycle.

**3. Every reader of a candidate's geometry goes through it.** `collectNavNodes`
(`src/spatial/spatial.ts:182`) and the origin of `move` (`:502`) read `rectOf`.
`scrollFocusIntoView` scrolls the image when the landing element is an area (`:298`), since chromium
and webkit do not scroll an area; the container and its `data-snav-scroll` are still read off the
area (`:300`). `explainMove` reads its origin through `rectOf` (`src/debug.ts:60`), so it agrees
with the engine ([ADR-0010](0010-dev-mode-diagnostics.md), decision 4), and so does the focus ring
(`src/focus-ring/focus-ring.ts:107`). Left alone: `focusFirst`'s origin, a container
(`src/spatial/spatial.ts:535`), and the ring's own live rect (`src/focus-ring/focus-ring.ts:175`).

**4. What the engines split on is left to the retry of ADR-0030.** The first five splits of the
Context are candidates, and so is an area inside an editing host, which chromium refused on
2026-09-24 (ADR-0030, Context); where the browser refuses, the move goes on to the next candidate.

**5. Rules and deviations, documented rather than coded.**

- An area belongs to the container that holds its map, where `collectNavNodes` finds it
  (`containerOf`, `src/spatial/spatial.ts:148-151`). Put the map beside its image.
- `inert` on an ancestor of the map drops the area (`isInert`, `src/tabbable.ts:63-65`), though
  every engine focuses it while the image is outside. Put `inert` on an ancestor of both.
- The coords are laid over the border box; webkit's hit region is off it by the image's border and
  padding, 8 px further in on a 3 px border and 5 px padding.
- A map two images use is scored over the first of them that is not hidden, where firefox's own
  rect follows the last; an area of a map only an `<input type=image>` uses is not a candidate,
  though firefox focuses it.
- `<area href disabled>` is dropped by rule 6 of ADR-0009, as any element but a form control is.

## Consequences

- Bytes, `bun run build && bun run check:size` on 2026-09-26, min+gzip: core 3 464 B (was 3 346)
  of an unchanged 3.50 kB, spatial engine 3 628 B (was 3 318) of 3.75 kB, focus ring 1 863 B (was
  1 558) of 2.00 kB, debug 503 B (was 499) of an unchanged 0.50 kB, 9 bytes left. The two caps
  moved by ADR-0017's amendment of that date, in its own commit before the code.
- A move from an area starts from its shape, where at cf28e57 it started from the corner of the
  viewport on chromium and webkit and from the whole image on firefox. The ring and `explainMove`
  follow: a circle is ringed by its bounding square, its radius read off the area's own style.
- The size accounting gains a rule, in ADR-0017: a helper a subpath needs lives in a module that
  subpath's line pays for, or is re-exported by the root.
- Specification §4, R21, R31 and R32 are amended to match this record, §4 with a sixth exception.
- Not measured yet: two maps sharing one `name`, where `imageOf` pairs each area with its own map;
  a `usemap` that does not start with `#`; an image scaled by CSS; an area in a shadow root, which
  `imageOf` pairs with an image of the same root.

## Alternatives considered

- **`rectOf` at the foot of `tabbable.ts`, beside `imageOf`.** The spatial line read +8 bytes, but
  the core line shakes out what `index.js` does not re-export and every subpath marks `tabbable.js`
  external: about 288 bytes charged to no line (ADR-0017, amendment of 2026-09-26).
- **`rectOf` public, re-exported by the core.** Honest accounting, but a consumer of the core alone
  pays for it, and a fix would add a public API.
- **The spatial engine alone, as the issue was filed.** 3 607 bytes on the spatial line and none
  elsewhere, but the ring would stay at the corner of the viewport, about 4 px square, on chromium
  and webkit, and `explainMove` would read an all-zero origin and disagree with the engine.
- **Resolving an area's container by its image.** 28 bytes more on the spatial line on the first
  spike, and incomplete: `collectNavNodes` would also have to collect the areas of a map used by an
  image of the container, a version not measured.
- **Reading firefox's own rect.** It is the image's for every area of the map, the last image's
  when two use it, and chromium and webkit give none.
- **A `CSS.escape` selector for the image**, 19 bytes more on the core than the loop. **A module of
  its own, `src/dom/area.ts`**, an import line more in `spatial.ts` and `focus-ring.ts`, moving
  every cited line below it; its bytes were not measured.

## Evidence

- The Context: a temporary Playwright script outside the tree, run on the three engines on
  2026-09-26 and deleted, and for the map two images use with the first hidden, a second one inside
  the tree the same day, deleted before any commit; the bytes of the alternatives, the same day on exploratory branches.
- Tests, red at cf28e57 on the engines named. `src/tabbable.browser.test.ts`: "keeps an area of an
  image map in use, and drops one no image uses" (chromium, webkit). The `describe` of ADR-0031 in
  `src/spatial/spatial.browser.test.ts`: "reaches each shape of a map in turn", "moves from an area
  by its shape, not from the corner of the viewport", "reads the shape over the first visible of two
  images using one map" and "scrolls the image into view, not the area" (all three); "takes the whole
  image for a default shape", "normalises a rectangle written backwards" and "a hover lands on an
  area" (chromium, webkit); "drops a shape that describes nothing" (firefox); "does not offer an
  area whose map no image uses" pins what already held, green on all three.
  `src/debug.browser.test.ts`: "reads an area's origin by its shape, as the engine does", and
  `src/focus-ring/focus-ring.browser.test.ts`: "wears the shape of an area over its image" (all
  three). At cf28e57 chromium failed 10 of them, firefox 7, webkit 10.
- 2026-09-26: `bun run test` → 617 passed, 1 skipped (618) in 32 files, of which `bun run
  test:unit` 121 in 14 and `bun run test:browser` 496 and the skip in 18; the four touched browser
  files with `SNAV_BROWSER` at chromium, firefox and webkit → 129 passed, 1 skipped each.
- Bytes: `bun run check:size` on 2026-09-26 after `bun run build`, and a temporary copy of the
  script printing the exact bytes, outside the commits and deleted.
- The real page, 2026-09-26: the "Image map" section of `playground/index.html`, served by `vite`
  and driven by Playwright in `app` mode. From the button before the map, ArrowRight five times
  reached the rectangle, the circle, the polygon, the strip and the button after it, and ArrowLeft
  walked back, on all three engines, with no page error; the ring around the 90 px circle measured
  94 px square, its 2 px offset on each side.

## Amendment, 2026-09-26: the four cases the record left unmeasured, measured, and no code changed

Measured with a temporary Playwright script outside the tree, run on chromium 153.0.8010.12,
firefox 155.0 and webkit 26.6 (Playwright 1.63.0) and deleted: `focus()` from a button, a Tab walk
from that button, `getBoundingClientRect()`, and the `pointerover` target of a pointer moved over
the image, every fixture on one page. The code is unchanged at 9436bc9; five tests pin what it
answers, named under Evidence below.

| The `<area href>` | chromium | firefox | webkit | `isFocusable` |
|---|---|---|---|---|
| of a second `<map>` of the same `name`, one image | focused, Tab reaches | refused | focused, Tab reaches | `true` |
| of a `<map name>` placed after a `<map id>` of that name | focused | refused | focused | `true` |
| of that `<map id>`, placed first | focused | focused, the image's rect | refused | `true` |
| of a map a `usemap` without `#` names | refused | refused | refused | `false` |
| of a map an image resized by CSS uses | focused | focused, the image's CSS rect | focused | `true` |
| of a map and its image inside one shadow root | refused | focused | focused | `true` |
| of a map in the light tree, its image inside a shadow root | refused | refused | refused | `false` |
| of a map inside a shadow root, its image in the light tree | focused, Tab reaches | refused | refused | `false` |

The hit region, read off `pointerover`, is the same on all three: the areas of the first `<map>`
of the image's tree, in tree order, whose `name` or `id` the `usemap` names after its `#` — the
`<map id>` when it comes first — and never those of a later map of that name; nothing for a
`usemap` without `#`; the coords as written, in CSS pixels from the image's corner, whatever size
CSS gives the image, so a rectangle at `0,0,100,50` covers a quarter of an image drawn at twice its
`width` and `height`; the area of a map and its image inside one shadow root; the image alone when
the map or the image is inside a shadow root without the other, or inside a nested one, whose area
every engine refuses too. Focus is not the hit region: chromium focuses the areas of every map whose
`name` or `id` some image of the document names, webkit those of every map of the image's tree by
`name`, firefox only those of the map the image is wired to.

**What follows.** `imageOf` pairs an area with the first visible `img[usemap]` of the area's own
tree naming its map by `name` or `id` (decision 1). That keeps a later map's areas and the pair
inside one shadow root as candidates, and leaves firefox's refusal of the former and chromium's of
the latter to the retry of [ADR-0030](0030-refused-focus-next-candidate.md) (decision 4): two
splits more than the Context lists. It drops an area whose `usemap` has no `#`, as every engine
does, and one whose map or image alone sits inside a shadow root, as firefox and webkit do;
chromium focuses the areas of a map inside a shadow root whose image is in the light tree, a sixth
documented deviation under decision 5 — the image is not in the area's tree, and pairing across a
shadow boundary would contradict [ADR-0008](0008-shadow-dom.md). `rectOf` lays the coords over the
image's border box as written (decision 2), and no engine scales them when CSS resizes the image,
so the regions of a resized image stay where its coords say, in the engine as on every engine.

**Resolving an area's container by its image, measured complete.** `containerOf` starting from
`imageOf(area) ?? area`, and `collectNavNodes` adding the areas of every map outside the container
that an `img[usemap]` inside it names by `name` or `id`, of the image's tree: 3 729 B min+gzip on
the spatial line at 9436bc9, 101 bytes more than the 3 628 B shipped, where the first spike's 28
were `containerOf` alone; core, focus ring and debug unchanged. It typechecks, builds and passes
the spatial and debug suites on chromium. Not adopted: the rule of decision 5 stands, a map beside
its image. Measured on 2026-09-26 on a detached worktree with a copy of `scripts/size-budget.ts`
printing bytes, both deleted.

Evidence:

- Tests, green at 9436bc9 on chromium, firefox and webkit, since they pin what the code already
  answers: "pairs an area with an image of its own tree, by the map's name or id" in
  `src/tabbable.browser.test.ts`; "lays the coords over an image scaled by CSS as written,
  unscaled", "reaches the area of a second map of the same name, where the engine focuses it" and
  "does not offer an area whose usemap has no leading #" in the `describe` of this record in
  `src/spatial/spatial.browser.test.ts`; "lays an area's coords over its image as written, whatever
  size CSS gives the image" in `src/dom/dom.browser.test.ts`. The second-map test reads whether the
  engine takes the area before asserting, as the two-image test of the record does.
- 2026-09-26: `bun run test` → 622 passed, 1 skipped (623) in 32 files, of which `bun run
  test:unit` 121 in 14 and `bun run test:browser` 501 and the skip in 18; the three touched browser
  files with `SNAV_BROWSER` at chromium, firefox and webkit → 113 passed, 1 skipped each.
- Bytes: `bun run build && bun run check:size` at 9436bc9, every line as on the record's date; the
  alternative above on a detached worktree of the same commit, the same day.
- The specification's §4 paragraph on the area, and `docs/en/navigation.md` with its mirror, carry
  the measured cases from this date.
