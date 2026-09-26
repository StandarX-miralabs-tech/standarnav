# How a move is decided, and what makes an element navigable

## How a move is decided

For one direction, starting from `document.activeElement` (`src/spatial/spatial.ts`):

1. **Redirect.** If the focused element carries `data-snav-<direction>`, the selector is resolved
   on the whole document and the move ends there. A selector that matches nothing, or whose first
   match is not focusable — disabled, hidden, inert — is ignored, and the move goes on to step 2
   as if the attribute were absent. Test: "ignores a redirection to a target that cannot take the
   focus" (`src/spatial/spatial.browser.test.ts`).
2. **Geometry.** Candidates are collected in the nearest declared container. A nested container
   counts as one candidate, scored as a single rectangle, not as all of its children. The
   best-aligned candidate wins; ties go to DOM order, because candidates are collected in document
   order and that is the tiebreak the spec asks for.
3. **Wrap.** If the container wraps in this axis, the move lands on the opposite edge.
4. **Scroll and rescan.** If something can still scroll in this direction, the engine scrolls one
   step — four fifths of the scroller's own viewport — and retries once on the next frame. Only
   once, or a list with no reachable end would scroll to the bottom on a single press.
5. **Step out.** The walk moves to the parent container and repeats from step 2 — unless the
   container traps, blocks this direction, or is the root. It is bounded at sixteen levels.

When the walk ends with nothing, `onBoundsHit(direction)` fires and the move returns `false`.

The browser has the last word on the landing. If the chosen element does not become the active
element after `focus()`, the engine writes nothing on it — `data-snav-focused` stays where it was,
and no container remembers it — and, since 2026-09-24, goes on to the next candidate, in the order
above: the next best in the same container, then its wrap candidate, the scroll and rescan, and the
parent container. A redirect whose target refuses falls through to step 2 the same way.
`onBoundsHit` fires when every candidate refused. `onWillMove` is asked once per candidate tried,
and a veto still ends the move. If the focus lands somewhere else, because an application's own
`focus` handler moved it, the move stops and returns `false`, and the focus stays where the
application put it. `focus(target)` tries only the target it names. What every engine refuses is
not a candidate to begin with (next section); what remains are refusals the engines split on — an
`<embed>` with a `type` and no `src` on chromium and webkit, an empty `<object>` and a link with a
`tabindex` inside an editing host on firefox (Playwright, 2026-09-24), and an image-map area with
`tabindex="-1"` or of a map whose first image is hidden and a later one shown on chromium and
webkit, or of a map named by its `id` alone on webkit (Playwright, 2026-09-26). Tests: "reports a
move whose target refused the focus as not made" and the `describe`
"spatialPlugin — a refused candidate hands the move on (ADR-0030)"
(`src/spatial/spatial.browser.test.ts`); the reasoning is in
[ADR-0030](../adr/0030-refused-focus-next-candidate.md).

`@standarx/nav/spatial` publishes the two functions that walk that list — `containerOf` and
`collectNavNodes` — so a diagnostic can score exactly what the engine scores rather than something
that looks like it. The attributes the walk reads are in [attributes.md](attributes.md).

## Make your element navigable

- The engine sees what the platform sees: it collects elements matching the focusable selector —
  `input`, `select`, `textarea`, `button`, `a[href]`, `area[href]`, `iframe`, `object`, `embed`,
  `audio[controls]`, `video[controls]`, the first `<summary>` of a `<details>`,
  `[contenteditable]`, `[tabindex]` (`src/tabbable.ts`). That list is exported as
  `FOCUSABLE_SELECTOR`, whose string changed on 2026-09-24: its `summary` arm became
  `details>summary:first-of-type`, and its arms were reordered.
- An `<area href>` of an image map is a candidate since 2026-09-26 when an `<img usemap>` naming
  its map by its `name` or `id` uses it and is not hidden; the first such image in the document
  places it. Firefox focuses the area while any of those images shows, chromium and webkit only
  while the first in the document does. Its place is its `shape` and `coords` laid over the image,
  not its own box, which
  chromium and webkit report empty and firefox as the whole image; webkit hit-tests the coords
  over the image's content box, so on an image with a border or padding its regions sit that far
  inside the engine's. An area of a map no image uses, or outside any `<map>`, is not a candidate:
  no engine focuses it. An area belongs to the container that holds its map, not its image, so
  keep the map beside its image. When an area lands, its image is scrolled into view. Tests: "keeps
  an area of an image map in use, and drops one no image uses" (`src/tabbable.browser.test.ts`)
  and the `describe` "spatialPlugin — an image-map area is scored by its shape over its image
  (ADR-0031)" (`src/spatial/spatial.browser.test.ts`); the measurements of chromium, firefox and
  webkit are in [ADR-0031](../adr/0031-image-map-area-candidate.md).
- A `div` with an `onclick` is not focusable. Give it `tabindex="0"`, or use a real `button`.
- `[contenteditable]` counts only when it makes the element editable: `contenteditable="false"`,
  and `inherit` or an invalid value under a parent that is not editable, are not candidates, since
  the browser does not focus them either. An editing host — an editable element whose parent is
  not editable — is a Tab stop for `isTabbable` although its `tabIndex` reads -1, unless it
  carries `tabindex="-1"`; what is editable inside a host is not. Tests: "drops a contenteditable
  attribute that does not make its element editable" and "counts an editing host as a Tab stop,
  and not what is editable inside it" (`src/tabbable.browser.test.ts`).
- Inside an editing host, a link and an element that is focusable only for being editable are not
  candidates unless they carry a `tabindex`: chromium, firefox and webkit all refuse them the focus
  (Playwright, 2026-09-24). A form control, a frame, an embedded object, a media element with
  controls and a details summary stay candidates inside a host. A second `<summary>` in a
  `<details>`, one nested deeper and one outside any `<details>` are not candidates either, for the
  same reason. Tests: "drops a link and a nested editable of an editing host, unless they carry a
  tabindex" and "takes only the first summary child of a details as focusable"
  (`src/tabbable.browser.test.ts`).
- `aria-hidden` is deliberately **not** filtered: it hides an element from a screen reader, not
  from the d-pad. `isFocusable` rejects a non-matching selector, a disabled element, a hidden
  element, an inert one, and the link or editable-only element of a host above, and nothing else.
  Use `data-snav-ignore`, `inert`, or `display: none`.
- Disabled means what the browser means: a form control with `disabled`, or one inside a
  `<fieldset disabled>` anywhere but in its first `<legend>`. A link or a `tabindex` element
  inside that fieldset stays a candidate, as it stays focusable in the browser. Tests: "drops what
  a disabled fieldset disables, and keeps its first legend and its links"
  (`src/tabbable.browser.test.ts`) and "steps over the controls of a disabled fieldset"
  (`src/spatial/spatial.browser.test.ts`).
- One exception goes further than the browser: `disabled` on an element that is not a form
  control, such as `<div tabindex="0" disabled>` or `<a href disabled>`, drops it although the
  browser still focuses it. It is the opt-out for an `aria-disabled` item
  ([ADR-0009](../adr/0009-hidden-candidates.md), rule 6). Test: "still rejects disabled on an
  element the browser would focus, ADR-0009 rule 6" (`src/tabbable.browser.test.ts`).
- A second goes further since 2026-09-26: `inert` on an ancestor of an image map drops its areas,
  although chromium, firefox and webkit all focus them while the image is outside the inert
  subtree (Playwright, 2026-09-26). Put `inert` on an ancestor of both the image and the map.
- `aria-disabled` stays a candidate, on purpose, because the APG wants disabled items reachable.
  `inert` ancestors and elements hidden per `checkVisibility` are dropped.
- An element with **either** dimension at zero is dropped — the candidate filter tests
  `rect.width === 0 || rect.height === 0`, so a 0 by 40 element is not a candidate. This is filter
  C1 of [ADR-0009](../adr/0009-hidden-candidates.md): it inverts an `&&` inherited from the
  predecessor implementation ([ADR-0002](../adr/0002-license-and-copyright.md)), which asked for
  both dimensions at once and let that 0 by 40 element through. Such a rect paints nothing, and
  its projection onto the cross axis is empty, so the alignment pass can never call it aligned.
  The rule is zero, not small — a hairline divider or a deliberately slim control stays reachable.
  An image-map area whose shape describes nothing — a rectangle with fewer than four coordinates,
  a polygon with fewer than six, a circle with fewer than three or a negative radius — measures as
  a zero rect and is dropped the same way. Test: "drops a shape that describes nothing"
  (`src/spatial/spatial.browser.test.ts`). A candidate at `opacity: 0` is **not** filtered: that
  reads a computed style per candidate in the hot loop and misses opacity inherited from an
  ancestor anyway, so filter C2 is refused for v0 and deferred to v1.
- Shadow roots are not traversed when candidates are collected: `getFocusables` is light DOM only
  in v0, deliberately, and a fixture for the other behaviour is parked as a skipped test. The
  reasoning and where it goes in v1 are in [ADR-0008](../adr/0008-shadow-dom.md).

When a move surprises you, read the scored list with `explainMove` from `@standarx/nav/debug`
(`src/debug.ts`). It does not focus anything, so it cannot see a refusal: when the browser refuses
its winner, the engine lands on the next candidate instead. It reads an image-map area's origin by
its shape, as the engine does. Test: "reads an area's origin by its shape, as the engine does"
(`src/debug.browser.test.ts`).

## Native radios and ranges in `app` mode

In `app` mode the engine takes every arrow key, so a native radio group and a range lose theirs:
ArrowDown moves the focus to the next radio without checking it, and ArrowRight moves the focus
off a range without stepping it. The engine never guesses which controls to leave alone
([ADR-0026](../adr/0026-native-handler-answer.md)); a scope says so by answering `"native"`. That
ends the walk before the engine and leaves the key to the browser:

```ts
const group = document.querySelector<HTMLElement>("#size")!;

const dispose = input.pushScope(
  (event) =>
    event.source === "keyboard" &&
    (event.intent === "moveUp" || event.intent === "moveDown") &&
    group.contains(document.activeElement)
      ? "native"
      : false,
  { within: group },
);
```

- **Keyboard only.** A pad has no native default for a direction, so `"native"` for a pad would
  stop the walk and move nothing. The pad keeps moving spatially, and adjusts a range through
  engage mode (`pushEngageScope`).
- **The control's own axis only.** Up and down for a vertical radio group, left and right for a
  range. A television remote's arrows reach the page as the same `ArrowUp` to `ArrowRight` keys, so
  `event.source` cannot tell it from a keyboard; and a native radio group wraps on chromium and
  firefox, so a remote whose every arrow went to it could never leave. The other axis stays the
  engine's, which always leaves a way out.
- **`within` on the control**, so the answer still reaches the scope when the control sits inside a
  trapping dialog that names its surface ([ADR-0025](../adr/0025-trap-within-its-surface.md)).

Tests, with real key presses on chromium, firefox and webkit: `src/native-answer.browser.test.ts`
— ArrowDown checks the next radio, ArrowRight leaves the group, ArrowRight and ArrowLeft step a
range and ArrowDown leaves it, and without the scope the engine moves as before.
