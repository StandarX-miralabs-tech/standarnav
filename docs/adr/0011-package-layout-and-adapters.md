# ADR-0011: One package, subpath exports, adapters as subpaths

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

The detail that stayed Proposed here — the subpath name of the vanilla auto-mount helper — is
settled on its working name, `@standarx/nav/auto` ([ADR-0023](0023-vanilla-auto-mount.md)).

## Context

standarnav extracts the input system of a private predecessor implementation into its own
repository (see [ADR-0003](0003-package-boundaries.md)). The extracted code is not one blob: it is
a small core (intent bus, input system, keymap, engage mode) plus engines that a consumer opts into
one by one — gamepad polling, spatial navigation, the focus-ring overlay, the debug explainer.

The predecessor already shipped that shape, spread over a workspace: the engines were subpaths of a
core package whose exports map was rewritten from the file layout rather than written by hand. That
mechanism is the one this repository still uses, and it is inspectable here —
`tsdown.config.ts` declares `exports.customExports`, and the table at `:44-59` rewrites
`./spatial/spatial` to `./spatial`, `./gamepad/gamepad` to `./gamepad`, `./focus-ring/focus-ring` to
`./focus-ring`, `./auto/auto` to `./auto`, `./react/react` to `./react`, `./vue/vue` to `./vue`, `./svelte/svelte` to `./svelte` and `./angular/angular` to `./angular`. The adapter was the part that did not fit: it
shipped as a separate package with a hard dependency on the core and non-optional `react` and
`react-dom` peers at `^19.0.0`, inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. standarnav has no workspace and
one product. The question is whether the adapters justify separate npm packages.

State of this repository: `package.json` declares `@standarx/nav`, `"type": "module"`,
`"sideEffects": false`, `"files": ["dist", "LICENSE", "README.md"]`, and the scripts `check:size`
(`scripts/size-budget.ts`) and `check:package` (`scripts/check-package.ts`); `tsdown` `0.23.0`,
`publint` `^0.3.24` and `@arethetypeswrong/cli` `^0.18.5` are devDependencies.
The `exports` map is generated and committed, and carries fourteen entries plus `./package.json`
(`package.json`): `.`, `./angular`, `./auto`, `./debug`, `./focus-ring`, `./gamepad`, `./keyboard`,
`./keyboard/alphabetic`, `./keyboard/azerty`, `./keyboard/qwerty`, `./react`, `./spatial`,
`./svelte` and `./vue`.
`src/` exists, with 31 test files among its modules
(`find src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) | wc -l` → 31), so the layout
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
| `@standarx/nav/auto` | attribute-driven start-up ([ADR-0023](0023-vanilla-auto-mount.md)) | `src/auto/auto.ts` | `auto mount` |
| `@standarx/nav/react` | provider, `useIntentScopeHost`, hooks | `src/react/react.tsx` | `react adapter` |
| `@standarx/nav/vue` | provider, `useIntentScopeHost`, composables | `src/vue/vue.ts` | `vue adapter` |
| `@standarx/nav/svelte` | `provideNav`, `useIntentScopeHost`, functions | `src/svelte/svelte.ts` | `svelte adapter` |
| `@standarx/nav/angular` | `provideNav`, `injectIntentScopeHost`, functions | `src/angular/angular.ts` | `angular adapter` |
| `@standarx/nav/keyboard` | on-screen keyboard plugin ([ADR-0022](0022-virtual-keyboard.md)) | `src/keyboard/keyboard.ts` | `keyboard` |
| `@standarx/nav/keyboard/<id>` | one layout, data only — `qwerty`, `azerty`, `alphabetic` today | `src/keyboard/layouts/<id>.ts` | one line per layout |

Six of these rows were built when this record was first written: `tsdown.config.ts` lists `src/index.ts`,
`src/gamepad/gamepad.ts`, `src/spatial/spatial.ts`, `src/focus-ring/focus-ring.ts`, `src/debug.ts`
and `src/react/react.tsx`, and the generated map at `package.json` carries the matching six
subpaths plus `./package.json`. The keyboard and its three layouts were added on 2026-09-20 and the
auto-mount helper on 2026-09-22, the Vue adapter on 2026-09-23 and the Svelte and Angular
adapters on 2026-09-24, so the map carries fourteen subpaths; `./keyboard/qwerty` and its
siblings are the one place
where a subpath name and its file path deliberately differ, because `layouts/` is a directory and not
part of the surface (`tsdown.config.ts`). No row of the table is still planned.

**A subpath re-exports the types its own signatures name.** A consumer importing `spatialPlugin`
from `@standarx/nav/spatial` must be able to name what it returns and what it takes without
reaching into the core entry, so `./gamepad`, `./spatial` and `./react` each re-export those types
from their own module (`src/spatial/spatial.ts:46`, `src/gamepad/gamepad.ts:48-56`,
`src/react/react.tsx:40-43`). That is a rule about the public surface, not a convenience: a type a
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
(`src/index.ts:33-48`), which is what makes `isFocusable` available without pulling an engine. `src/internal/env.ts`,
`src/internal/equality.ts` and `src/internal/scope-registry.ts` are the genuinely internal ones:
imported by the adapters, exported by nothing. `vanilla` is not an
adapter, because the core is the vanilla API; the only vanilla-specific artefact is an auto-mount
helper, `@standarx/nav/auto` since 2026-09-22 ([ADR-0023](0023-vanilla-auto-mount.md)).

Framework packages are declared as `peerDependencies` with `peerDependenciesMeta` marking every
one of them `"optional": true`, since a consumer of `@standarx/nav/spatial` alone must not be
asked for React. That is written: `react` and `react-dom` at `>=18.3.0`, both optional
(`package.json`). The range was re-examined when the adapter was ported, as this ADR said it
would be, and widened from the `^19.0.0` constraint inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, down to 18.3 — the release
that ships the hooks the adapter uses, and the floor below which the provider would need a second
implementation. That floor is built and run here rather than merely declared: the `react-floor`
job (`.github/workflows/ci.yml:75-101`) installs `react@^18.3.1`, `react-dom@^18.3.1` and the
matching 18 type packages over the lockfile, then typechecks and runs the browser suite on them.

Runtime dependencies are zero and now enforced: `scripts/check-package.ts:30-40` fails the run when
`package.json` declares any `dependencies` entry. A devDependency is something only this repository
installs; a `dependencies` entry is something every consumer installs whether they use it or not,
which is why the two are not the same promise.

Build: `tsdown` with `format: ["esm"]`, `platform: "neutral"`, `unbundle: true`, `dts: true`,
`publint: true` (`tsdown.config.ts`), and the `exports` map **generated** by tsdown's
`customExports` rather than hand-written, from the subpath table in the same file.
The generated map is committed and CI fails on drift (`.github/workflows/ci.yml:53-54`);
`check:package` packs the tarball and runs `publint` and `attw --profile esm-only` on it.

Adapter order, each shipping only once it passes the same browser suite as the core:

1. **React — shipped.** React was the only adapter that already existed, and its provider resolved
   its document through the design system's environment context: both facts are inherited from the
   predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here.
   The first is why React goes first rather than by popularity; the second is why the port note said
   the context dependency had to go, that context being out of scope. This adapter takes the
   document explicitly instead — `NavDocumentProvider` accepts a `Document` or a `() => Document`
   (`DocumentSource` at `src/react/react.tsx:57`, `NavDocumentProviderProps` through the local
   `useDocument` at `:70-116`) — and `useDocument()` here reads nothing but this module's own
   `DocumentContext` (`src/react/react.tsx:68`, consumed at `:114-116`), so the adapter depends on
   React and nothing else. It also carries a test file of its own, which the predecessor's adapter
   did not: `src/react/react.browser.test.tsx`, 1017 lines, twenty-five direct cases by
   `grep -cE "^\s*(it|test)\("` (one of them a loop that runs three), ending in
   `runAdapterParitySuite(parity)` at `:895` on the adapter object built at `:784-893` — the
   shared parity suite that is the ship condition below.
2. **vanilla auto-mount helper — shipped**, `@standarx/nav/auto`, no framework
   ([ADR-0023](0023-vanilla-auto-mount.md)). See the amendment below for what
   "attribute-driven start-up" turned out to mean.
3. **Vue — shipped** on 2026-09-23, `@standarx/nav/vue` (`src/vue/vue.ts`), new code rather than a
   port, passing the same parity suite as React.
4. **Svelte — shipped** on 2026-09-24, `@standarx/nav/svelte` (`src/svelte/svelte.ts`), new code on the same suite.
5. **Angular — shipped** on 2026-09-24, `@standarx/nav/angular` (`src/angular/angular.ts`), new code on the same suite.

Each engine and each adapter carries its own size-budget line, and a line without a cap fails the
run. `scripts/size-budget.ts` now holds **fourteen** lines — core, gamepad engine, spatial engine,
focus ring, debug, auto mount, react adapter, vue adapter, svelte adapter, angular adapter,
keyboard and one per keyboard layout — and **no cap is `null`**: the react adapter
line was added when the adapter existed, exactly as this ADR said it would be, the auto-mount line
when the helper existed, the vue, svelte and angular adapter lines when those adapters existed, and
the first build here set every cap (`scripts/size-budget.ts:80-186`). `bun run build && bun run check:size`, this
repository on 2026-09-21, min+gzip: core 3.13 of 3.25 kB, gamepad engine 2.49 of 2.50, spatial
engine 3.04 of 3.25, focus ring 1.51 of 1.75, debug 0.49 of 0.50, react adapter 1.30 of 1.50,
keyboard 2.82 of 3.00, the three layouts 0.36 to 0.49 against 0.50 each, whole package 12.40 of
12.50 ([ADR-0017](0017-size-budgets.md), amendment of 2026-09-21). The predecessor's caps were
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
  `check:package` is the fourth `run:` step of the `build` job (`.github/workflows/ci.yml:55-56`) and
  passes, as does the `git diff --exit-code` drift gate before it (`:53-54`).
- `sideEffects: false` is a promise: a module registering a listener at import time would break
  tree-shaking. Entries stay factory-based — `spatialPlugin` (`src/spatial/spatial.ts:237`),
  `gamepadPlugin` (`src/gamepad/gamepad.ts:146`), `focusRingPlugin`
  (`src/focus-ring/focus-ring.ts:86`) — so nothing runs until a consumer calls one.

## Amendment, 2026-09-22: the rider closes, and item 2 of the adapter order ships

The one detail this record left Proposed since 2026-09-18 — the subpath name of the vanilla
auto-mount helper, working name `@standarx/nav/auto` — is decided, on that working name, by
[ADR-0023](0023-vanilla-auto-mount.md). The `Status` line above returns to a bare `Accepted`
and the paragraph under `Deciders` is gone. Item 2 of the adapter order is built:
`src/auto/auto.ts`, subpath `./auto`, budget line `auto mount` at 0.60 of 0.75 kB
([ADR-0017](0017-size-budgets.md), amendments of 2026-09-22). Three rows of the table remain
planned — Vue, Svelte, Angular — and they are adapters, which this one is not.

**What the helper does not do, and why this record's own sentence needed checking.** This
record described item 2 as "attribute-driven start-up", in the adapter order above. That was written before
anyone asked which attribute, and the honest answer turned out to be: none existed. Every
`data-snav-*` name this package reads belongs to the spatial engine and is already read by it
with no helper — the containers are built from the attributes today, by `spatialPlugin`, which
defaults its root to `document.body`. So ADR-0023 introduces one new attribute rather than
consuming existing ones, `data-snav-mode` on the root element, and adds the
`DOMContentLoaded` wait. Two behaviours, and the record says two rather than restating what
the engine already did.

**`sideEffects: false` shaped the API, as the last consequence above predicted.** The
shortest imaginable start-up, `import "@standarx/nav/auto"`, is exactly the module a bundler
is entitled to delete under that promise. The entry is therefore a factory like every other
one named in that bullet, and `autoMount` joins `spatialPlugin`, `gamepadPlugin` and
`focusRingPlugin` on the list of things that do nothing until called.

**One consequence of this record is now measurable rather than predicted.** "Adding a subpath
is a minor change" — `./auto` is the first subpath added since publication, and the release it
rides is 0.2.0 rather than 0.1.1, which is that sentence working as written
([ADR-0012](0012-versioning-and-release.md)).

## Amendment, 2026-09-23: item 3 of the adapter order ships, `@standarx/nav/vue`

Vue is built: `src/vue/vue.ts`, subpath `./vue` in the generated map (`package.json`, `:46`), an entry
and an external in `tsdown.config.ts` (`:15`, `:33`) and the rename at `:50`, budget line
`vue adapter` at 1.40 of 1.50 kB ([ADR-0017](0017-size-budgets.md), second amendment of
2026-09-23). Its design, and why its floor is 3.3, are [ADR-0027](0027-vue-adapter.md). Two rows
of the table remain planned, Svelte and Angular.

**The peer rule of this record holds for a second framework.** `vue` is declared the way `react`
is: a peer at `>=3.3.0` (`package.json`, `:54`) with `"optional": true` (`:69`), so a consumer of
`@standarx/nav/spatial` alone is asked for neither. And the floor is kept the way React's is,
by a job that installs it over the lockfile and runs typecheck and the chromium browser suite,
`vue-floor` (`.github/workflows/ci.yml:136-161`), exactly `vue@3.3.0` rather than the newest 3.3
patch, because 3.3.0 is the version the range names.

**`src/internal/` gained a module with a second importer.** The ordered scope registry
(`src/internal/scope-registry.ts`) moved out of the React adapter so that both adapters keep scope
order with one implementation. It is still exported by nothing, and it is charged to each adapter
line rather than to the core, like `env.ts` and `equality.ts`.

**The parity gate is now a two-adapter gate.** `runAdapterParitySuite` runs against React and
against Vue (`src/vue/vue.browser.test.ts:921`), all 16 cases, on chromium, firefox and webkit,
which is the ship condition of the adapter order above working as written. The React-first
choice paid off in one concrete way: every React correction since publication — scope order
across a rebuild, `within`, the `"native"` answer — arrived in Vue as a case it had to pass on its
first day rather than as a bug found later.

## Amendment, 2026-09-24: item 4 of the adapter order ships, `@standarx/nav/svelte`

Svelte is built: `src/svelte/svelte.ts`, subpath `./svelte` in the generated map (`package.json`,
`:45`), an entry and its externals in `tsdown.config.ts` (`:16`, `:34-35`) and the rename at `:51`,
budget line `svelte adapter` at 1.45 of 1.50 kB ([ADR-0017](0017-size-budgets.md), amendment of
2026-09-24). Its design, and why its floor is 5.0, are [ADR-0028](0028-svelte-adapter.md). One row
of the table remains planned, Angular.

**The table said "actions", and the adapter is functions.** The Svelte row read `actions
(planned)` from the day this record was written, before anyone asked what a Svelte provider is. A
`use:` action is called when its element mounts, and a provider has to set context while its
component initialises, which an action cannot do; the one thing an action would add to `useIntent`
is the element, which `bind:this` already hands over as a getter. And Svelte's own page on actions
tells 5.29 and newer to consider attachments instead, which would lift the floor. So the row now
names `provideNav`, `useIntentScopeHost` and functions, called in a component's `<script>`, and no
action ships.

**The peer rule of this record holds for a third framework.** `svelte` is a peer at `>=5.0.0`
(`package.json`, `:53`) with `"optional": true` (`:66`), and the floor is kept the way React's and
Vue's are, by `svelte-floor` (`.github/workflows/ci.yml:169-193`), exactly `svelte@5.0.0`. That job
runs the unit project too, since the server render is a unit case.

**One framework, two externals.** The adapter imports `svelte` and `svelte/store`, and both are
named in the `external` list rather than matched by a pattern (`tsdown.config.ts`, `:34-35`), as they are
on the budget line: a name that is not imported, `svelte/reactivity`, is not listed.

**The parity gate is now a three-adapter gate.** `runAdapterParitySuite` runs against React, Vue
and Svelte (`src/svelte/svelte.browser.test.ts:724`), all 16 cases, on chromium, firefox and
webkit, and `src/internal/scope-registry.ts` has its third importer. The gate caught nothing new in
Svelte's own code; what it did was make a test fixture honest: a component re-rendered with an
equal value re-opened its host scope until the fixture read its props through `$derived`.

## Amendment, 2026-09-24 (second): item 5 of the adapter order ships, `@standarx/nav/angular`

Angular is built: `src/angular/angular.ts`, subpath `./angular` in the generated map
(`package.json`, `:34`), an entry and its external in `tsdown.config.ts` (`:17`, `:36`) and the
rename at `:52`, budget line `angular adapter` at 1.67 of 1.75 kB ([ADR-0017](0017-size-budgets.md),
second amendment of 2026-09-24). Its design, and why its floor is 20.0, are
[ADR-0029](0029-angular-adapter.md). No row of the table remains planned.

**The table said "directives", and the adapter is functions.** The Angular row read `directives
(planned)` from the day this record was written. A directive is a decorated class that Angular's
compiler has to compile, and a library ships one partially compiled by ng-packagr, which needs
TypeScript 6.0 where this repository is on 7.0.2, builds outside tsdown, and ties the floor to the
Angular version it compiles with. What a directive would add is a template attribute and its host
element, and the element is one `inject(ElementRef)` passed as `within`. So the row names
`provideNav`, `injectIntentScopeHost` and functions, called in an injection context, and no
directive ships.

**The peer rule of this record holds for a fourth framework.** `@angular/core` is a peer at
`>=20.0.0` (`package.json`, `:50`) with `"optional": true` (`:57`), and the only Angular peer:
`DOCUMENT` has been exported from `@angular/core` since 20.0, so `@angular/common` is a
devDependency for the tests and nothing more. The floor is kept by `angular-floor`
(`.github/workflows/ci.yml:202-226`), exactly 20.0.0 of every Angular package the tests load, the
unit project included.

**The one adapter whose provider is a factory.** React, Vue and Svelte
build a system because their provider is a component that mounts. An Angular provider is a factory
created on its first request, so the application's or a route's `provideNav` carries an environment
initializer that creates it with the injector, and a component's builds when something below asks
([ADR-0029](0029-angular-adapter.md), decision 4).

**The parity gate is now a four-adapter gate.** `runAdapterParitySuite` runs against React, Vue,
Svelte and Angular (`src/angular/angular.browser.test.ts:1143`), all 16 cases, on chromium, firefox
and webkit, and `src/internal/scope-registry.ts` has its fourth importer. What the gate found in
Angular was an order: Angular runs the after-render hooks of one render parent first, and the
suite's two cases with a composite inside a trapping surface failed until the scopes of one render
were opened in DOM post-order.

## Alternatives considered

**A monorepo with one package per adapter** (`@standarx/nav-core`, `@standarx/nav-react`, and so
on). Real advantages: independent versioning, non-optional peers, and a lockfile that never
mentions frameworks the consumer does not use. Rejected for v0: up to nine packages to publish,
cross-package ranges to keep coherent, and a release pipeline wired for a single root package that
has not shipped a release ([ADR-0012](0012-versioning-and-release.md)). Subpaths can become
packages later.

**A single package with everything in the root entry.** Simplest map, one import. Rejected: it
puts gamepad polling and the focus-ring overlay in the dependency graph of an app that only wants
arrow-key navigation, and it makes per-engine size budgets impossible to enforce.

**Hand-written exports map.** Rejected: a generated map cannot fall behind the entry list, and the
drift gate turns a mismatch into a failed build instead of a broken published package.

## Evidence

- This repository. `package.json`: name `@standarx/nav`,
  `"type": "module"`, `"sideEffects": false`, the generated `"exports"` map with fourteen subpaths plus
  `"./package.json"` (`:32-48`), an optional `@angular/core` peer at `>=20.0.0`, optional
  `react`/`react-dom` peers at `>=18.3.0`, an optional `svelte` peer at `>=5.0.0` and an optional
  `vue` peer at `>=3.3.0` (`:49-72`),
  `"publishConfig": {"access": "public", "provenance": true}` (`:73-76`), devDependencies `tsdown`
  `0.23.0`, `publint` `^0.3.24`, `@arethetypeswrong/cli` `^0.18.5`, and no `dependencies` key at
  all. `tsdown.config.ts`: fourteen entries, `format: ["esm"]`, `platform: "neutral"`, `external`
  for `react`, `react-dom`, `react/jsx-runtime`, `vue`, `svelte`, `svelte/store` and
  `@angular/core`, `unbundle`,
  `dts`, `clean`, `publint`,
  `exports.customExports` rewriting `./gamepad/gamepad` to `./gamepad` and the three like it.
  `scripts/check-package.ts:30-40`: the zero-runtime-dependency gate. `tsconfig.json` and
  `:13-14`: `"target": "es2020"`, `"isolatedDeclarations": true`, `"declaration": true` — the
  type-emit contract the `dts` build satisfies, `bun run typecheck` green in CI.
- The predecessor's build configuration, its React adapter and its empty framework packages are
  inherited from the predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not
  re-derived here.
- No predecessor measurement is used as a cap here: those figures are inherited from the predecessor
  implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, and every cap
  in `scripts/size-budget.ts` was measured against this repository's built `dist/`.
- Budget rule (a line without a cap fails the run): `scripts/size-budget.ts` in this repository —
  `Line.cap` documented at `:60-61` and enforced at `:393-397`, where a `null` cap sets the status
  to `UNCAPPED` and pushes a failure; `LINES` at `:80-186` holding fourteen lines with a numeric cap on
  every one; and the rule at `:67-79` that externals are named file by file and never globbed.
- Sizes measured here: `bun run build && bun run check:size` in this repository on 2026-09-21,
  min+gzip at Bun's default gzip level — core 3.13/3.25 kB, gamepad engine 2.49/2.50, spatial
  engine 3.04/3.25, focus ring 1.51/1.75, debug 0.49/0.50, react adapter 1.30/1.50, keyboard
  2.82/3.00, the three layouts 0.36 to 0.49 against 0.50 each, whole package 12.40/12.50. Full
  table and the reasoning behind each cap: [ADR-0017](0017-size-budgets.md).
