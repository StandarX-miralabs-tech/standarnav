# ADR-0008: Light DOM only in v0 (shadow DOM is a non-goal)

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The engine finds its candidates with `querySelectorAll`. `getFocusables` calls `queryAll`
(`src/tabbable.ts:102-109`), `queryAll` is one `root.querySelectorAll(selector)`
(`src/dom/query.ts:10-15`), and `collectNavNodes` builds every move from that list
(`src/spatial/spatial.ts:170`). `querySelectorAll` does not cross a shadow boundary, so nothing
inside a shadow root is ever a candidate.

That is a choice, not an oversight. The header of the focus module states it and gives the reason:
piercing shadow roots "would mean walking every open root on every move, and the callers that need
it can pass their own root" (`src/tabbable.ts:10-12`).

The package is not naive about shadow trees elsewhere. `contains` (`src/dom/query.ts:24-39`) is
shadow-aware: it walks `getRootNode()` and hosts, written so that a popover rendered inside a web
component does not read as "outside" its own trigger. `getEventTarget` (`src/dom/query.ts:45-48`)
reads `composedPath()[0]` rather than `event.target`, because the browser retargets `target` to the
host. Neither is used by the spatial engine: `src/spatial/spatial.ts:16` imports only
`isHTMLElement` from that module, and both `containerOf` (`src/spatial/spatial.ts:148-151`) and the
root guard in `move` (`src/spatial/spatial.ts:488`) use `Node.contains`, which stops at the
boundary. The event path knows about shadow DOM; the candidate scan does not.

What that produces, asserted by one fixture that ships skipped:

| Case | Behaviour in v0 |
|---|---|
| `<my-widget tabindex="0">` with a shadow root | Navigable as one node: the host matches `[tabindex]` in `FOCUSABLE_SELECTOR` (`src/tabbable.ts:38`) and is scored on its own rect (`src/spatial/spatial.ts:182-188`). |
| Buttons inside that shadow root | Invisible to the scan. No move can reach them. |
| Focus already inside an open shadow root | `document.activeElement` retargets to the host, so `activeElement()` (`src/spatial/spatial.ts:271-274`) sees the host and moves from the host rect. |
| Closed shadow root | Same as above, with no escape hatch at all. |

The other libraries are in the same position, with one exception. Twenty competitor fact sheets were
built and adversarially re-verified (eighteen distinct projects, two pairs being the same project
under two names; method in [docs/research/competitors.md](../research/competitors.md)). Their
`shadow_dom` field records either "not supported" or no occurrence of `shadowRoot` / `attachShadow`
in each project's source, for every entry but Tabster, which carries an opt-in `Shadowdomize` module
in its own repository. That field is not one of the columns the published table carries, so the
comparison above is a survey finding: checkable against each surveyed project's published source,
and against nothing in this repository. The WICG spatial-navigation material documents the same gap
for itself: isolated frames such as `iframe` and shadow DOM are outside what an author can control.

## Decision

1. v0 of `@standarx/nav` does not traverse shadow roots. Candidate collection stays a
   `querySelectorAll` over the light DOM.
2. The escape hatch is an explicit root: a component that owns a shadow tree runs the engine on that
   tree, or declares its host as a single navigable node. This requires widening the accepted root
   type, which is a v0 task and not a promise of traversal: `SpatialPluginOptions.root` is
   `HTMLElement | null | undefined` today (`src/spatial/spatial.ts:80`) and `getFocusables` accepts
   `HTMLElement | Document` (`src/tabbable.ts:102-105`), while a `ShadowRoot` is a `DocumentFragment`.
   `queryAll` already accepts `ParentNode` (`src/dom/query.ts:10-14`), so the change is in the public
   types of `src/spatial/spatial.ts` and `src/tabbable.ts`, not in the scan.
3. Event-path code keeps `composedPath()` (`src/dom/query.ts`). Retargeting bugs are not the same
   problem as traversal, and the fix already exists.
4. The README states the limitation in the "Make your element navigable" section: applications built
   on web components are out of scope until the v1+ path below ships.
5. The evolution path is written down now, with one fixture that fails today, so the cost is known
   before anyone commits to it:

| Step | Mechanism | Planned location |
|---|---|---|
| Find the roots | Walk from the scan root, collecting `element.shadowRoot` where it is non-null | `src/dom/query.ts` |
| Scan each root | One `querySelectorAll` per open root, results concatenated in document order | `src/tabbable.ts` |
| Keep containment right | Replace `Node.contains` with the existing shadow-aware `contains` in the spatial hot path | `src/spatial/spatial.ts` |
| Keep the active element right | Resolve `document.activeElement` through `shadowRoot.activeElement` chains | `src/spatial/spatial.ts` |
| Prove it | A fixture with a host, an open root and two buttons, asserting a move from outside lands inside | `src/spatial/spatial.browser.test.ts` |

The fixture ships in v0 as a skipped, documented failure. It is the acceptance test of any future
attempt, and it stops the feature being declared done by inspection. It is written:
`src/spatial/spatial.browser.test.ts:920-942`.

## Consequences

- The hot path stays one `querySelectorAll` per container walk. No per-root loop, no traversal cache
  to invalidate on mutation.
- The depth bound `MAX_CONTAINER_DEPTH = 16` (`src/spatial/spatial.ts:60`) keeps
  its current meaning: container nesting, not tree nesting. Adding roots would add a second,
  independent depth to reason about.
- Applications built on web components cannot use the spatial engine for controls inside a shadow
  tree. They can still make each host a node, which is enough for a card grid and not enough for a
  form.
- Anyone who needs it today runs one engine instance per shadow tree and accepts that moves do not
  cross between them.
- The shadow-aware `contains` stays unused by the spatial engine, and it is still not dead code. The
  callers that need shadow-aware containment are the overlay behaviours — a focus trap, a
  dismiss-on-outside-press layer, and the dialog, menu, select, popover and listbox widgets built on
  them — and none of those ships here: they are inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, so nothing under `src/`
  exercises `contains` in v0 beyond its own unit cases. That is recorded here so the next reader
  does not "fix" it by wiring it into the hot path without the rest of the work, and so that nobody
  deletes it as unreachable: its own header says the same (`src/dom/query.ts:17-23`).
- A component that passes its own root gets no shared focus memory with the outer engine: the memory
  is a `WeakMap` per plugin instance (`src/spatial/spatial.ts:248`).

## Amendment, 2026-09-20: what the extracted code actually does, and the inconsistency it carries

The Context above was written while the decision was still a plan. The engine now exists here and
the decision holds exactly as written — but one detail of it deserves to be stated as a decision
rather than left for a reader to discover, because it is a deliberate inconsistency inside one
module.

**What v0 does.** `getFocusables` collects candidates through `queryAll`, which is one
`root.querySelectorAll(selector)` (`src/dom/query.ts:10-15`), called from `src/tabbable.ts:102-109`.
`querySelectorAll` does not cross a shadow boundary, so nothing inside a shadow root is ever a
candidate. `collectNavNodes` builds every move from that list (`src/spatial/spatial.ts:170`), and
`containerOf` (`src/spatial/spatial.ts:148-151`) and the root guard in `move`
(`src/spatial/spatial.ts:488`) use `Node.contains`, which stops at the same boundary. A host
carrying `tabindex` is navigable as one node, because `[tabindex]` is in `FOCUSABLE_SELECTOR`
(`src/tabbable.ts:38`). Everything inside its root is unreachable.

**The two answers disagree, on purpose.** The same module exports `contains`
(`src/dom/query.ts:24-39`), which *does* traverse: it walks `getRootNode()` and hosts so that a
subtree rendered inside a web component does not read as "outside" its own host. Nothing in the
engine calls it — the only call sites at HEAD are its own four assertions in
`src/dom/dom.browser.test.ts:53-56` (`grep -rn "contains(" src/`). So
`getFocusables` says a shadow child is not there and `contains` says it is, and both are correct
about the question they are answering.

That inconsistency is **accepted for v0** and is not a defect to file. Making `contains` stop at
the boundary would throw away the one piece of the shadow path that is already written and already
right; making `getFocusables` traverse is the v1 feature, with the per-root walk, the active-element
resolution and the depth question that come with it. Leaving them as they are costs nothing at
runtime, because the traversing one is never called.

**It is tracked by a fixture, not by a comment.** `src/spatial/spatial.browser.test.ts:921` is
`it.skip("steers into an open shadow root (ADR-0008: light DOM only in v0)")`: a host with an open
root and a button inside it, asserting that a move from outside lands on the button. It is the one
skipped test in the suite (`bun run test:browser` → 257 passed, 1 skipped in 13 files),
and its comment names this ADR and this disagreement as the reason it is skipped.

**Which way v1 resolves it.** Towards traversal, not away from it: `getFocusables` gains the
per-root scan and `Node.contains` in the spatial hot path is replaced by the shadow-aware
`contains` that already exists, which is steps 2 and 3 of the evolution table above. The fixture
above is what unskips. The opposite resolution — narrowing `contains` to match the scan — is
explicitly not the plan, and this paragraph exists so that nobody takes it as the cheap fix.

## Alternatives considered

**Pierce every open root on every move.** Rejected for v0. It turns one selector query into a walk of
the whole tree, on every Tab and every d-pad press, on runtimes whose supported tier starts at
Chromium 85 — the engine of the 2022 TV firmwares Tizen 6.5 and webOS 22 (baseline decided in
[ADR-0013](0013-browser-baseline-and-fallbacks.md); runtime-to-Chromium mapping in
[docs/research/tv-runtime-compatibility.md](../research/tv-runtime-compatibility.md), compiled from
the published Samsung and LG engine tables). The only surveyed implementation that does it, Tabster,
needed a dedicated subsystem for it — a `Shadowdomize` module in its own repository: a tree walker,
a mutation observer and its own `querySelector` — which is a fair estimate of the real cost, read
from that project's published source and not from anything here. Nothing in the extraction scope
([ADR-0003](0003-package-boundaries.md)) justifies paying it before v1.

**Slot-based or explicit registration.** Each component registers its focusables with the engine, so
the engine never has to walk anything. Rejected: it gives up the declarative, attribute-driven model
(`data-snav-*` on plain HTML) for the exact components that would use it, adds a
registry whose entries can go stale, and still does not answer closed roots. It would also make the
engine imperative for web components and declarative for everything else, which is two products.

**Do nothing and say nothing.** Rejected on the documentation rule: a limitation that is not written
down is discovered by a user, not by a reader, and support questions about unreachable elements are
already the expected first one ([ADR-0010](0010-dev-mode-diagnostics.md)).

## Evidence

- `src/tabbable.ts:10-12` — the module header stating light-DOM only, with its reason, and pointing
  here.
- `src/tabbable.ts:18-39` — `FOCUSABLE_SELECTOR`, including `[tabindex]` at `:38`, which is why a
  host with `tabindex` is already a node.
- `src/tabbable.ts:102-109` — `getFocusables` over `queryAll`.
- `src/dom/query.ts:10-15` — `queryAll` is one `querySelectorAll`, typed on `ParentNode`.
- `src/dom/query.ts:24-39` — the shadow-aware `contains`, present and unused by the spatial engine,
  with the header that says so at `:17-23`.
- `src/dom/query.ts:45-48` — `getEventTarget`, `composedPath()[0]` for event targets.
- `src/spatial/spatial.ts:16` — the spatial engine imports only `isHTMLElement` from `dom/query`.
- `src/spatial/spatial.ts:148-151` (`containerOf`) and `:488` (the root guard in `move`) —
  `Node.contains` in the containment checks.
- `src/spatial/spatial.ts:170` — `collectNavNodes`, the whole candidate list; `:182-188`, the rect a
  node is scored on.
- `src/spatial/spatial.ts:80` — `root`, typed `HTMLElement | null | undefined`; `:271-274`,
  `activeElement()`; `:60`, `MAX_CONTAINER_DEPTH`; `:248`, the focus memory `WeakMap`.
- Only call sites of the shadow-aware `contains` at HEAD: `src/dom/dom.browser.test.ts:53-56`
  (`grep -rn "contains(" src/` — every other hit is `Node.contains`).
- The skipped fixture: `src/spatial/spatial.browser.test.ts:920-942`, one `it.skip` at `:921`
  naming this ADR. `bun run test:browser` → 496 passed, 1 skipped in 18 files; that skip is this
  one, and it is the only one in the repository.
- Shadow-DOM field of the 20 competitor fact sheets, adversarially verified; the `Shadowdomize`
  module in Tabster's own repository, and its README statement, are the single "supported, opt-in"
  entry. The published comparison table ([docs/research/competitors.md](../research/competitors.md))
  carries the survey's method and its eighteen rows, but no shadow-DOM column, so this one field is a
  survey finding: it is checkable against each surveyed project's published source, and against
  nothing in this repository.
- Retargeting of `document.activeElement` to the shadow host is standard behaviour, not measured here:
  to be confirmed by the skipped fixture above before any documentation page states it as fact.
- The overlay behaviours that call the shadow-aware `contains` — focus trap, dismiss-on-outside-press,
  and the widgets built on them — are inherited from the predecessor implementation
  ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, so no line of this repository
  can be cited for them.
