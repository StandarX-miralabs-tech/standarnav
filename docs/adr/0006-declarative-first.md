# ADR-0006: Declarative first

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

Once focus is a real DOM fact ([ADR-0005](0005-real-dom-focus.md)), the engine needs
a second input: which parts of the page behave as groups, and how each group behaves
at its edges. Two ways exist to tell it.

The first is registration. The application calls a hook, a component wrapper or an
`addFocusable()` per element, and the library builds a tree from those calls. The
tree is exact, and it only ever contains what the application registered.

The second is declaration. The behaviour is written on the markup as attributes, and
the engine reads the DOM on each move. Nothing registers; anything present on screen
takes part.

The difference is not stylistic. Registration means that markup the application does
not own — a documentation engine's chrome, a CMS fragment, a third-party widget, a
`<dialog>` a library rendered — can never be navigated, because nobody called the
hook for it. Declaration means it can, as long as its elements are focusable, and
the author can refine the result by adding attributes where they matter.

standarnav's value comes from working on pages nobody prepared for it. That points
at declaration, and the engine here is already built that way:
`src/spatial/containers.ts` is forty-seven lines of attribute constants and three
pure parsers — `blocksDirection`, `wrapsDirection` and `entryStrategy` — and the
plugin's own header states the intent (`src/spatial/spatial.ts:9-11`).

## Decision

Containers and their behaviours are **data attributes on the markup**. The
imperative API is the escape hatch, not the entry point.

Read attributes (contract; the `data-snav-` prefix itself is decided in
[ADR-0001](0001-name-scope-and-attribute-prefix.md)):

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-snav="container"` | a container | Scores as one unit from outside; confines movement to its children from inside. |
| `data-snav-enter` | a container | Where to land on entry: `last` (default), `first`, `nearest`. |
| `data-snav-wrap` | a container | Wrap at the edge: `x`, `y`, `both`, or bare for both. |
| `data-snav-block` | a container | Refuse to leave: a space-separated direction list, or bare for every direction. |
| `data-snav-trap` | a container | Movement never leaves, whatever the geometry says. |
| `data-snav-scroll="center"` | a container | Children scroll to centre instead of nearest. |
| `data-snav-ignore` | anything | Focusable, but never a destination. |
| `data-snav-up/down/left/right` | a focusable | A CSS selector that wins outright for that direction. |

Written attributes: `data-snav-focused` on the focused element, `data-snav-active`
on every container on the path down to it. They are output, never input.

Three rules complete the decision.

1. **`body` is the single container when none is declared.** A page with no
   attribute at all is one container whose candidates are its focusable elements.
   No opt-in step, no root component.
2. **Parsers are pure and total.** Every attribute value has a defined meaning,
   including the empty string; an unknown value falls back to the documented
   default rather than throwing. `data-snav-enter="banana"` behaves as `last`.
3. **The imperative API stays small and explicit**: `move(direction)`,
   `focus(target)`, `focusFirst(container?)`, `onWillMove(listener)`,
   `onBoundsHit(listener)`. It exists for what attributes cannot express — a veto
   that depends on application state, a bump animation, programmatic entry after a
   route change — and not as the normal way to describe a layout.

## Consequences

- Third-party markup is navigable with no application code. A page adds a setup of
  four lines — three imports and one `createInputSystem` call with the two plugins —
  and nothing else (the Usage snippet of `README.md`; the playground does the same
  against the unbuilt modules, with the focus ring added, at
  `playground/main.ts:15-29`).
- Attribute names become a public contract. The prefix and the full list of names are
  decided in [ADR-0001](0001-name-scope-and-attribute-prefix.md), and that decision is
  what there is to freeze: the markup is written against those names, so they are
  **frozen at v1** and documented as API, not as internals. Changing one after v1 is a
  breaking change, which under [ADR-0012](0012-versioning-and-release.md) means a major
  version — the freeze is a promise about the versioning, not a claim that the names
  cannot ever move.
- The engine reads the DOM on every move rather than keeping a cache, which is what
  makes mutated and virtualised trees work without invalidation. That cost is paid
  on every move and is **not measured** for the full path (`collectNavNodes`,
  `getBoundingClientRect`, `querySelectorAll`). The benchmark that exercised
  `findBestCandidate` alone is inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here; it was not
  ported, because `vitest` 5 exports no `bench` function. So this repository has no
  benchmark at all, and the only timing gate is the median-of-51 guard in
  `src/spatial/geometry.test.ts:156-177` — 200 candidates, 51 samples, the median
  asserted under a millisecond — which measures the scoring and nothing around it, the
  same blind spot ([ADR-0018](0018-testing-strategy.md), decision 7).
- A vanilla auto-mount helper — one call that reads the attributes already on the
  page and starts the system — is a v1 item. Today that setup is written by hand.
- Framework adapters do not invent a second way to declare things. A React
  component that wants a container renders `data-snav="container"`; there is no
  `<Container>` wrapper in the adapter contract. Adapter order is decided in
  [ADR-0011](0011-package-layout-and-adapters.md), React first.
- Open question, to be decided before v1: **the scope of redirection selectors**.
  `data-snav-up/down/left/right` values are resolved with
  `root.ownerDocument.querySelector(...)` — the whole document, not the plugin's
  configured root. A plugin mounted on a sub-tree can therefore send focus outside
  that sub-tree through an attribute, and two mounted roots can steal from each
  other. Options: resolve within `root`, keep document scope and document it, or
  make it an option. Still not resolved: the behaviour is unchanged at HEAD
  (`src/spatial/spatial.ts:414-418`, and `spatial.focus(target)` resolves a selector
  the same way at `:554`). That is why this ADR is Accepted on
  the principle and this paragraph is flagged as pending.
- The attribute constants themselves stay private to the package: they are read
  from the markup, so the contract is the attribute names of
  [ADR-0001](0001-name-scope-and-attribute-prefix.md) rather than nine exported
  strings a consumer could import and a rename would have to keep working
  ([ADR-0011](0011-package-layout-and-adapters.md)).

## Alternatives considered

| Option | Shape | Why not |
| --- | --- | --- |
| Hook-per-element registration | `useFocusable()` / `addFocusable()` (Norigin) | Nothing that was not registered can be navigated, so third-party markup is out of reach. Also couples the engine to a component lifecycle. |
| JSX wrappers | `SpatialNavigationView` / `SpatialNavigationFocusableView` (bamlab `react-tv-space-navigation`) | Same reachability limit, plus it is framework-bound by construction: there is no vanilla story at all. |
| CSS custom properties | `--spatial-navigation-contain`, `--spatial-navigation-action`, `--spatial-navigation-function` (WICG polyfill and css-nav-1) | Declarative, but the declaration lives in the stylesheet while the structure lives in the markup, and reading it means `getComputedStyle` per element per move. Attributes are readable in DevTools next to the element they describe. |
| JSON in a single attribute | `data-tabster='{"mover":{...}}'` (Tabster) | One attribute instead of the eight above, but the value needs a parser and a schema, is hard to write by hand, and is hard to override per direction. |

An attribute set is also what `@bbc/tv-lrud-spatial` uses (`nav`, `section`,
`.lrud-container`, `data-focus`, `data-block-exit`), so this is a known shape rather
than an invention. See the [competitor comparison](../research/competitors.md).

## Evidence

- `containers.ts` in full — nine attribute constants and the three pure parsers —
  `src/spatial/containers.ts:1-47`. Rule 2 is the parser itself: `entryStrategy` at
  `:41-43` returns `last` for anything that is not `first` or `nearest`, absent and
  empty included, and `src/spatial/containers.test.ts:38-42` asserts exactly that for
  `null` and for `"nonsense"`. `blocksDirection` and `wrapsDirection` are pinned the
  same way, empty string included, at `src/spatial/containers.test.ts:4-36`. The module
  header states the intent: "Everything a container can say about itself is a data
  attribute, which is what lets third-party HTML become navigable without a line of
  application JavaScript" — `src/spatial/containers.ts:2-4`.
- The plugin header repeats it: "Declarative first: a container is
  `data-snav="container"` and everything else is an attribute on it, so plain HTML
  becomes navigable with no application code. The imperative surface is for the cases
  attributes cannot express" — `src/spatial/spatial.ts:9-11`.
- `body` is the default root, which is rule 1: `rootOf()` returns
  `options.root ?? document.body`, `src/spatial/spatial.ts:265-269`; and `containerOf()`
  returns that root when no declared container encloses the element, `:148-151`.
- The imperative surface is exactly five members, and countably so: the
  `SpatialPlugin` interface at `src/spatial/spatial.ts:89-96` declares `move`, `focus`,
  `focusFirst`, `onWillMove` and `onBoundsHit` and nothing else, and the returned object
  at `:547-567` implements those five — `move` and `focusFirst` delegated, the other
  three inline.
- Redirection selectors are resolved on the document rather than on the configured
  root: `src/spatial/spatial.ts:414-418`, and `focus(target)` resolves a string the
  same way at `:550-557`.
- The written attributes are output and never read back as configuration: `remember()`
  clears the stale markers, sets `FOCUSED_ATTRIBUTE` on the element and
  `ACTIVE_ATTRIBUTE` on every container up the path to it —
  `src/spatial/spatial.ts:276-292`. Both tables of the Decision are the published
  contract, and `README.md` carries both under Usage — the attributes read, then the
  five written. That second table has grown since this record was accepted:
  `data-snav-editing` arrived with the on-screen keyboard
  ([ADR-0022](0022-virtual-keyboard.md)), so a reader who remembers four should look
  again.
- Proof that unprepared markup navigates, executable rather than anecdotal: the fixture
  at `src/spatial/spatial.browser.test.ts:62` is "a three by three grid of plain
  buttons, carrying no attributes whatsoever", and the `spatialPlugin — plain HTML`
  block at `:73-88` walks it down, right, down, left and up in
  `it("makes an unannotated grid navigable with no application code")`, asserting
  `document.activeElement` at every step. That a site rendered by a third party was
  walked the same way is inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. The file carries
  seventeen `describe` blocks in all
  (`grep -c "^describe(" src/spatial/spatial.browser.test.ts` → 17).
- The principle itself — declarative first, data attributes driving everything,
  JavaScript needed only for initialisation and the advanced cases, and third-party HTML
  becoming navigable without a line of application code because the declaration sits in
  the markup — is inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. It is adopted,
  not invented on the spot, and it is independently visible in the code this ADR
  governs: `src/spatial/containers.ts:2-4`, `src/spatial/spatial.ts:9-11`, and proven
  executably at `src/spatial/spatial.browser.test.ts:73-88`.
- Competitor declarativity: the declarative-HTML column of the Norigin, bamlab,
  WICG, css-nav-1, Tabster and `@bbc/tv-lrud-spatial` sheets.
  Committed table: [competitor comparison](../research/competitors.md).
