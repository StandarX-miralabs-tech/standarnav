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

State of this repository, read 2026-09-18: `package.json` declares `@standarx/nav`,
`"type": "module"`, `"sideEffects": false`, `"files": ["dist", "LICENSE", "README.md"]`, an
`exports` map that still contains only `"./package.json"`, and the scripts `check:size`
(`scripts/size-budget.ts`) and `check:package` (`scripts/check-package.ts`); `tsdown` `0.23.0`,
`publint` `^0.3.24` and `@arethetypeswrong/cli` `^0.18.5` are devDependencies. `tsdown.config.ts`
lists five entries (`src/index.ts`, `src/gamepad/gamepad.ts`, `src/spatial/spatial.ts`,
`src/focus-ring/focus-ring.ts`, `src/debug.ts`). No `src/` directory exists yet: the layout below
is the target, not a description of a working build.

## Decision

One published package, `@standarx/nav`, ESM only, `sideEffects: false`, with a subpath per
module. Nothing is re-exported from the root beyond the core: an entry the consumer never
imports is never bundled.

| Subpath | Content | Planned source | Size budget line |
|---|---|---|---|
| `@standarx/nav` | intent bus, input system, keymap, engage mode | `src/intent-bus.ts`, `src/input-system.ts`, `src/keymap.ts`, `src/engage.ts` | `core` |
| `@standarx/nav/gamepad` | pad polling, mapping, dead zone, repeat | `src/gamepad/*.ts` | `gamepad engine` |
| `@standarx/nav/spatial` | spatial plugin, geometry, containers | `src/spatial/*.ts` | `spatial engine` |
| `@standarx/nav/focus-ring` | WAAPI focus-ring overlay | `src/focus-ring/focus-ring.ts` | `focus ring` |
| `@standarx/nav/debug` | `explainMove` and candidate scoring | `src/debug.ts` | `debug` |
| `@standarx/nav/react` | provider, `useIntentScopeHost`, hooks | `src/react/*.tsx` | `react adapter` |
| `@standarx/nav/vue` | composables (planned) | `src/vue/*.ts` | `vue adapter` |
| `@standarx/nav/svelte` | actions (planned) | `src/svelte/*.ts` | `svelte adapter` |
| `@standarx/nav/angular` | directives (planned) | `src/angular/*.ts` | `angular adapter` |

The five non-adapter subpaths are the entries already in `tsdown.config.ts` (read 2026-09-18).

The modality tracker (`src/modality.ts`) and the DOM helpers (`src/dom/*.ts`, `src/tabbable.ts`)
are internal: imported by the entries above, not addressable from outside. `vanilla` is not an
adapter, because the core is the vanilla API; the only vanilla-specific artefact is an auto-mount
helper reading `data-snav-*` attributes, whose subpath name is the open detail of this ADR.

Framework packages are declared as `peerDependencies` with `peerDependenciesMeta` marking every
one of them `"optional": true`, since a consumer of `@standarx/nav/spatial` alone must not be
asked for React. Peer ranges are not fixed here; React starts from the source constraint `^19.0.0`
(`packages/react/package.json:70-73`) and is re-examined when the adapter is ported.

Build: `tsdown` with `format: ["esm"]`, `platform: "neutral"`, `unbundle: true`, `dts: true`,
`publint: true`, and the `exports` map **generated** by tsdown's `customExports` rather than
hand-written (`packages/core/tsdown.config.ts:22-43`). The generated map is committed and CI fails
on drift; `check:package` packs the tarball and runs `publint` and `attw --profile esm-only` on it.

Adapter order, each shipping only once it passes the same browser suite as the core:

1. **React** — the only adapter that exists in the source: `packages/react/src/input.tsx`,
   209 lines, with no test file of its own. Its provider is exercised by 8 cases in
   `packages/react/src/components/gamepad.browser.test.tsx` and by the provider and modality
   cases among the 16 in `packages/react/src/primitives.browser.test.tsx` (`grep -cE
   "^\s*(it|test)\("`, run in miralabs-ui on 2026-09-18; see
   [ADR-0018](0018-testing-strategy.md)). Port note: the source provider resolves its document
   through `useDocument()` from the design-system environment context
   (`packages/react/src/input.tsx:36`, `:75`, `:173`).
   That context is out of scope; standarnav's provider takes the document explicitly (prop, or the
   `ownerDocument` of a ref) so the adapter depends on React only.
2. **vanilla auto-mount helper** — attribute-driven start-up, no framework.
3. **Vue**, 4. **Svelte**, 5. **Angular** — `packages/vue`, `packages/svelte`, `packages/angular`
   in the source contain a `package.json` and a README only, no `src/`, so there is nothing to
   port: they are new code.

Each engine and each adapter carries its own size-budget line, and a line without a cap fails the
run. `scripts/size-budget.ts` already exists here with six lines — core, gamepad engine, spatial
engine, focus ring, debug, whole package — and every cap is `null`, so the check fails until the
first build here produces the numbers that set them ([ADR-0017](0017-size-budgets.md)). Adapter
lines are added when an adapter exists. The source caps are **not** copied over: they were measured
against a workspace of several packages, so they answer a different question. The miralabs-ui
figures under Evidence give an order of magnitude only.

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
  dual-resolution class of `attw` errors and leaves CommonJS consumers unsupported. Not run yet.
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

- This repository, files read 2026-09-18. `package.json`: name `@standarx/nav`, `"type": "module"`,
  `"sideEffects": false`, `"exports"` with only `"./package.json"` (lines 32-34),
  `"publishConfig": {"access": "public", "provenance": true}` (lines 35-38), devDependencies
  `tsdown` `0.23.0`, `publint` `^0.3.24`, `@arethetypeswrong/cli` `^0.18.5`.
  `tsdown.config.ts:7-33`: five entries, `format: ["esm"]`, `platform: "neutral"`, `unbundle`,
  `dts`, `clean`, `publint`, `exports.customExports`; `src/` does not exist. `tsconfig.json:3`
  and `:12-13`: `"target": "es2020"`, `"isolatedDeclarations": true`, `"declaration": true` —
  the type-emit contract the `dts` build must satisfy.
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
  read 2026-09-18 — `Line.cap`, `null` on all six lines, and the failure branch that prints each
  measurement; the same rule in miralabs-ui, `limit` field, lines 573-594.
