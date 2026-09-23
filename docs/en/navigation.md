# How a move is decided, and what makes an element navigable

## How a move is decided

For one direction, starting from `document.activeElement` (`src/spatial/spatial.ts`):

1. **Redirect.** If the focused element carries `data-snav-<direction>`, the selector is resolved
   on the whole document and the move ends there.
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

`@standarx/nav/spatial` publishes the two functions that walk that list — `containerOf` and
`collectNavNodes` — so a diagnostic can score exactly what the engine scores rather than something
that looks like it. The attributes the walk reads are in [attributes.md](attributes.md).

## Make your element navigable

- The engine sees what the platform sees: it collects elements matching the focusable selector —
  `input`, `select`, `textarea`, `button`, `a[href]`, `area[href]`, `iframe`, `object`, `embed`,
  `audio[controls]`, `video[controls]`, `summary`, `[contenteditable]`, `[tabindex]`
  (`src/tabbable.ts`).
- A `div` with an `onclick` is not focusable. Give it `tabindex="0"`, or use a real `button`.
- `aria-hidden` is deliberately **not** filtered: it hides an element from a screen reader, not
  from the d-pad. `isFocusable` rejects a non-matching selector, a disabled element, a hidden
  element and an inert one, and nothing else. Use `data-snav-ignore`, `inert`, or `display: none`.
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
- `aria-disabled` stays a candidate, on purpose, because the APG wants disabled items reachable.
  `inert` ancestors and elements hidden per `checkVisibility` are dropped.
- An element with **either** dimension at zero is dropped — the candidate filter tests
  `rect.width === 0 || rect.height === 0`, so a 0 by 40 element is not a candidate. This is filter
  C1 of [ADR-0009](../adr/0009-hidden-candidates.md): it inverts an `&&` inherited from the
  predecessor implementation ([ADR-0002](../adr/0002-license-and-copyright.md)), which asked for
  both dimensions at once and let that 0 by 40 element through. Such a rect paints nothing, and
  its projection onto the cross axis is empty, so the alignment pass can never call it aligned.
  The rule is zero, not small — a hairline divider or a deliberately slim control stays reachable.
  A candidate at `opacity: 0` is **not** filtered: that reads a computed style per candidate in
  the hot loop and misses opacity inherited from an ancestor anyway, so filter C2 is refused for
  v0 and deferred to v1.
- Shadow roots are not traversed when candidates are collected: `getFocusables` is light DOM only
  in v0, deliberately, and a fixture for the other behaviour is parked as a skipped test. The
  reasoning and where it goes in v1 are in [ADR-0008](../adr/0008-shadow-dom.md).

When a move surprises you, read the scored list with `explainMove` from `@standarx/nav/debug`
(`src/debug.ts`).
