# ADR-0005: Real DOM focus, never a virtual cursor

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

A directional navigation engine has to answer one question before any other: what
does "focused" mean? Two answers exist in the field.

The first keeps focus in the page. The engine calls `element.focus()` on a real
element and reads `document.activeElement` to know where it is. The browser owns the
state; the library only decides where it should go next.

The second keeps focus in the library. The engine holds a key, an id or a node of
its own tree, marks it as focused, and asks the application to render that state,
usually as a CSS class or a framework boolean. The DOM never learns that anything
moved.

The second answer is cheaper to implement on a television, where the set of
navigable things is a list the application already owns, and it is why several TV
libraries chose it. It is also the answer that cannot be undone later: everything
the platform gives for free to whatever is in `document.activeElement` — screen
reader announcements, `:focus-visible`, native form and control behaviour, browser
extensions, `Tab` interop, the caret — is given to the real focused element, not to
the element a library has painted. A project that starts virtual and wants those
back has to rebuild each of them by hand, and cannot rebuild the ones that live
outside the page.

standarnav is meant to run on ordinary web pages as well as on televisions
([ADR-0007](0007-navigation-modes.md)), and its declarative surface is meant to work
on markup the application does not own ([ADR-0006](0006-declarative-first.md)). Both
only hold if "focused" means the same thing to the library and to the browser. The
extracted engine already works this way; this ADR records the choice as a contract,
so that it survives refactors.

## Decision

The engine moves the real DOM focus, and only the real DOM focus.

- Moving focus is `element.focus({ preventScroll: true })`, through a single
  helper (`focusElement`, `src/tabbable.ts:113-120`, which defaults
  `preventScroll` to `true`).
- Reading focus is `document.activeElement`, narrowed to `HTMLElement`. The engine
  keeps no authoritative copy. The one element reference it holds only strips the
  styling attribute from the element that had focus before.
- `preventScroll: true` is part of the contract: the engine scrolls the element
  into view itself, after the focus call, so that a container can ask for
  `center` instead of the browser's `nearest`.
- Per-container memory stores a reference to a previously focused **element**, not
  an id or a key — a `WeakRef` where the runtime has one and a self-releasing
  strong reference where it does not ([ADR-0013](0013-browser-baseline-and-fallbacks.md);
  `src/spatial/spatial.ts:113-141`). It is a hint for re-entry, never a source of
  truth: the engine re-checks that the remembered element is still contained and
  still focusable before landing on it (`contains` and `isFocusable`,
  `src/spatial/spatial.ts:345`).
- The attributes the engine writes (`data-snav-focused` on the focused element,
  `data-snav-active` on every container on the path) are styling hooks that
  mirror the real focus. They are never read back as state.
- There is no focus registry: no `Map<string, HTMLElement>`, no node tree keyed by
  string, no "focus key" in the public API.

Consequence for the public surface: the library has no `getFocusedKey()` and no
`setFocus(key)`. The equivalent is `document.activeElement`, and
`spatial.focus(target)` takes an element or a CSS selector.

## Consequences

- Accessibility, `:focus-visible`, form behaviour, extensions and `Tab` interop are
  inherited rather than reimplemented.
- The focus ring can be a pure CSS concern keyed off `:focus-visible` and
  `data-snav-focused`; the optional overlay listens to `focusin`, which is a real
  browser event.
- Only elements the platform can focus are reachable. An element that is not in
  `FOCUSABLE_SELECTOR`, or that fails the visibility and `inert` checks, is not a
  candidate — a `<div>` with no `tabindex` is invisible to the engine. Authors make
  things navigable by making them focusable, which is the same thing they must do
  for keyboard users. The exact focusability contract, including the deliberate
  choices about `aria-disabled` and `aria-hidden`, is recorded in
  [ADR-0009](0009-hidden-candidates.md); the light-DOM-only boundary is in
  [ADR-0008](0008-shadow-dom.md).
- Focus moves are observable from outside, so tests assert a browser fact.
- Cost: every move queries and measures live DOM, and a focus call can trigger
  scrolling, focus events and framework effects the library does not control. The
  `onWillMove` veto exists for that, and it runs before the focus call
  (the `onWillMove` block of `commit()`, `src/spatial/spatial.ts:312-327`; the
  `focusElement` call is `:329`, after it).
- Cost: the engine cannot move focus into a closed shadow root or a cross-origin
  iframe, because `focus()` cannot either — see [ADR-0008](0008-shadow-dom.md).

## Gate

Two checks keep this ADR true, and both must exist before v1. First, a browser test
that asserts `document.activeElement === expectedElement` after every simulated
move; asserting a class name, an attribute or a library getter does not satisfy the
gate. Second, a source-level check that no id-keyed focus store — a
`Map<string, HTMLElement>` or equivalent — exists in `src/`.

**Status, 2026-09-20.** The first is written and running. The spatial browser suite
reads `document.activeElement` through its scene helper on every move assertion
(`src/spatial/spatial.browser.test.ts`), as does the composition suite
(`src/composition.browser.test.ts`), and nothing in either asserts a class, an
attribute or a getter in place of it. `bun run test:browser` on 2026-09-20 → 185
passed and 1 skipped in 11 files; the skip is the shadow-DOM fixture of
[ADR-0008](0008-shadow-dom.md) and is unrelated to this gate.

The second is **not** written. There is no automated check for an id-keyed focus
store; what exists is a reading of this repository: `grep -rn "Map<string" src/`
returns one hit, `src/gamepad/gamepad.ts:153`, which is
`new Map<string, ButtonOverrides>()` — the per-pad remap table of `setMapping`,
keyed by `Gamepad.id`, holding button overrides and no element. No focus store
exists. A reading is not a gate, and turning it into one before v1 is still the
work item this section describes; it is listed with the rest in
[ADR-0018](0018-testing-strategy.md).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Virtual focus (library-owned key or node) | Loses screen reader, `:focus-visible`, form and extension behaviour, and cannot give them back. Requires every consumer to render the focused state themselves. |
| Hybrid: virtual by default, real DOM focus behind an option | Two behaviours to test, two accessibility stories to document, and the default is the wrong one. Norigin ships this shape; standarnav does not need the virtual half. |
| Compute the next element, let the application call `focus()` | What `@bbc/tv-lrud-spatial` does. It keeps the engine small, but focus memory, `data-snav-active` path marking, scroll-into-view and the `onWillMove` veto all need to sit on the same side of the call. |

Note on differentiation: real DOM focus is **not** a unique property, and no
document of this repository may claim it is. Twenty fact sheets were built on
2026-09-18 and describe 18 distinct projects, because the WICG polyfill and
`js-spatial-navigation` were each sheeted twice ([competitor
comparison](../research/competitors.md)). These move or read real DOM focus:
`@bbc/tv-lrud-spatial` (returns the element, the application focuses it), the WICG
`spatial-navigation-polyfill`, `js-spatial-navigation`, Tabster, Enact Spotlight,
`@salutejs/spatial`, `@sberdevices/spatial-navigation`, `@arrow-navigation/core`,
`@gauntface/dpad-nav`, `react-js-spatial-navigation`, and the CSS Spatial Navigation
Level 1 draft. Norigin is virtual by default with a real-focus option. These are
virtual: `lrud` (BBC, archived), `react-tv-space-navigation` (bamlab),
`@please/lrud`, `react-sunbeam`, and `vue-spatialnavigation` is mostly virtual.
`naviix` keeps no focus state at all, real or virtual: it returns a neighbour map
and the application applies it. The differentiator claimed elsewhere in this
repository is the combination (gamepad polling, intent bus, declarative attributes,
modes), not this decision alone.

## Evidence

- `focusElement` is the single focus call, and defaults `preventScroll` to `true`:
  `src/tabbable.ts:113-120`.
- The focusable predicate the engine uses is `isFocusable` (`src/tabbable.ts:56-63`), which
  delegates the visibility question to `isHidden` (`:41-50`, the `checkVisibility` test with its
  `offsetParent` and `getClientRects` fallback) and the `inert` question to `isInert` (`:52-54`,
  a `closest("[inert]")` walk). `aria-disabled` stays focusable on purpose, and the comment
  saying why is at `:60-61`.
- `commit()` is veto, then focus, then remember, then scroll into view:
  `src/spatial/spatial.ts:308-333` — the `onWillMove` block at `:312-327`, the `focusElement`
  call at `:329`, `remember()` at `:330`, `scrollFocusIntoView()` at `:331`.
- The focus query reads the document, not a stored field: `activeElement()` returns
  `doc()?.activeElement` narrowed by `isHTMLElement` (`src/spatial/spatial.ts:271-274`). The one
  `focused` field (`:259`) is written only by `remember()` (`:276-292`), which uses it to strip
  the styling attribute from the element that had focus before.
- Container memory is a `WeakMap<HTMLElement, ElementHandle>` of elements, not of keys:
  `src/spatial/spatial.ts:248`, filled by `remember()` at `:286`. The handle is a `WeakRef` where
  the runtime has one and a self-releasing strong reference where it does not (`elementHandle`,
  `:127-141`). Re-entry re-validates the remembered element with `contains` and `isFocusable`
  at `:345`.
- Everything the engine focuses is reached through real nodes: `queryAll`
  (`src/dom/query.ts:10-15`) is how `getFocusables` collects candidates, `getEventTarget`
  (`:45-48`) reads `composedPath()[0]` rather than the retargeted `event.target`, and `contains`
  (`:24-39`) is the shadow-aware containment seam [ADR-0008](0008-shadow-dom.md) reserves and
  nothing calls in v0. None of them holds focus state.
- No focus registry: `grep -rn "Map<string" src/` returns one hit, the per-pad remap table at
  `src/gamepad/gamepad.ts:153`, which holds button overrides and no element.
- The design intent predates this package: the principle that a gamepad drives real DOM focus
  with roving tabindex, never a virtual focus keyed by id, because screen reader accessibility
  and native interoperability with `:focus`, forms and extensions come free that way. That
  principle is inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here; what this repository can
  show for it is the code cited above.
- Competitor focus models: the focus-model column of the fact sheets, each verified against the
  competitor's own source. The committed table is
  [competitor comparison](../research/competitors.md).
