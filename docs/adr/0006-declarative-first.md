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
at declaration, and the extracted engine is already built that way:
`packages/core/src/input/spatial/containers.ts` is 46 lines of attribute constants
and pure parsers (miralabs-ui, commit `289fa607`, read 2026-09-18), and the plugin's
own header states the intent.

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
  and nothing else (the equivalent setup in the source repository is
  `miralabs-ui: apps/docs/content/foundations/gamepad.md:27-35`, read 2026-09-18).
- Attribute names become a public contract. Renaming one is a breaking change, so
  the names are **frozen at v1** and documented as API, not as internals. The
  rename from the source prefix `data-mira-nav-*` to `data-snav-*` is the last
  free one, and it is a coordinated breaking change on the miralabs-ui side.
- The engine reads the DOM on every move rather than keeping a cache, which is what
  makes mutated and virtualised trees work without invalidation. That cost is paid
  on every move and is **not measured** for the full path (`collectNavNodes`,
  `getBoundingClientRect`, `querySelectorAll`). The inherited benchmark, miralabs-ui
  `packages/core/src/input/spatial/geometry.bench.ts`, exercised `findBestCandidate`
  alone (read 2026-09-18) and was not ported: `vitest` 5 exports no `bench` function,
  so this repository has no benchmark at all and the only timing gate is the
  median-of-51 guard in `src/spatial/geometry.test.ts:156-177`, which has the same
  blind spot ([ADR-0018](0018-testing-strategy.md), decision 7).
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
  (`src/spatial/spatial.ts:414-418`, read 2026-09-20, and `spatial.focus(target)`
  resolves a selector the same way at `:554`). That is why this ADR is Accepted on
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

- `containers.ts` in full — attribute constants and the three pure parsers, with
  `entryStrategy` falling back to `last` on any unknown value:
  `packages/core/src/input/spatial/containers.ts:1-46` (miralabs-ui, commit
  `289fa607`, read 2026-09-18). Its header states the intent: "Everything a
  container can say about itself is a data attribute, which is what lets
  third-party HTML become navigable without a line of application JavaScript".
- The plugin header repeats it: "Declarative first: a container is
  `data-mira-nav="container"` and everything else is an attribute on it ... The
  imperative surface is for the cases attributes cannot express" —
  `packages/core/src/input/spatial/spatial.ts:9-11`.
- `body` is the default root: `rootOf()` returns `options.root ?? document.body`,
  `packages/core/src/input/spatial/spatial.ts:214-218`; `containerOf()` returns the
  root when no declared container encloses the element, `:105-108`.
- The imperative surface is exactly five members:
  `packages/core/src/input/spatial/spatial.ts:84-91` (interface) and `:486-506`
  (implementation).
- Redirection selectors are resolved on the document:
  `packages/core/src/input/spatial/spatial.ts:362-366`.
- Proof by an existing site: the miralabs-ui documentation site's own chrome —
  sidebar, theme and density controls — is emitted by `@standardoc/kit`, a different
  repository, "as plain anchors and plain buttons with no island and no
  `data-mira-*` attribute of any kind", and a d-pad walks it anyway:
  `miralabs-ui: apps/docs/content/foundations/gamepad.md:14-35` (read 2026-09-18). The same page
  documents the attribute table at lines 57-76.
- The same facts in this repository, read 2026-09-20: `src/spatial/containers.ts`, the attribute
  constants and the pure parsers, `entryStrategy` still falling back to `last` on any unknown
  value; `src/spatial/spatial.ts:89-96`, the imperative surface, still exactly five members —
  `move`, `focus`, `focusFirst`, `onWillMove`, `onBoundsHit`; `:148-151`, `containerOf` returning
  the root when no declared container encloses the element; `:265-269`, `rootOf()` returning
  `options.root ?? document.body`, which is rule 1 above; `:414-417`, redirection selectors
  resolved on `root.ownerDocument`. Covered by `src/spatial/containers.test.ts` and the seventeen
  `describe` blocks of `src/spatial/spatial.browser.test.ts`
  (`grep -c "^describe(" src/spatial/spatial.browser.test.ts` → 17, 2026-09-20).
- Design intent of 2026-08-27, in translation: declarative first, everything is
  driven by data attributes and JavaScript is required only for initialisation and
  advanced cases — `miralabs-ui: docs/research/input.md:142`, a French document
  deleted by commit `289fa607` and readable with
  `git show 289fa607^:docs/research/input.md`; and, at `:212`, third-party
  HTML becomes navigable without a line of JavaScript because registration is
  automatic and declarative.
- Competitor declarativity: the declarative-HTML column of the Norigin, bamlab,
  WICG, css-nav-1, Tabster and `@bbc/tv-lrud-spatial` sheets, verified 2026-09-18.
  Committed table: [competitor comparison](../research/competitors.md).
