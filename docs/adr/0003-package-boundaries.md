# ADR-0003: Package boundaries and module layout

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

`@standarx/nav` is headless: it turns keyboard, remote, gamepad and pointer events into intents,
and it moves real DOM focus. It ships no component, no state machine and no stylesheet.

That is a boundary, and a boundary only holds if it is written down. A navigation engine sits close
to the widgets it serves, and the pressure is always to reach one module further — a focus trap
here, a roving-focus helper there, a token for the ring. Each step is small and the end of the road
is a design system with an engine inside it, which is the thing this package exists not to be.

## Decision

**1. The dependency rule.** The engine never imports a component, a state machine, a stylesheet or
a framework context. A pull request that adds such an import is rejected. The React adapter is the
one place a framework is named, and it takes what it needs explicitly rather than reading an
ambient context — `NavDocumentProvider` accepts a `Document` or a `() => Document`
(`src/react/react.tsx:51`).

**2. The layout.**

```
src/  index.ts  intent-bus.ts  input-system.ts  keymap.ts  engage.ts
      modality.ts  tabbable.ts  types.ts  debug.ts  adapter-parity.ts
      internal/    env.ts  equality.ts
      dom/         event.ts  query.ts  raf.ts  platform.ts
      gamepad/     gamepad.ts  mapping.ts  dead-zone.ts  repeat.ts
      spatial/     spatial.ts  geometry.ts  containers.ts
      focus-ring/  focus-ring.ts
      react/       react.tsx  react-harness.tsx  use-safe-layout-effect.ts
      keyboard/    keyboard.ts
                   layouts/  qwerty.ts  azerty.ts  alphabetic.ts
```

The subpath exports map onto it directly — [ADR-0011](0011-package-layout-and-adapters.md).
Ten of these files are build entries (`tsdown.config.ts:8-19`); the rest are reached through them.
`keyboard/layouts/` is the one directory whose files are entries without the directory being part
of a subpath name: a consumer writes `@standarx/nav/keyboard/qwerty`
([ADR-0022](0022-virtual-keyboard.md)).

**3. `index.ts` re-exports the core and not the engines.** It is the target of the `.` export
(`package.json:33`) and the module the `core` size-budget line measures
([ADR-0017](0017-size-budgets.md)). The three engines are deliberately absent from it: Node's ESM
runtime does no tree-shaking, so a root re-export would make every consumer of `createInputSystem`
fetch, parse and execute the gamepad, spatial and focus-ring graphs, and `sideEffects: false`
cannot save a runtime that has no bundler (`src/index.ts:1-11`). An application that never mentions
a gamepad pays no bytes for one.

**4. `internal/` is the only private directory.** `env.ts` is an `isDev()` that declares `process`
locally rather than pulling `@types/node`, so the package stays usable in a browser with no bundler;
`equality.ts` holds `arrayEquals` and `recordEquals`, which exist for the React adapter's effect
dependencies. Both are charged to the adapter's size-budget line, not to the core. Everything else
under `src/` is either exported or an entry.

**5. No assertion helper.** The one assertion that needed a message throws it directly at its call
site (`src/input-system.ts:94`), and a test pins that the message stays unprefixed
(`src/input-system.test.ts:5-12`). Eleven lines of helper for a single throw is a module that
exists to be imported once.

## Consequences

- The package is self-contained. Nothing outside `src/` has to exist for it to build, test or run,
  and `check:package` fails the build if `package.json` ever declares a runtime dependency.
- `modality.ts` is a per-document ref-counted singleton, and that contract is load-bearing. Two
  copies of it on one page would fight over the attribute on `<html>`, so the engine must exist
  once and not twice — which is also why the modality surface is re-exported from the root
  (`src/index.ts:33-48`) instead of living behind an engine subpath.
- `focus-ring` ships without styling, because styling is what this boundary excludes. The plugin
  paints itself inline and six custom properties override every value —
  [ADR-0020](0020-focus-ring-defaults.md).
- `adapter-parity.ts` belongs to no engine: it is the shared suite every adapter must pass
  ([ADR-0018](0018-testing-strategy.md)), so a behaviour proven for one adapter is proven for all.

## Alternatives considered

**Ship the engines and leave the intent bus and keymap out of the core.** Rejected: both engines are
`InputPlugin`s of `input-system.ts`. Without the bus they have no scope stack, no keyboard source
and no remote key table — the coupling would move into the seam between two packages instead of
disappearing.

**Re-export everything from the root for convenience.** Rejected for the reason in decision 3: on a
runtime without a bundler, convenience at the root is paid in parse and execute time by every
consumer, including the ones who wanted the keymap alone.

**Ship components too — a TV UI kit.** Rejected: out of scope. The engine is useful to anyone
building their own components, and a kit would serve only those who accept its design choices.
[ADR-0006](0006-declarative-first.md) covers what the declarative surface offers instead.
