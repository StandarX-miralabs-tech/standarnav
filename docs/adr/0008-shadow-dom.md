# ADR-0008: Light DOM only in v0 (shadow DOM is a non-goal)

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The engine finds its candidates with `querySelectorAll`. `getFocusables` calls `queryAll`
(`packages/core/src/focus/tabbable.ts:65-72`), `queryAll` is one `root.querySelectorAll(selector)`
(`packages/core/src/dom/query.ts:17-22`), and `collectNavNodes` builds every move from that list
(`packages/core/src/input/spatial/spatial.ts:128-146`). `querySelectorAll` does not cross a shadow
boundary, so nothing inside a shadow root is ever a candidate.

That is a choice, not an oversight. The header of the focus module states it and gives the reason:
piercing shadow roots "would mean walking every open root on every Tab, and the components that need
it can pass their own root" (`packages/core/src/focus/tabbable.ts:10-11`).

The same codebase is not naive about shadow trees elsewhere. `dom/query.ts:29-44` implements a
shadow-aware `contains` that walks `getRootNode()` and hosts, written so that a popover rendered
inside a web component does not read as "outside" its own trigger. `dom/query.ts:46-54` reads
`composedPath()[0]` rather than `event.target`, because the browser retargets `target` to the host.
Neither is used by the spatial engine: `spatial.ts:16` imports only `isHTMLElement` from that module,
and both `containerOf` (`spatial.ts:105-108`) and the root guard in `move` (`spatial.ts:358`) use
`Node.contains`, which stops at the boundary. The event path knows about shadow DOM; the candidate
scan does not.

What that produces, read from the source on 2026-09-18 and re-read against this repository's own
code on 2026-09-20 (the amendment below carries the local line numbers), asserted by one fixture
that ships skipped:

| Case | Behaviour in v0 (paths below are miralabs-ui, read before extraction) |
|---|---|
| `<my-widget tabindex="0">` with a shadow root | Navigable as one node: the host matches `[tabindex]` in `FOCUSABLE_SELECTOR` (`tabbable.ts:30`) and is scored on its own rect (`spatial.ts:140-142`). |
| Buttons inside that shadow root | Invisible to the scan. No move can reach them. |
| Focus already inside an open shadow root | `document.activeElement` retargets to the host, so `activeElement()` (`spatial.ts:220-223`) sees the host and moves from the host rect. |
| Closed shadow root | Same as above, with no escape hatch at all. |

The other libraries are in the same position, with one exception. Twenty competitor fact sheets were
built on 2026-09-18 and adversarially re-verified the same day (eighteen distinct projects, two pairs
being the same project under two names; method in
[docs/research/competitors.md](../research/competitors.md)). Their `shadow_dom` field records either
"not supported" or no occurrence of `shadowRoot` / `attachShadow` in the source read, for every entry
but Tabster, which has an opt-in `src/Shadowdomize/` module (shadow-DOM field of the fact sheets,
2026-09-18; published table in [docs/research/competitors.md](../research/competitors.md)). The
WICG spatial-navigation material documents the same gap for itself: isolated frames such as `iframe`
and shadow DOM are outside what an author can control.

## Decision

1. v0 of `@standarx/nav` does not traverse shadow roots. Candidate collection stays a
   `querySelectorAll` over the light DOM.
2. The escape hatch is an explicit root: a component that owns a shadow tree runs the engine on that
   tree, or declares its host as a single navigable node. This requires widening the accepted root
   type, which is a v0 task and not a promise of traversal: `SpatialPluginOptions.root` is
   `HTMLElement | null | undefined` today (`spatial.ts:75`) and `getFocusables` accepts
   `HTMLElement | Document` (`tabbable.ts:65-68`), while a `ShadowRoot` is a `DocumentFragment`.
   `queryAll` already accepts `ParentNode` (`dom/query.ts:17-21`), so the change is in the public
   types of `src/spatial/spatial.ts` and `src/tabbable.ts`, not in the scan.
3. Event-path code keeps `composedPath()` (`src/dom/query.ts`). Retargeting bugs are not the same
   problem as traversal, and the fix already exists.
4. The README states the limitation in the "what this does not do" section: applications built on web
   components are out of scope until the v1+ path below ships.
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
`src/spatial/spatial.browser.test.ts:855-877`.

## Consequences

- The hot path stays one `querySelectorAll` per container walk. No per-root loop, no traversal cache
  to invalidate on mutation.
- The depth bound `MAX_CONTAINER_DEPTH = 16` (`src/spatial/spatial.ts:60`, read 2026-09-20) keeps
  its current meaning: container nesting, not tree nesting. Adding roots would add a second,
  independent depth to reason about.
- Applications built on web components cannot use the spatial engine for controls inside a shadow
  tree. They can still make each host a node, which is enough for a card grid and not enough for a
  form.
- Anyone who needs it today runs one engine instance per shadow tree and accepts that moves do not
  cross between them.
- The shadow-aware `contains` stays unused by the spatial engine. It is not dead code — miralabs-ui
  imports it in `focus/focus-trap.ts:15`, `interaction/dismissable.ts:12` and the dialog, menu,
  select, popover and listbox modules (grep for the import on 2026-09-18) — but nothing in the
  extracted package exercises it in v0 beyond its own unit cases. That is
  recorded here so the next reader does not "fix" it by wiring it into the hot path without the rest
  of the work, and so that nobody deletes it as unreachable: its own header says the same
  (`src/dom/query.ts:17-23`).
- A component that passes its own root gets no shared focus memory with the outer engine: the memory
  is a `WeakMap` per plugin instance (`src/spatial/spatial.ts:248`, read 2026-09-20; miralabs-ui:
  `packages/core/src/input/spatial/spatial.ts:198`).

## Amendment, 2026-09-20: what the extracted code actually does, and the inconsistency it carries

The Context above reads the source repository. The engine now exists here, and the decision holds
exactly as written — but one detail of it deserves to be stated as a decision rather than left for
a reader to discover, because it is a deliberate inconsistency inside one module.

**What v0 does.** `getFocusables` collects candidates through `queryAll`, which is one
`root.querySelectorAll(selector)` (`src/dom/query.ts:10-15`), called from `src/tabbable.ts:69-76`.
`querySelectorAll` does not cross a shadow boundary, so nothing inside a shadow root is ever a
candidate. `collectNavNodes` builds every move from that list (`src/spatial/spatial.ts:170`), and
`containerOf` (`src/spatial/spatial.ts:148-151`) and the root guard in `move`
(`src/spatial/spatial.ts:410`) use `Node.contains`, which stops at the same boundary. A host
carrying `tabindex` is navigable as one node, because `[tabindex]` is in `FOCUSABLE_SELECTOR`
(`src/tabbable.ts:31`). Everything inside its root is unreachable. All read 2026-09-20.

**The two answers disagree, on purpose.** The same module exports `contains`
(`src/dom/query.ts:24-39`), which *does* traverse: it walks `getRootNode()` and hosts so that a
subtree rendered inside a web component does not read as "outside" its own host. Nothing in the
engine calls it — the only call sites at HEAD are its own four assertions in
`src/dom/dom.browser.test.ts:53-56` (`grep -rn "contains(" src/`, 2026-09-20). So
`getFocusables` says a shadow child is not there and `contains` says it is, and both are correct
about the question they are answering.

That inconsistency is **accepted for v0** and is not a defect to file. Making `contains` stop at
the boundary would throw away the one piece of the shadow path that is already written and already
right; making `getFocusables` traverse is the v1 feature, with the per-root walk, the active-element
resolution and the depth question that come with it. Leaving them as they are costs nothing at
runtime, because the traversing one is never called.

**It is tracked by a fixture, not by a comment.** `src/spatial/spatial.browser.test.ts:856` is
`it.skip("steers into an open shadow root (ADR-0008: light DOM only in v0)")`: a host with an open
root and a button inside it, asserting that a move from outside lands on the button. It is the one
skipped test in the suite (`bun run test:browser`, 2026-09-20 → 169 passed, 1 skipped in 10 files),
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
the Samsung and LG engine tables fetched on 2026-09-18). The only surveyed implementation that does
it, Tabster, needed a dedicated subsystem for it (`src/Shadowdomize/`: a tree walker, a mutation
observer and its own `querySelector`), which is a fair estimate of the real cost. Nothing in the extraction scope
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

- `packages/core/src/focus/tabbable.ts:10-11` — the stated choice, in the source, since before the
  extraction.
- `packages/core/src/focus/tabbable.ts:16-31` — `FOCUSABLE_SELECTOR`, including `[tabindex]`, which is
  why a host with `tabindex` is already a node.
- `packages/core/src/focus/tabbable.ts:65-72` — `getFocusables` over `queryAll`.
- `packages/core/src/dom/query.ts:17-22` — `queryAll` is `querySelectorAll`, typed on `ParentNode`.
- `packages/core/src/dom/query.ts:29-44` — the shadow-aware `contains`, present and unused by the
  spatial engine.
- `packages/core/src/dom/query.ts:46-54` — `composedPath()[0]` for event targets.
- `packages/core/src/input/spatial/spatial.ts:16` — the spatial engine imports only `isHTMLElement`
  from `dom/query`.
- `packages/core/src/input/spatial/spatial.ts:105-108`, `:358` — `Node.contains` in the containment
  checks.
- `packages/core/src/input/spatial/spatial.ts:128-146` — `collectNavNodes`, the whole candidate list.
- `packages/core/src/input/spatial/spatial.ts:75`, `:214-218` — the root option and its default,
  `document.body`.
- All paths above are read-only in the source repository miralabs-ui at commit `289fa607`, read on
  2026-09-18.
- Shadow-DOM field of the 20 competitor fact sheets, adversarially verified on 2026-09-18; Tabster's
  `src/Shadowdomize/` module and its README statement are the single "supported, opt-in" entry.
  Published table: [docs/research/competitors.md](../research/competitors.md).
- Retargeting of `document.activeElement` to the shadow host is standard behaviour, not measured here:
  to be confirmed by the skipped fixture above before any documentation page states it as fact.
- This repository, read 2026-09-20: `src/dom/query.ts:10-15` (`queryAll`, one `querySelectorAll`),
  `:24-39` (the shadow-aware `contains`, with its "nothing calls this in v0" header at `:17-23`),
  `:45-48` (`getEventTarget` through `composedPath()[0]`); `src/tabbable.ts:69-76`
  (`getFocusables` over `queryAll`), `:31` (`[tabindex]` in the selector), `:10-12` (the header
  restating light-DOM only and pointing here); `src/spatial/spatial.ts:16` (the engine imports
  `isHTMLElement` alone from `dom/query`), `:148-151` and `:410` (`Node.contains` in the
  containment checks), `:170` (`collectNavNodes`), `:80` (`root` typed
  `HTMLElement | null | undefined`), `:60` (`MAX_CONTAINER_DEPTH`).
- Only call sites of the shadow-aware `contains` at HEAD: `src/dom/dom.browser.test.ts:53-56`
  (`grep -rn "contains(" src/`, run 2026-09-20 — every other hit is `Node.contains`).
- The skipped fixture: `src/spatial/spatial.browser.test.ts:855-877`, one `it.skip` at `:856`
  naming this ADR. `bun run test:browser`, 2026-09-20 → 169 passed, 1 skipped in 10 files; that
  skip is this one, and it is the only one in the repository.
