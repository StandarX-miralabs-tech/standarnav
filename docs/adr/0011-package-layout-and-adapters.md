# ADR-0011: One package, subpath exports, adapters as subpaths

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One detail stays Proposed: the subpath name of the vanilla auto-mount helper, working name
`@standarx/nav/auto`, not yet confirmed by the owner.

## Context

standarnav extracts the input system of miralabs-ui into its own repository (see
[ADR-0003](0003-extraction-scope.md)). The extracted code is not one blob: it is a small core
(intent bus, input system, keymap, engage mode) plus engines that a consumer opts into one by
one — gamepad polling, spatial navigation, the focus-ring overlay, the debug explainer.

The source repository already shipped that shape, spread over a workspace: engines were subpaths
of `@miralabs-ui/core` (`packages/core/tsdown.config.ts:22-43` rewrites
`./input/spatial/spatial` to `./input/spatial`), while the React adapter was a separate package
with a hard dependency on core (`packages/react/package.json:68`) and non-optional peers
(`:70-73`, `react` and `react-dom` at `^19.0.0`). standarnav has no workspace and one product.
The question is whether the adapters justify separate npm packages.

State of this repository, read 2026-09-20: `package.json` declares `@standarx/nav`,
`"type": "module"`, `"sideEffects": false`, `"files": ["dist", "LICENSE", "README.md"]`, and the
scripts `check:size` (`scripts/size-budget.ts`) and `check:package` (`scripts/check-package.ts`);
`tsdown` `0.23.0`, `publint` `^0.3.24` and `@arethetypeswrong/cli` `^0.18.5` are devDependencies.
The `exports` map is generated and committed, and carries six entries plus `./package.json`
(`package.json:32-40`): `.`, `./debug`, `./focus-ring`, `./gamepad`, `./react` and `./spatial`.
`src/` exists, with 20 test files among its modules
(`find src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) | wc -l` → 20, 2026-09-20), so the
layout below is a description of the build, not a target. On 2026-09-18 none of that was true: the
map held `"./package.json"` alone, `tsdown.config.ts` listed five entries, and there was no `src/`.

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

Six of the nine are built and published today: `tsdown.config.ts:7-14` lists `src/index.ts`,
`src/gamepad/gamepad.ts`, `src/spatial/spatial.ts`, `src/focus-ring/focus-ring.ts`, `src/debug.ts`
and `src/react/react.tsx`, and the generated map at `package.json:32-40` carries the matching six
subpaths plus `./package.json` (read 2026-09-20). The last three rows are planned and have no
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
(`src/index.ts:33-48`), which is what [ADR-0004](0004-relationship-with-miralabs-ui.md) step 4
needs and what makes `isFocusable` available without pulling an engine. `src/internal/env.ts` and
`src/internal/equality.ts` are the genuinely internal ones: imported by the React adapter, exported
by nothing. `vanilla` is not an
adapter, because the core is the vanilla API; the only vanilla-specific artefact is an auto-mount
helper reading `data-snav-*` attributes, whose subpath name is the open detail of this ADR.

Framework packages are declared as `peerDependencies` with `peerDependenciesMeta` marking every
one of them `"optional": true`, since a consumer of `@standarx/nav/spatial` alone must not be
asked for React. That is written: `react` and `react-dom` at `>=18.3.0`, both optional
(`package.json:41-52`, read 2026-09-20). The range was re-examined when the adapter was ported,
as this ADR said it would be, and widened from the source constraint `^19.0.0` (miralabs-ui:
`packages/react/package.json:70-73`) down to 18.3 — the release that ships the hooks the adapter
uses, and the floor below which the provider would need a second implementation.

Runtime dependencies are zero and now enforced: `scripts/check-package.ts:30-40` fails the run when
`package.json` declares any `dependencies` entry (read 2026-09-20). A devDependency is something
only this repository installs; a `dependencies` entry is something every consumer installs whether
they use it or not, which is why the two are not the same promise.

Build: `tsdown` with `format: ["esm"]`, `platform: "neutral"`, `unbundle: true`, `dts: true`,
`publint: true`, and the `exports` map **generated** by tsdown's `customExports` rather than
hand-written (`packages/core/tsdown.config.ts:22-43`). The generated map is committed and CI fails
on drift; `check:package` packs the tarball and runs `publint` and `attw --profile esm-only` on it.

Adapter order, each shipping only once it passes the same browser suite as the core:

1. **React — shipped.** It was the only adapter that existed in the source (miralabs-ui:
   `packages/react/src/input.tsx`, 209 lines, with no test file of its own; its provider exercised
   by 8 cases in `packages/react/src/components/gamepad.browser.test.tsx` and by the provider and
   modality cases among the 16 in `packages/react/src/primitives.browser.test.tsx`, `grep -cE
   "^\s*(it|test)\("` run there on 2026-09-18). The port note held: the source provider resolves
   its document through `useDocument()` from the design-system environment context
   (`packages/react/src/input.tsx:36`, `:75`, `:173`), and that context is out of scope. This
   adapter takes the document explicitly — `NavDocumentProvider` accepts a `Document` or a
   `() => Document` (`src/react/react.tsx:51`, `:64-110`) — so it depends on React and nothing
   else. It passes the shared parity suite (`src/react/react.browser.test.tsx:340` calls
   `runAdapterParitySuite` on the adapter object built at `:260-338`), which is the ship condition
   below.
2. **vanilla auto-mount helper** — attribute-driven start-up, no framework.
3. **Vue**, 4. **Svelte**, 5. **Angular** — `packages/vue`, `packages/svelte`, `packages/angular`
   in the source contain a `package.json` and a README only, no `src/`, so there is nothing to
   port: they are new code.

Each engine and each adapter carries its own size-budget line, and a line without a cap fails the
run. `scripts/size-budget.ts` now holds **seven** lines — core, gamepad engine, spatial engine,
focus ring, debug, react adapter, whole package — and **no cap is `null`**: the react adapter line
was added when the adapter existed, exactly as this ADR said it would be, and the first build here
set every cap. `bun run build && bun run check:size`, this repository, 2026-09-20, min+gzip: core
3.13 of 3.25 kB, gamepad engine 2.48 of 2.50, spatial engine 3.04 of 3.25, focus ring 1.51 of 1.75,
debug 0.40 of 0.50, react adapter 1.30 of 1.50, whole package 8.77 of 9.00
([ADR-0017](0017-size-budgets.md), amendment of 2026-09-20). The source caps were **not** copied
over: they were measured against a workspace of several packages, so they answer a different
question, and the miralabs-ui figures under Evidence give an order of magnitude only.

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
  `check:package` is the third step of the `build` job of `.github/workflows/ci.yml` and passes
  (2026-09-20), as does the `git diff --exit-code` drift gate before it.
- `sideEffects: false` is a promise: a module registering a listener at import time would break
  tree-shaking. Entries stay factory-based (`spatialPlugin()`, `gamepadPlugin()`), as in the source.

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

- This repository, files read 2026-09-20. `package.json`: name `@standarx/nav`,
  `"type": "module"`, `"sideEffects": false`, the generated `"exports"` map with six subpaths plus
  `"./package.json"` (`:32-40`), optional `react`/`react-dom` peers at `>=18.3.0` (`:41-52`),
  `"publishConfig": {"access": "public", "provenance": true}` (`:53-56`), devDependencies `tsdown`
  `0.23.0`, `publint` `^0.3.24`, `@arethetypeswrong/cli` `^0.18.5`, and no `dependencies` key at
  all. `tsdown.config.ts:7-38`: six entries, `format: ["esm"]`, `platform: "neutral"`, `external`
  for `react`, `react-dom` and `react/jsx-runtime`, `unbundle`, `dts`, `clean`, `publint`,
  `exports.customExports` rewriting `./gamepad/gamepad` to `./gamepad` and the three like it.
  `scripts/check-package.ts:30-40`: the zero-runtime-dependency gate. `tsconfig.json:3` and
  `:13-14`: `"target": "es2020"`, `"isolatedDeclarations": true`, `"declaration": true` — the
  type-emit contract the `dts` build satisfies, `bun run typecheck` green in CI.
- On 2026-09-18 the same files read: `"exports"` with only `"./package.json"`,
  `tsdown.config.ts` with five entries, and no `src/` directory. That is the state this record was
  written against and it is quoted here so the change is legible, not as a current description.
- Source repository miralabs-ui at `289fa607`, read-only, 2026-09-18:
  `packages/core/tsdown.config.ts:1-46` (ESM, `unbundle`, `dts`, `publint`, `customExports` at
  lines 29-42); `packages/react/package.json:68` and `:70-73` (core dependency, peers
  `react`/`react-dom` `^19.0.0`); `packages/react/src/input.tsx` (209 lines by `wc -l`;
  `useDocument` at lines 36, 75 and 173); `packages/vue/package.json` (private, no `src/`).
- Sizes: `bun run check:size` in miralabs-ui, 2026-09-18, min+gzip with externals `../*` and
  `../../*` — input system 1.93/2.00 kB, gamepad 2.35/3.00 kB, spatial 2.81/3.00 kB, modality
  0.74/1.00 kB. Spatial without externals 3,303 B: reported 2026-09-18, not re-measured. The
  2026-08-27 release notes of miralabs-ui (gamepad 2.48 kB, spatial 2.89 kB, focus ring 1.34 kB)
  are historical and are not used as caps.
- Budget rule (a line without a cap fails the run): `scripts/size-budget.ts` in this repository,
  read 2026-09-20 — `Line.cap` documented at `:58-59`, `LINES` at `:77-125` holding seven lines
  with a numeric cap on every one, and the rule at `:65-76` that externals are named file by file
  and never globbed. On 2026-09-18 the same file had six lines and `cap: null` on all of them. The
  same cap rule in miralabs-ui, `limit` field, lines 573-594.
- Sizes measured here: `bun run build && bun run check:size` in this repository, 2026-09-20,
  min+gzip at Bun's default gzip level — core 3.13/3.25 kB, gamepad engine 2.48/2.50, spatial
  engine 3.04/3.25, focus ring 1.51/1.75, debug 0.40/0.50, react adapter 1.30/1.50, whole package
  8.77/9.00. Full table and the reasoning behind each cap: [ADR-0017](0017-size-budgets.md).
