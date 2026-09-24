# ADR-0027: The Vue adapter, `@standarx/nav/vue`, and its 3.3 floor

Status: Accepted
Date: 2026-09-23
Deciders: Wesley Cormier

## Context

[ADR-0011](0011-package-layout-and-adapters.md) orders the adapters React, the vanilla auto-mount
helper, then Vue, Svelte and Angular, and specification R35 and R36 set the conditions: a subpath
export, an optional peer, a thin binding, and no release until the shared suite of
`src/adapter-parity.ts` passes ([ADR-0018](0018-testing-strategy.md), decision 5). There is no
predecessor Vue code to port. React has since been corrected three times, and each correction is
now a case an adapter must meet: the scope order across a rebuilt system (issue #13), `within`
([ADR-0025](0025-trap-within-its-surface.md)) and the `"native"` answer
([ADR-0026](0026-native-handler-answer.md)).

Four facts about Vue decide the shape. `setup()` runs once per component, so the identity churn
React's refs guard against does not exist. Component props are shallow-reactive, so a provider can
watch them directly. A child's `mounted` hook runs before its parent's, which is the order React
runs effects in and the order the nested parity cases assert. And a server render runs `setup()`
but never `mounted`.

## Decision

**1. The same surface as React.** `NavProvider`, `NavDocumentProvider`, `useInputSystem`,
`useIntentScopeHost`, `useInputModality` and `useIntent`, with the types their signatures name
re-exported (`src/vue/vue.ts:47-50`). Where React returns a value that changes, Vue returns a
`ShallowRef` (`useInputSystem`, `:199`; `useInputModality`, `:218`), which a template unwraps.

**2. No compiler.** Every component is `defineComponent` over a setup function returning a render
function (`NavProvider`, `:132`): no single-file component, no JSX. Neither tsdown nor Vitest
needs `@vitejs/plugin-vue`, and the tests drive `createApp` and `nextTick` directly
(`src/vue/vue-harness.ts`) rather than `@vue/test-utils`, for the reason the React harness gives.

**3. Built on mount, never in setup.** `whileMounted` (`src/vue/vue.ts:70-78`) creates its watcher inside
`onMounted` with `immediate`, and the provider builds its system there (`:170-183`), tearing it
down before every rebuild and on unmount. Nothing reads a document on a server, and the first
render sees `null`.

**4. Options compared by content.** The provider's watched source returns the same object while
the document, the plugin list element by element, the keymap one level deep and
`allowVerticalInText` are unchanged (`:151-169`), so a fresh array or keymap literal per render
rebuilds nothing, and a plugin built in the render function rebuilds every time, as in React.
Plugins must be held in a plain constant: `ref([spatialPlugin()])` hands the provider proxies.

**5. One registry, shared with React.** The ordered registry of issue #13 moved from
`src/react/react.tsx` to `src/internal/scope-registry.ts` in this pull request. The provider owns
one, re-opens every entry on each new system oldest first, before the system is exposed
(`src/vue/vue.ts:174-176`), and hands out one host object for its life (`:140-145`).

**6. `useIntent` opens on mount.** Registering in `setup()` would put a parent's scope under its
child's, since a parent's setup runs first; on mount the child's scope is opened first, as in
React (`:259-267`). A missing provider warns in development, on mount only. The handler is
registered as given, so its answer, `"native"` included, reaches the bus unchanged.

**7. Reactive options, and only three.** `trapped` and `base` take a value, a ref or a getter
(`MaybeRefOrGetter`); a change re-opens the scope in place with every later scope above it
(`:269-271`). `within` takes an element, a getter or a template ref on an element, wrapped once in
a getter read at dispatch (`:251`), so neither a filled ref nor a new element re-opens anything.
The handler is a plain function and the provider's props are plain props: Vue already makes those
reactive, and a second way to pass them would be surface without a use.

**8. The floor is 3.3.0.** The adapter uses three things 3.3 introduced: `toValue`,
`MaybeRefOrGetter` and the setup-function form of `defineComponent` (Evidence). Vue 3.2.47 fails
to typecheck the adapter on exactly those and fails to import it at run time. Nothing newer is
used — no `useTemplateRef` or `onWatcherCleanup` (3.5), no previous value in `computed` (3.4) —
and the `vue-floor` job keeps that true (`.github/workflows/ci.yml:136-161`). `vue` is an
optional peer at `>=3.3.0` and a devDependency at `^3.5.43` (`package.json`).

**9. A budget line of its own**, `vue adapter`, with `vue`, `../input-system.js` and
`../modality.js` external (`scripts/size-budget.ts:135-141`): 1.40 kB min+gzip, capped at 1.50
([ADR-0017](0017-size-budgets.md), second amendment of 2026-09-23).

**10. Vue's feature flags in the test config.** The esm-bundler build warns once per run when
`__VUE_OPTIONS_API__`, `__VUE_PROD_DEVTOOLS__` and `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` are
undefined; the browser project defines them to Vue's defaults (`vitest.config.ts`, `:35-39`).

## Consequences

- A `feat`: the next release is a minor, as with ADR-0026.
- CI runs nine checks from seven jobs.
- A template ref on a *component* resolves to an instance, not an element; `within` then needs a
  getter such as `() => card.value?.$el`.
- `NavDocumentProvider`'s getter is re-read when something reactive it reads changes, not after
  every render as in React, where a getter may answer a new document at any render.
- An application bundling Vue with Vite and no `@vitejs/plugin-vue` sees the feature-flag warning
  until its own config defines the three flags; `docs/en/vue.md` says so.
- The React line grew by 2 bytes, 1450 to 1452 min+gzip, from the registry moving to its own module.

## Alternatives considered

| Option | Why not |
|---|---|
| Single-file components and `@vitejs/plugin-vue` | A compiler in the build and in Vitest for three components that render a slot. |
| `@vue/test-utils` | It flushes on the caller's behalf, which is the timing these tests exist to see. |
| Build the system in `setup()` | Reads `document` on a server, and breaks the parity case "builds exactly one system, and not during the first render": 12 of 43 cases failed with it. |
| Open `useIntent`'s scope in `setup()` | Parent before child: 4 of 43 cases failed, the nested composite and `within` cases among them. |
| A 3.0 floor, with `unref` and a function check instead of `toValue`, and the object form of `defineComponent` | Possible, but it re-implements the idiom decision 7 is written in, `MaybeRefOrGetter`, to support releases superseded since 2023-05-11 whose use is not measured here, and no job would run it. |
| Options as one getter returning the whole object | One watched source, but every consumer then writes `() => ({ trapped: open.value })` for a single flag, and `within` would be re-read on every trapped change. |

## Evidence

- Code: `src/vue/vue.ts`, anchors above; `src/internal/scope-registry.ts` (`openOn`, `register`,
  `release`, `reopen`); `tsdown.config.ts`, `:15`, `:28`, `:41` (entry, external, subpath);
  `package.json`, `:45`, `:52`, `:64`, `:106` (export, peer, optional, devDependency).
- Tests, `src/vue/vue.browser.test.ts`: 27 cases of its own and `runAdapterParitySuite(parity)` at
  `:921`, 16 cases, among them "keeps a nested composite under the trap of the dialog around it"
  (`:384`), "re-opens a scope in its place when a ref it was given for trapped changes" (`:443`),
  "answers a scope opened during setup, before the system exists" (`:284`), "moves a radio group
  mounted with its dialog, its within given as a template ref" (`:615`), "lets a real ArrowDown
  check the next radio through useIntent" (`:718`) and "warns about a missing provider, and not
  about a system still being built" (`:150`). `src/vue/vue.test.ts:20`, a server render in Node
  with no `document` that calls no document getter.
- Sabotage, 2026-09-23, each run with `bun x vitest run --project browser src/vue`: registering in
  setup, re-opening in reverse on a rebuild, dropping the re-open, comparing plugins by identity,
  dropping the release, ignoring `within` and building in setup each turned the file red, with 4,
  17, 2, 1, 2, 4 and 12 failures.
- Green, 2026-09-23: `bun run test` → 477 passed, 1 skipped (478) in 28 files; `bun run
  test:browser` with `SNAV_BROWSER` at chromium, firefox and webkit → 359 passed, 1 skipped in 16
  files each.
- Floor, 2026-09-23, on a `git archive` copy: `bun install --frozen-lockfile`, `bun add --dev
  vue@3.3.0`, then `bun run typecheck` green and `SNAV_BROWSER=chromium bun run test:browser` → 359
  passed, 1 skipped. The same copy at `vue@3.2.47`: `bun run typecheck` fails with TS2305 on
  `MaybeRefOrGetter` and `toValue` and TS2554 on both two-argument `defineComponent` calls in
  `src/vue/vue.ts`, and the browser file fails to import, "does not provide an export named
  'toValue'".
- Version facts, fetched 2026-09-23: https://vuejs.org/api/reactivity-utilities.html marks
  `toValue()` "Only supported in 3.3+"; https://vuejs.org/api/general.html marks the function
  signature of `defineComponent()` "Only supported in 3.3+"; https://blog.vuejs.org/posts/vue-3-3
  (2023-05-11) announces `toValue`; https://registry.npmjs.org/vue gives 3.3.0 on 2023-05-11,
  3.4.0 on 2023-12-29, 3.5.0 on 2024-09-03 and 3.5.43 as latest.
- Real page, 2026-09-23: a temporary page served by `bun x vite <dir> --port 5191 --strictPort`,
  a `NavProvider` with `spatialPlugin({ mode: "app" })`, four buttons and a dialog opened by the
  last with `trapped` and `within`, holding a radio group that answers `"native"` on its vertical
  axis and an OK button to its right. Real keys from Playwright, on chromium, firefox and webkit
  alike: ArrowDown and ArrowUp moved between the buttons, Enter opened the dialog, ArrowDown checked
  `m` then `l` and ArrowUp `m` again with the focus following, ArrowRight moved to OK with `m`
  still checked, ArrowDown from OK stayed inside the dialog, and Escape closed it. Each engine's
  console carried Vue's feature-flag warning, that page having no bundler config to define them.
