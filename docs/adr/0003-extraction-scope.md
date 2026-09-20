# ADR-0003: Extraction scope and boundary with the miralabs-ui core

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

standarnav is not written from scratch. It is the extraction of an input and
navigation engine that already runs inside the design system miralabs-ui, in
`packages/core/src/input/`. That engine is headless: it turns keyboard, remote,
gamepad and pointer events into intents, and it moves real DOM focus.

The design system around it is not headless. It ships components, state
machines, SCSS and a React environment context. If the extraction takes too
much, standarnav inherits a design system. If it takes too little, the package
does not run without miralabs-ui. This ADR fixes the cut line.

Two facts from the source decide where the line falls:

- `input/spatial/spatial.ts` imports from outside `input/` only DOM helpers and
  types, never a component or a machine.
- `input/input-system.ts` imports `interaction/modality` and `utils/invariant`
  from outside `input/`, and nothing else.

So the directory is already close to a standalone package. What it misses is a
small runtime closure of helpers that live one level up.

## Decision

**1. The whole of `packages/core/src/input/` moves.** Measured with
`find input -name "*.ts" -not -name "*.test.ts" -not -name "*.bench.ts" | xargs wc -l`
in miralabs-ui on 2026-09-18 (raw counts, header comment blocks included):

| Source file | Lines | Destination in standarnav |
|---|---|---|
| `input/intent-bus.ts` | 148 | `src/intent-bus.ts` |
| `input/input-system.ts` | 219 | `src/input-system.ts` |
| `input/keymap.ts` | 190 | `src/keymap.ts` |
| `input/engage.ts` | 80 | `src/engage.ts` |
| `input/gamepad/gamepad.ts` | 450 | `src/gamepad/gamepad.ts` |
| `input/gamepad/mapping.ts` | 91 | `src/gamepad/mapping.ts` |
| `input/gamepad/dead-zone.ts` | 95 | `src/gamepad/dead-zone.ts` |
| `input/gamepad/repeat.ts` | 63 | `src/gamepad/repeat.ts` |
| `input/spatial/spatial.ts` | 508 | `src/spatial/spatial.ts` |
| `input/spatial/geometry.ts` | 278 | `src/spatial/geometry.ts` |
| `input/spatial/containers.ts` | 46 | `src/spatial/containers.ts` |
| `input/spatial/debug.ts` | 73 | `src/debug.ts` |
| `input/focus-ring/focus-ring.ts` | 254 | `src/focus-ring/focus-ring.ts` |
| **Total** | **2495** | |

**2. A closure from outside `input/` is embedded, not re-implemented.**
Measured with `wc -l` on each file, same directory, 2026-09-18:

| Source file | Lines | Destination | Why it must come along |
|---|---|---|---|
| `interaction/modality.ts` | 180 | `src/modality.ts` | `input-system.ts` calls `trackInputModality`, `getInputModality`, `setInputModality` |
| `focus/tabbable.ts` | 113 | `src/tabbable.ts` | `spatial.ts` calls `focusElement`, `getFocusables`, `isFocusable` |
| `dom/event.ts` | 36 | `src/dom/event.ts` | `addDomEvent`, `isComposingEvent` |
| `dom/query.ts` | 54 | `src/dom/query.ts` | `isHTMLElement` (`spatial.ts`), `getEventTarget` (`input-system.ts:147`); the rest of the file is unused by `input/` and can be trimmed |
| `dom/raf.ts` | 40 | `src/dom/raf.ts` | `raf`, used by the scroll-and-rescan path |
| `dom/platform.ts` | 59 | `src/dom/platform.ts` | `prefersReducedMotion` |
| `types.ts` (five input types) | 72 (whole file) | `src/types.ts` | `Rect`, `IntentEvent`, `NavigationIntent`, `IntentSource`, `InputModality` |
| `utils/invariant.ts` | 11 | not extracted — see the amendment below | assertion messages, prefix to be rewritten |

Only the five listed types move out of `types.ts`; the rest of that file is
design-system typing and stays. `invariant` messages are prefixed `[miralabs]`
in the source and must be renamed on arrival — which in the end meant dropping
the module and inlining its one use, as the amendment below records.

**3. What stays in miralabs-ui.** Focus trap, roving focus, proxy tab focus, all
components and their state machines, all SCSS, and the React `environment`
context that provides `useDocument()`. The React adapter
`packages/react/src/input.tsx` (209 lines, `wc -l`, 2026-09-18) is
re-implemented here without that context dependency, as `src/react/*.tsx`.

**4. Planned `src/` layout.**

```
src/  intent-bus.ts  input-system.ts  keymap.ts  engage.ts
      modality.ts  tabbable.ts  types.ts  invariant.ts  debug.ts
      dom/         event.ts  query.ts  raf.ts  platform.ts
      gamepad/     gamepad.ts  mapping.ts  dead-zone.ts  repeat.ts
      spatial/     spatial.ts  geometry.ts  containers.ts
      focus-ring/  focus-ring.ts
      react/       *.tsx
```

The planned subpath exports of `@standarx/nav` map onto this layout directly —
see [ADR-0011](0011-package-layout-and-adapters.md).

**Amended 2026-09-20: what was actually built.** The move happened and the layout
above is right in every directory. Four differences, all in the loose files at
the top:

```
src/  index.ts  intent-bus.ts  input-system.ts  keymap.ts  engage.ts
      modality.ts  tabbable.ts  types.ts  debug.ts  adapter-parity.ts
      internal/    env.ts  equality.ts
      dom/         event.ts  query.ts  raf.ts  platform.ts
      gamepad/     gamepad.ts  mapping.ts  dead-zone.ts  repeat.ts
      spatial/     spatial.ts  geometry.ts  containers.ts
      focus-ring/  focus-ring.ts
      react/       react.tsx  react-harness.tsx  use-safe-layout-effect.ts
```

- **`index.ts` is a file the planned layout never named.** The plan listed the
  modules and left the root unspoken; the build needs one. It is the first entry
  of `tsdown.config.ts:8` and the target of the `.` export
  (`package.json:33`), it is the module the `core` size-budget line measures
  ([ADR-0017](0017-size-budgets.md)), and its header states why the three engines
  are *not* re-exported from it: Node's ESM runtime does no tree-shaking, so a
  root re-export would make every consumer of `createInputSystem` fetch and
  execute the gamepad, spatial and focus-ring graphs (`src/index.ts:1-11`).
- **`invariant.ts` does not exist.** Decision 2 brought it over to have its
  `[miralabs]` prefix rewritten; instead the single assertion that needed it was
  inlined at its one call site (`src/input-system.ts:94`) and the module was
  dropped. The message is unprefixed and a test pins that it stays so
  (`src/input-system.test.ts:5-12`, which asserts the thrown message and then
  asserts it does not start with a bracket). Eleven lines of helper for one throw
  is a module that exists to be imported once.
- **`internal/` holds two helpers the source had nowhere.** `env.ts` is an
  `isDev()` that declares `process` locally rather than pulling `@types/node`, so
  the package stays usable in a browser with no bundler; `equality.ts` holds
  `arrayEquals` and `recordEquals`. Both exist for the React adapter's effect
  dependencies and are charged to its size-budget line, not to the core
  ([ADR-0017](0017-size-budgets.md)).
- **`react/` is not all `.tsx`.** `use-safe-layout-effect.ts` carries no JSX, and
  `react-harness.tsx` is the adapter's test harness rather than published code —
  only `react.tsx` is an entry (`tsdown.config.ts:13`).

One file is new and belongs to no source module: `src/adapter-parity.ts`, the
shared adapter suite each adapter must pass
([ADR-0018](0018-testing-strategy.md), decision 5). All read 2026-09-20.

**5. The boundary rule.** The engine never depends on a component, a state
machine, a style sheet or a design-system context. Dependencies point one way:
miralabs-ui depends on `@standarx/nav`; `@standarx/nav` imports nothing from
miralabs-ui. A pull request that adds such an import is rejected.
[ADR-0004](0004-relationship-with-miralabs-ui.md) covers the consumer side.

## Consequences

- The package is self-contained: the embedded closure is 565 lines of helpers
  by the `wc -l` above — counting the whole of `types.ts`, of which only five
  types are needed — on top of 2495 lines of engine.
- `modality.ts` arrives with its contract intact: a per-document ref-counted
  singleton. Two copies of it in one page would fight over the attribute on
  `<html>`, which is one more reason the engine must exist once, not twice.
- `focus-ring` moved without its styling. Its colours, width, radius and
  z-index came from `packages/styles/scss/components/_focus-ring.scss`, which
  stays in miralabs-ui, and shipping the plugin with no default tokens would
  have produced an invisible ring. Settled 2026-09-20: the plugin paints itself
  inline, six `--snav-focus-ring-*` custom properties override every value, and
  **no stylesheet ships** — the decision and its measured contrast figures are in
  [ADR-0004](0004-relationship-with-miralabs-ui.md).
- Duplicated helper logic is now possible: miralabs-ui keeps its own
  `dom/query.ts` and `focus/tabbable.ts` for the components that still need
  them. That duplication is accepted.
- The attribute rename `data-mira-nav-*` → `data-snav-*`
  ([ADR-0001](0001-name-scope-and-attribute-prefix.md)) happens during the
  move, so the two sources diverge textually from day one.

## Alternatives considered

- **Move `input/` only, and re-implement the helpers.** Rejected: the closure
  in the table above (565 lines, `wc -l`, 2026-09-18) holds the visibility
  fallback, the IME guards and the modality anti-flicker rule. Rewriting them
  from memory adds a bug surface for no gain.
- **Extract only `spatial/` and `gamepad/`, leave intent bus and keymap
  behind.** Rejected: both engines are `InputPlugin`s of `input-system.ts`;
  without the bus they have no scope stack, no keyboard source, no remote key
  table.
- **Extract the components too, and ship a TV UI kit.** Rejected: out of scope,
  and it competes with miralabs-ui instead of serving it.
- **Depend on miralabs-ui for the helper closure.** Rejected: it inverts the
  dependency and drags a design system into a headless package.

## Evidence

- Import list of `packages/core/src/input/spatial/spatial.ts:14-41`
  (read 2026-09-18): `dom/event`, `dom/platform`, `dom/query`, `dom/raf`,
  `focus/tabbable`, `types` (type-only), `input-system` (type-only:
  `InputPlugin`, `InputPluginContext`), then local `./containers` and
  `./geometry`. No component, no machine, no style import.
- Import list of `packages/core/src/input/input-system.ts:13-32`
  (read 2026-09-18): `dom/event`, `dom/query`, `interaction/modality`,
  `types` (type-only), `utils/invariant`, then local `./intent-bus` and
  `./keymap`.
- Line counts: `find input -name "*.ts" -not -name "*.test.ts" -not -name
  "*.bench.ts" | sort | xargs wc -l` and `wc -l interaction/modality.ts
  focus/tabbable.ts dom/event.ts dom/query.ts dom/raf.ts dom/platform.ts
  types.ts utils/invariant.ts`, both run in
  `miralabs-ui/packages/core/src` on 2026-09-18.
- Source repository: miralabs-ui at commit `289fa607`, read-only, 2026-09-18.
- Light-DOM-only scope stated in `packages/core/src/focus/tabbable.ts:10-11`.
