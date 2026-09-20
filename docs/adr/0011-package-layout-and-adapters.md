# ADR-0011: One package, subpath exports, adapters as subpaths

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One detail stays Proposed: the subpath name of the vanilla auto-mount helper, working name
`@standarx/nav/auto`, not yet confirmed by the owner.

## Context

standarnav extracts the input system of a private predecessor implementation into its own
repository (see [ADR-0003](0003-package-boundaries.md)). The extracted code is not one blob: it is
a small core (intent bus, input system, keymap, engage mode) plus engines that a consumer opts into
one by one — gamepad polling, spatial navigation, the focus-ring overlay, the debug explainer.

The predecessor already shipped that shape, spread over a workspace: the engines were subpaths of a
core package whose exports map was rewritten from the file layout rather than written by hand. That
mechanism is the one this repository still uses, and it is inspectable here —
`tsdown.config.ts:30-50` declares `exports.customExports`, and the table at `:32-43` rewrites
`./spatial/spatial` to `./spatial`, `./gamepad/gamepad` to `./gamepad`, `./focus-ring/focus-ring` to
`./focus-ring` and `./react/react` to `./react`. The adapter was the part that did not fit: it
shipped as a separate package with a hard dependency on the core and non-optional `react` and
`react-dom` peers at `^19.0.0`, inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. standarnav has no workspace and
one product. The question is whether the adapters justify separate npm packages.

State of this repository: `package.json` declares `@standarx/nav`, `"type": "module"`,
`"sideEffects": false`, `"files": ["dist", "LICENSE", "README.md"]`, and the scripts `check:size`
(`scripts/size-budget.ts`) and `check:package` (`scripts/check-package.ts`); `tsdown` `0.23.0`,
`publint` `^0.3.24` and `@arethetypeswrong/cli` `^0.18.5` are devDependencies.
The `exports` map is generated and committed, and carries ten entries plus `./package.json`
(`package.json:32-44`): `.`, `./debug`, `./focus-ring`, `./gamepad`, `./keyboard`,
`./keyboard/alphabetic`, `./keyboard/azerty`, `./keyboard/qwerty`, `./react` and `./spatial`.
`src/` exists, with 22 test files among its modules
(`find src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) | wc -l` → 22), so the layout
below is a description of the build, not a target.

## Decision

One published package, `@standarx/nav`, ESM only, `sideEffects: false`, with a subpath per
module. Nothing is re-exported from the root beyond the core: an entry the consumer never
imports is never bundled.

| Subpath | Content | Source | Size budget line |
|---|---|---|---|
| `@standarx/nav` | intent bus, input system, keymap, engage mode | `src/intent-bus.ts`, `src/input-system.ts`, `src/keymap.ts`, `src/engage.ts` | `core` |
| `@standarx/nav/gamepad` | pad polling, mapping, dead zone, repeat | `src/gamepad/*.ts` | `gamepad engine` |
| `@standarx/nav/spatial` | spatial plugin, geometry, containers | `src/spatial/*.ts` | `spatial engine` |
| `@standarx/nav/focus-ring` | WAAPI focus-ring overlay | `src/focus-ring/focus-ring.ts` | `focus ring` |
| `@standarx/nav/debug` | `explainMove` and candidate scoring | `src/debug.ts` | `debug` |
| `@standarx/nav/react` | provider, `useIntentScopeHost`, hooks | `src/react/react.tsx` | `react adapter` |
| `@standarx/nav/vue` | composables (planned) | `src/vue/*.ts` | `vue adapter` |
| `@standarx/nav/svelte` | actions (planned) | `src/svelte/*.ts` | `svelte adapter` |
| `@standarx/nav/angular` | directives (planned) | `src/angular/*.ts` | `angular adapter` |
| `@standarx/nav/keyboard` | on-screen keyboard plugin ([ADR-0022](0022-virtual-keyboard.md)) | `src/keyboard/keyboard.ts` | `keyboard` |
| `@standarx/nav/keyboard/<id>` | one layout, data only — `qwerty`, `azerty`, `alphabetic` today | `src/keyboard/layouts/<id>.ts` | one line per layout |

Six of these rows were built when this record was first written: `tsdown.config.ts:7-20` lists `src/index.ts`,
`src/gamepad/gamepad.ts`, `src/spatial/spatial.ts`, `src/focus-ring/focus-ring.ts`, `src/debug.ts`
and `src/react/react.tsx`, and the generated map at `package.json:32-44` carries the matching six
subpaths plus `./package.json`. The keyboard and its three layouts were added on 2026-09-20 and are
built too, so the map carries ten subpaths; `./keyboard/qwerty` and its siblings are the one place
where a subpath name and its file path deliberately differ, because `layouts/` is a directory and not
part of the surface (`tsdown.config.ts:37-42`). The three adapter rows are still planned and have no
entry, no file and no budget line.

**A subpath re-exports the types its own signatures name.** A consumer importing `spatialPlugin`
from `@standarx/nav/spatial` must be able to name what it returns and what it takes without
reaching into the core entry, so `./gamepad`, `./spatial` and `./react` each re-export those types
from their own module (`src/spatial/spatial.ts:46`, `src/gamepad/gamepad.ts:48-56`,
`src/react/react.tsx:42-45`). That is a rule about the public surface, not a convenience: a type a
public signature names and the subpath does not export is a type the consumer cannot write down.

`./spatial` also publishes `containerOf` and `collectNavNodes`
(`src/spatial/spatial.ts:148`, `:170`), because they are what a diagnostic or a custom engine needs
to ask the same questions the plugin asks. The nine navigation attribute constants stay **private**:
they are read from the markup and their names are the contract of
[ADR-0001](0001-name-scope-and-attribute-prefix.md), so exporting the string constants would create
a second way to depend on them that a rename would have to keep working.

The modality tracker (`src/modality.ts`) and the DOM helpers (`src/dom/*.ts`, `src/tabbable.ts`)
have no subpath of their own: nothing addresses them from outside. They are not private, though —
the root entry re-exports the modality surface and six tabbable symbols
(`src/index.ts:33-48`), which is what makes `isFocusable` available without pulling an engine. `src/internal/env.ts` and
`src/internal/equality.ts` are the genuinely internal ones: imported by the React adapter, exported
by nothing. `vanilla` is not an
adapter, because the core is the vanilla API; the only vanilla-specific artefact is an auto-mount
helper reading `data-snav-*` attributes, whose subpath name is the open detail of this ADR.

Framework packages are declared as `peerDependencies` with `peerDependenciesMeta` marking every
one of them `"optional": true`, since a consumer of `@standarx/nav/spatial` alone must not be
asked for React. That is written: `react` and `react-dom` at `>=18.3.0`, both optional
(`package.json:41-52`). The range was re-examined when the adapter was ported, as this ADR said it
would be, and widened from the `^19.0.0` constraint inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, down to 18.3 — the release
that ships the hooks the adapter uses, and the floor below which the provider would need a second
implementation. That floor is built and run here rather than merely declared: the `react-floor`
job (`.github/workflows/ci.yml:75-88`) installs `react@^18.3.1`, `react-dom@^18.3.1` and the
matching 18 type packages over the lockfile, then typechecks and runs the browser suite on them.

Runtime dependencies are zero and now enforced: `scripts/check-package.ts:30-40` fails the run when
`package.json` declares any `dependencies` entry. A devDependency is something only this repository
installs; a `dependencies` entry is something every consumer installs whether they use it or not,
which is why the two are not the same promise.

Build: `tsdown` with `format: ["esm"]`, `platform: "neutral"`, `unbundle: true`, `dts: true`,
`publint: true` (`tsdown.config.ts:21-29`), and the `exports` map **generated** by tsdown's
`customExports` rather than hand-written (`tsdown.config.ts:30-50`, the subpath table at `:32-43`).
The generated map is committed and CI fails on drift (`.github/workflows/ci.yml:53-54`);
`check:package` packs the tarball and runs `publint` and `attw --profile esm-only` on it.

Adapter order, each shipping only once it passes the same browser suite as the core:

1. **React — shipped.** React was the only adapter that already existed, and its provider resolved
   its document through the design system's environment context: both facts are inherited from the
   predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here.
   The first is why React goes first rather than by popularity; the second is why the port note said
   the context dependency had to go, that context being out of scope. This adapter takes the
   document explicitly instead — `NavDocumentProvider` accepts a `Document` or a `() => Document`
   (`DocumentSource` at `src/react/react.tsx:51`, `NavDocumentProviderProps` through the local
   `useDocument` at `:64-110`) — and `useDocument()` here reads nothing but this module's own
   `DocumentContext` (`src/react/react.tsx:62`, consumed at `:108-110`), so the adapter depends on
   React and nothing else. It also carries a test file of its own, which the predecessor's adapter
   did not: `src/react/react.browser.test.tsx`, 340 lines, nine direct cases by
   `grep -cE "^\s*(it|test)\("`, ending in `runAdapterParitySuite(parity)` at `:340` on the adapter
   object built at `:260-338` — the shared parity suite that is the ship condition below.
2. **vanilla auto-mount helper** — attribute-driven start-up, no framework.
3. **Vue**, 4. **Svelte**, 5. **Angular** — this repository has no `src/vue`, `src/svelte` or
   `src/angular`, and no predecessor code to port: they are new code, not a migration.

Each engine and each adapter carries its own size-budget line, and a line without a cap fails the
run. `scripts/size-budget.ts` now holds **seven** lines — core, gamepad engine, spatial engine,
focus ring, debug, react adapter, whole package — and **no cap is `null`**: the react adapter line
was added when the adapter existed, exactly as this ADR said it would be, and the first build here
set every cap (`scripts/size-budget.ts:77-158`). `bun run build && bun run check:size`, this
repository, min+gzip: core 3.13 of 3.25 kB, gamepad engine 2.48 of 2.50, spatial engine 3.04 of
3.25, focus ring 1.51 of 1.75, debug 0.49 of 0.50, react adapter 1.30 of 1.50, whole package 8.77 of
9.00 ([ADR-0017](0017-size-budgets.md), amendment of 2026-09-20). The predecessor's caps were
**not** copied over: they were measured against a workspace of several packages, so they answer a
different question. Those figures are inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here; every cap in
`scripts/size-budget.ts` was measured against this repository's own `dist/`.

## Consequences

- One version number for everything: a fix in the Angular adapter publishes a release core
  consumers also see. The CHANGELOG must say which subpath changed
  ([ADR-0012](0012-versioning-and-release.md)). First thing to revisit if adapters gain maintainers.
- Bundlers and package managers must treat a missing optional peer as satisfied. This is the main
  technical risk here and it is **not verified yet**: it needs a consumer smoke test (an app
  importing `@standarx/nav/spatial` with no framework installed) beyond `publint` and `attw`.
- The exports map is the public API surface. Adding a subpath is a minor change; renaming or
  removing one is breaking. The map is generated from the entry list, so renaming a source file
  renames a public subpath: the committed map plus the CI drift gate makes that visible in review.
- The tarball carries framework code most consumers never load. The cost is download size, not
  runtime size: subpaths are separate ESM modules, nothing imports an adapter implicitly.
- Type resolution has one answer per subpath (ESM only, no CJS fallback): that removes the
  dual-resolution class of `attw` errors and leaves CommonJS consumers unsupported. Run and green:
  `check:package` is the third run step of the `build` job (`.github/workflows/ci.yml:55-56`) and
  passes, as does the `git diff --exit-code` drift gate before it (`:53-54`).
- `sideEffects: false` is a promise: a module registering a listener at import time would break
  tree-shaking. Entries stay factory-based — `spatialPlugin` (`src/spatial/spatial.ts:237`),
  `gamepadPlugin` (`src/gamepad/gamepad.ts:138`), `focusRingPlugin`
  (`src/focus-ring/focus-ring.ts:86`) — so nothing runs until a consumer calls one.

## Alternatives considered

**A monorepo with one package per adapter** (`@standarx/nav-core`, `@standarx/nav-react`, and so
on). Real advantages: independent versioning, non-optional peers, and a lockfile that never
mentions frameworks the consumer does not use. Rejected for v0: up to nine packages to publish,
cross-package ranges to keep coherent, and no release pipeline yet
([ADR-0012](0012-versioning-and-release.md)). Subpaths can become packages later.

**A single package with everything in the root entry.** Simplest map, one import. Rejected: it
puts gamepad polling and the focus-ring overlay in the dependency graph of an app that only wants
arrow-key navigation, and it makes per-engine size budgets impossible to enforce.

**Hand-written exports map.** Rejected: a generated map cannot fall behind the entry list, and the
drift gate turns a mismatch into a failed build instead of a broken published package.

## Evidence

- This repository. `package.json`: name `@standarx/nav`,
  `"type": "module"`, `"sideEffects": false`, the generated `"exports"` map with six subpaths plus
  `"./package.json"` (`:32-40`), optional `react`/`react-dom` peers at `>=18.3.0` (`:41-52`),
  `"publishConfig": {"access": "public", "provenance": true}` (`:53-56`), devDependencies `tsdown`
  `0.23.0`, `publint` `^0.3.24`, `@arethetypeswrong/cli` `^0.18.5`, and no `dependencies` key at
  all. `tsdown.config.ts:7-50`: ten entries, `format: ["esm"]`, `platform: "neutral"`, `external`
  for `react`, `react-dom` and `react/jsx-runtime`, `unbundle`, `dts`, `clean`, `publint`,
  `exports.customExports` rewriting `./gamepad/gamepad` to `./gamepad` and the three like it.
  `scripts/check-package.ts:30-40`: the zero-runtime-dependency gate. `tsconfig.json:3` and
  `:13-14`: `"target": "es2020"`, `"isolatedDeclarations": true`, `"declaration": true` — the
  type-emit contract the `dts` build satisfies, `bun run typecheck` green in CI.
- The predecessor's build configuration, its React adapter and its empty framework packages are
  inherited from the predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not
  re-derived here.
- No predecessor measurement is used as a cap here: those figures are inherited from the predecessor
  implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, and every cap
  in `scripts/size-budget.ts` was measured against this repository's built `dist/`.
- Budget rule (a line without a cap fails the run): `scripts/size-budget.ts` in this repository —
  `Line.cap` documented at `:58-59` and enforced at `:253-257`, where a `null` cap sets the status
  to `UNCAPPED` and pushes a failure; `LINES` at `:77-158` holding eleven lines with a numeric cap on
  every one; and the rule at `:65-76` that externals are named file by file and never globbed.
- Sizes measured here: `bun run build && bun run check:size` in this repository, min+gzip at Bun's
  default gzip level — core 3.13/3.25 kB, gamepad engine 2.48/2.50, spatial engine 3.04/3.25,
  focus ring 1.51/1.75, debug 0.49/0.50, react adapter 1.30/1.50, whole package 8.77/9.00. Full
  table and the reasoning behind each cap: [ADR-0017](0017-size-budgets.md).
