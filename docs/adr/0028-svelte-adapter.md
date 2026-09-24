# ADR-0028: The Svelte adapter, `@standarx/nav/svelte`, and its 5.0 floor

Status: Accepted
Date: 2026-09-24
Deciders: Wesley Cormier

## Context

[ADR-0011](0011-package-layout-and-adapters.md) orders the adapters React, the vanilla auto-mount
helper, Vue, then Svelte and Angular, and specification R35 and R36 set the conditions: a subpath
export, an optional peer, a thin binding, and no release until the shared suite of
`src/adapter-parity.ts` passes ([ADR-0018](0018-testing-strategy.md), decision 5). ADR-0011's table
planned Svelte as "actions". There is no predecessor Svelte code to port. Vue shipped the day
before with no compiler ([ADR-0027](0027-vue-adapter.md)), and every React
correction — the scope order across a rebuild, `within` ([ADR-0025](0025-trap-within-its-surface.md)),
the `"native"` answer ([ADR-0026](0026-native-handler-answer.md)) — is a case this adapter must meet.

Five facts about Svelte 5 decide the shape. A component cannot be written without its compiler,
and what a compiled component calls, `svelte/internal`, is not public and moves between minors.
`setContext` and `getContext` are plain functions that work while a component initialises, from
any module. `onMount` never runs on a server. Runes (`$state`, `$effect`) exist only inside
compiled files; a plain module watches reactive state through `toStore` from `svelte/store`. And
the Svelte documentation passes reactive state into a function as a getter.

## Decision

**1. Functions, no component and no compiler.** `src/svelte/svelte.ts` imports only public
runtime: `setContext`, `getContext`, `getAllContexts`, `onMount` and `untrack` from `svelte`, and
`writable`, `toStore` and `fromStore` from `svelte/store` (`src/svelte/svelte.ts:14-15`). No
`.svelte` file ships, there is no `svelte` export condition, and the file is never named
`*.svelte.ts`, which the Svelte toolchain would compile as a runes module.

**2. React's vocabulary, as functions.** `provideNav(options?)` stands for `<NavProvider>` and
`provideNavDocument(doc)` for `<NavDocumentProvider>`, both called in a component's `<script>`;
`useInputSystem`, `useIntentScopeHost`, `useInputModality` and `useIntent` keep their names. A
value that changes is returned as `{ readonly current }`, built with `fromStore`
(`provideNav`, `:168`; `useInputModality`, `:232`). The types Vue re-exports are re-exported, and
`MaybeGetter`, `DocumentSource`, `NavOptions` and `UseIntentOptions` are exported (`:37-43`,
`:134`, `:149`, `:241`).

**3. Built on mount, never while a component initialises.** `whileMounted` (`:91-107`) starts a
`toStore(getter).subscribe` inside `onMount`, and the provider builds its system there, tearing it
down before every rebuild and on destroy (`:184-209`). Nothing reads a document on a server, and
every `current` keeps its server answer, `null` or `"pointer"`, until mount, so hydration matches.

**4. Options are a value or a getter, compared by content.** `provideNav` takes an object or a
getter returning `{ plugins, keymap, allowVerticalInText }`. `watch` (`:72-83`) dedupes by hand,
because a `writable` treats every object as new: `optionsEqual` (`:121-128`) compares the
document, the plugins element by element and the keymap one level deep with
`src/internal/equality.ts`, so a getter re-run for another reason rebuilds nothing, and a plugin
built inside the getter rebuilds every time, as in React and Vue. Side effects run in `untrack`.

**5. The shared registry.** The provider owns one `ScopeRegistry`, re-opens every entry on each
new system oldest first before the system is exposed (`src/svelte/svelte.ts:200`), and hands out
one host for its life.

**6. `useIntent` opens on mount.** Svelte runs a child's `onMount` before its parent's, measured
by "keeps a nested composite under the trap of the dialog around it" and the nested parity cases,
so the child's scope is opened first, as in React and Vue (`:261-292`). A missing provider warns in
development, on mount only. The handler is registered as given, `"native"` included.

**7. Three reactive options.** `trapped` and `base` take a value or a getter; a change re-opens the
scope in place through `reopen` (`:283-284`). `within` takes an element or a getter, typically
`() => element` over `bind:this`, wrapped once in a getter read at dispatch (`:263`).

**8. The document before the provider.** `provideNav` reads the document context when it is
called, so `provideNavDocument` must come first, in the same component or above it. In
development, `provideNavDocument` warns when `provideNav` already ran in the same component, told
apart by the component's own context map from `getAllContexts` (`:142-147`, `:182`).

**9. The floor is 5.0.0.** Every name in decision 1 is in the 5.0.0 release, and the `svelte-floor`
job installs exactly 5.0.0 and runs the typecheck, the unit project and the chromium browser
suite (`.github/workflows/ci.yml:169-193`). Nothing later is used: no `createSubscriber` (5.7), no
attachment (5.29), no `createContext` (5.40). `svelte` is an optional peer at `>=5.0.0` and a
devDependency at `^5.57.1`, with `@sveltejs/vite-plugin-svelte` `^7.3.1` (`package.json`).

**10. A budget line of its own**, `svelte adapter`, with `svelte`, `svelte/store`,
`../input-system.js` and `../modality.js` external (`scripts/size-budget.ts:142-148`): 1.45 kB
min+gzip, capped at 1.50 ([ADR-0017](0017-size-budgets.md), amendment of 2026-09-24).

**11. Test components compiled by the Vite plugin in both projects.** The fixtures under
`src/svelte/fixtures/` are plain JavaScript with JSDoc, never `lang="ts"`, and
`@sveltejs/vite-plugin-svelte` compiles them in the unit and browser projects
(`vitest.config.ts`, `:22`, `:31`). The harness fails any test during which Svelte prints a runtime
warning (`src/svelte/svelte-harness.ts`). Biome keeps its partial Svelte support, with an override
for the false positives it documents plus `useHookAtTopLevel`, which reads `use*` as a React hook
(`biome.json`).

## Consequences

- A `feat`: the next release is a minor.
- CI gains a tenth check, from an eighth job; `svelte-floor` runs the plugin below its declared peer
  (`svelte` `^5.46.4`), which is safe only while it keeps compiling 5.0.0, and the job says so.
- No `<NavProvider>` tag. A subtree that needs its own provider takes a two-line wrapper
  component, which `docs/en/svelte.md` shows.
- `provideNavDocument` and `provideNav` can sit in one component, where their order matters; React
  and Vue cannot get it wrong, since there the document provider is always an ancestor.
- The React and Vue lines did not move: 1 452 and 1 434 bytes, as before this record.
- The test components are not typechecked: `tsc` reads `declare module "*.svelte"` and never looks
  inside one.

## Alternatives considered

| Option | Why not |
|---|---|
| Ship uncompiled `.svelte` components behind a `svelte` export condition | What the established libraries do, and red here: `attw --profile esm-only` fails with an internal resolution error on a `.d.ts` that imports a `.svelte` file, shown on `@tanstack/svelte-query` 6.2.4 and `bits-ui` 2.19.3; `publint` lints no `.svelte`; tsdown cannot build them; and a size line cannot measure source. |
| Compile components at build time and ship the output | The output calls `svelte/internal`, which dropped 24 export names between 5.0.0 and 5.57.1: the package would work on the one minor it was built with. |
| `use:` actions, as ADR-0011's table planned | An action is called when its element mounts and cannot set context, so it cannot be the provider; a `use:` form of `useIntent` would be a second way to pass `within`, and Svelte's own page tells 5.29 and newer to consider attachments instead. |
| `createSubscriber` for `current` | Passed every test in the spike of 2026-09-24, raises the floor to 5.7.0, and measured 1.45 kB min+gzip there against 1.39 for `fromStore`. |
| `createContext` for the context keys | Type-safe, and 5.40 or later; two `Symbol` keys do the same for 5.0. |
| `svelte-check` to typecheck the test components | It brings its own TypeScript 6.0.3 next to this repository's 7, and reported only module-resolution errors in files that are not Svelte. |

## Evidence

- Code: `src/svelte/svelte.ts`, anchors above; `src/internal/scope-registry.ts` (`openOn`,
  `register`, `release`, `reopen`); `tsdown.config.ts`, `:16`, `:28`, `:42` (entry, external,
  subpath); `package.json`, `:44`, `:51`, `:61`, `:100` (export, peer, optional, devDependency).
- Tests, `src/svelte/svelte.browser.test.ts`: 28 cases of its own and `runAdapterParitySuite(parity)`
  at `:724`, 16 cases, among them "keeps a nested composite under the trap of the dialog around
  it" (`:362`), "re-opens a scope in its place when a getter it was given for trapped changes"
  (`:428`), "moves a radio group mounted with its dialog, its within a getter over bind:this"
  (`:524`), "lets a real ArrowDown check the next radio through useIntent" (`:598`), "warns when it
  comes after provideNav in the same component, and only then" (`:238`). `src/svelte/svelte.test.ts:13`,
  a server render with `svelte/server` in Node, whose document getter throws and is never called.
- Red first, 2026-09-24, `bun x vitest run --project browser src/svelte`: with no adapter the file
  fails to import and runs no test; against a stub that does nothing, 39 of 44 fail, and the unit
  case fails.
- Sabotage, 2026-09-24, same command: registering at init, re-opening in reverse on a rebuild,
  dropping the re-open, comparing plugins by identity, dropping the release, ignoring `within`,
  building at init and dropping the options dedupe turned the file red with 5, 17, 24, 1, 2, 3, 3
  and 2 failures; building at init also failed the unit case, "the document was read on the server".
- Green, 2026-09-24: `bun run test` → 522 passed, 1 skipped (523) in 30 files; `bun run test:unit`
  → 119 passed in 13 files; `bun run test:browser` with `SNAV_BROWSER` at chromium, firefox and
  webkit → 403 passed, 1 skipped in 17 files each.
- Floor, 2026-09-24, on a `git archive` copy: `bun install --frozen-lockfile`, `bun add --dev
  svelte@5.0.0`, then `bun run typecheck` green, `bun run test:unit` → 119 passed and
  `SNAV_BROWSER=chromium bun run test:browser` → 403 passed, 1 skipped, with esrap 1.4.9 resolved
  and no pin. The same lines at `svelte@4.2.20`, the latest 4.x: `bun run typecheck` fails with
  TS2305 on `untrack` from `svelte` and on `fromStore` and `toStore` from `svelte/store` in
  `src/svelte/svelte.ts`; the unit file fails, `"./server" is not exported`; the browser file fails
  to compile, "Unrecognized option 'hmr'"; and Node importing the built `dist/svelte/svelte.js`
  throws "The requested module 'svelte/store' does not provide an export named 'fromStore'".
- Version facts, fetched 2026-09-24: `bun info svelte time` gives 5.0.0 on 2024-10-19, 4.2.20 on
  2025-05-20 and 5.57.1, the latest, on 2026-09-18; the 5.0.0 tarball
  (https://registry.npmjs.org/svelte/-/svelte-5.0.0.tgz) exports `toStore` and `fromStore` from
  `src/store/index-client.js` and `getAllContexts` from `src/internal/client/runtime.js`, returning
  the component's own context map; https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/CHANGELOG.md
  dates `createSubscriber` to 5.7.0, attachments to 5.29.0 and `createContext` to 5.40.0;
  https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/06-runtime/03-lifecycle-hooks.md
  says `onMount` does not run on the server;
  https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/02-runes/02-$state.md
  passes state into functions as getters; https://svelte.dev/docs/svelte/use says actions are
  "called when an element is mounted" and "In Svelte 5.29 and newer, consider using attachments
  instead";
  `bun info @sveltejs/vite-plugin-svelte` gives 7.3.1 with peers `vite` `^8.0.0` and `svelte`
  `^5.46.4`; https://biomejs.dev/internals/language-support/ lists the four rules to turn off for
  Svelte; https://svelte.dev/docs/kit/packaging describes shipping uncompiled components.
- Alternatives, 2026-09-24: `attw --profile esm-only` 0.18.5 on the packed `@tanstack/svelte-query`
  6.2.4 and `bits-ui` 2.19.3 tarballs reports "node16 (from ESM): Internal resolution error" on
  their `.d.ts` imports of `.svelte` files, where `publint --strict` 0.3.24 prints "All good"; a
  diff of the export names of `src/internal/client/index.js` between the 5.0.0 and 5.57.1
  tarballs finds 24 removed and 49 added; `svelte-check` 4.7.6, run once through `bun x`, installed
  its own TypeScript 6.0.3.
- Real page, 2026-09-24: a temporary page served by `bun x vite <dir> --port 5192 --strictPort`,
  `provideNav` with `spatialPlugin({ mode: "app" })`, four buttons and a dialog opened by the last
  with `trapped` and `within` over `bind:this`, holding a radio group that answers `"native"` on its
  vertical axis and an OK button to its right. Real keys from Playwright, on chromium, firefox and
  webkit alike: ArrowDown and ArrowUp moved between the buttons, Enter opened the dialog, ArrowDown
  checked `m` then `l` and ArrowUp `m` again with the focus following, ArrowRight moved to OK with
  `m` still checked, ArrowDown from OK stayed on OK, and Escape closed the dialog and the focus went
  back to its button. No console warning on any engine.
