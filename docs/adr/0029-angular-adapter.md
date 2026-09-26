# ADR-0029: The Angular adapter, `@standarx/nav/angular`, and its 20.0 floor

Status: Accepted
Date: 2026-09-24
Deciders: Wesley Cormier

## Context

[ADR-0011](0011-package-layout-and-adapters.md) orders the adapters React, the vanilla auto-mount
helper, Vue, Svelte, then Angular, and specification R35 and R36 set the conditions: a subpath
export, an optional peer, a thin binding, and no release until the shared suite of
`src/adapter-parity.ts` passes ([ADR-0018](0018-testing-strategy.md), decision 5). ADR-0011's table
planned Angular as "directives". There is no predecessor Angular code to port. Vue and Svelte
shipped with no framework compiler in the build ([ADR-0027](0027-vue-adapter.md),
[ADR-0028](0028-svelte-adapter.md)), and every React correction — the scope order across a
rebuild, `within` ([ADR-0025](0025-trap-within-its-surface.md)), the `"native"` answer
([ADR-0026](0026-native-handler-answer.md)) — is a case this adapter must meet.

Five facts about Angular decide the shape. A class carrying `@Component`, `@Directive` or
`@Injectable` has to be compiled by Angular's compiler, and a library ships one partially compiled
by ng-packagr, whose output an application may only consume at the Angular version it was built
with or later; ng-packagr and `@angular/compiler-cli` need TypeScript 6.0, and this repository is
on TypeScript 7.0.2, whose package exports no classic compiler API. `inject`, `InjectionToken`,
`DestroyRef`, `signal`, `computed`, `effect`, `afterNextRender` and `afterRenderEffect` are plain
functions, so a function called in an injection context can do what a directive does except appear
in a template. After-render hooks never run on a server, and component effects do. Angular runs the
after-render hooks of one render in construction order, parent first. And a factory provider is
created on its first request: an environment injector runs its `ENVIRONMENT_INITIALIZER` entries
when it is created, and a component's `providers` have no start-up hook at all.

## Decision

**1. Functions, no decorator and no compiler.** `src/angular/angular.ts` imports only public API
from `@angular/core` (`src/angular/angular.ts:14-29`) and declares no decorated class. tsdown
builds it as plain ESM with `@angular/core` external, like every other entry (`tsdown.config.ts`,
`:17`, `:36`, `:52`). No ng-packagr, no partial compilation and no `tslib`.

**2. Angular's `provide*` and `inject*` idiom.** `provideNav(options?)` stands for `<NavProvider>`
and `provideNavDocument(doc)` for `<NavDocumentProvider>`; both return `Provider[]`
(`src/angular/angular.ts:198-206`, `:117-119`), which `bootstrapApplication`, a route's
`providers` and a component's `providers` all accept. `injectInputSystem()` returns
`Signal<InputSystem | null>` (`:209-211`), `injectIntentScopeHost()` the host or `null`
(`:219-221`), `injectInputModality()` a `Signal<InputModality>` that reads `"pointer"` until the
first render (`:228-239`), and `injectIntent(handler, { trapped, base, within })` opens a scope
(`:284-331`). The types Vue and Svelte re-export are re-exported, with `MaybeSignal`,
`DocumentSource`, `NavOptions` and `InjectIntentOptions` (`:51-57`, `:110`, `:121`, `:241`).

**3. Built after the first render, never in a factory or a constructor.** `createNav`
(`:134-185`) holds the registry, the system signal and a `computed` of the options whose `equal`
compares the document, the plugins element by element and the keymap one level deep with
`src/internal/equality.ts` (`optionsEqual`, `src/angular/angular.ts:101-108`). An
`afterRenderEffect` reads it and builds the system, tearing the old one down first, and on destroy
(`:156-172`). A server render reads no document, and every signal keeps its server answer until
the first render in a browser.

**4. Eager in an environment injector, on request in a component.** The list `provideNav` returns
carries an `ENVIRONMENT_INITIALIZER` that injects the provider (`:204`), so the application's
injector and a route's create it as they are created, and an application with a plugin and no scope
still gets a system. The token is deprecated since 19.0 in favour of
`provideEnvironmentInitializer`, which only wraps that same token in `EnvironmentProviders`, and
`EnvironmentProviders` is what a component's `providers` reject with NG0207. A node injector never
reads the token, so in a component's `providers` the provider is created on its first request: the
rule is that the providing component calls `injectInputSystem()` when nothing below it injects
anything.

**5. The shared registry.** The provider owns one `ScopeRegistry`, re-opens every entry on each new
system oldest first before the system is exposed (`:162-164`), and hands out one host for its life
(`:178-183`).

**6. `injectIntent` opens after the render, in DOM post-order.** A call queues its scope with its
component's host element and asks `afterNextRender` to open what is queued (`:305-313`). Angular
runs those hooks parent first, so the queue is sorted by `postOrder` (`:260-274`) before it opens:
a child's scope opens before its parent's, whether the child is in the parent's template or
projected into it, as React's and Vue's effects order them. A missing provider warns in development
from an `afterNextRender` (`:286-295`), so never on a server. The handler is registered as given,
`"native"` included.

**7. Three reactive options.** `trapped` and `base` take a value, a signal or a getter; an `effect`
re-opens the scope in place through `reopen` when either changes (`:316-323`). The effect runs on a
server too, where nothing is open, and touches no document. `within` takes an element, an
`ElementRef`, or a signal or getter answering either, wrapped once in a getter read at dispatch
(`:296-299`). There is no default: a component that passes no `within` is opened as before
ADR-0025.

**8. The floor is 20.0.0.** `DOCUMENT` is exported from `@angular/core` from 20.0.0, and `effect`,
`afterRenderEffect` and the callback form of `afterNextRender` are public API in its typings. The
`angular-floor` job installs exactly 20.0.0 of `@angular/core` and of the four Angular packages the
tests load, and runs the typecheck, the unit project and the chromium browser suite
(`.github/workflows/ci.yml:202-226`). `@angular/core` is an optional peer at `>=20.0.0` and the only
peer, and a devDependency at `^22.2.0` with `@angular/compiler`, `@angular/common`,
`@angular/platform-browser`, `@angular/platform-server` and `rxjs`, the required peer of
`@angular/core` (`package.json`).

**9. A budget line of its own**, `angular adapter`, with `@angular/core`, `../input-system.js` and
`../modality.js` external (`scripts/size-budget.ts:154-160`): 1.67 kB min+gzip, capped at 1.75
([ADR-0017](0017-size-budgets.md), second amendment of 2026-09-24).

**10. Tests compiled just in time, with no CLI and no compiler plugin.** `@angular/compiler` is the
first import of the harness and of each Angular test file (`src/angular/angular-harness.ts:21`), so
it is evaluated before the partially compiled `@angular/common` asks for it. Components are
`Component(meta)(class)` with no decorator syntax, through `define`, which adds a host attribute so
that two definitions from one factory do not collide (NG0912) (`:194-197`). State reaches them
through signals, since plain JIT does not wire signal inputs. The harness asks for zoneless change
detection, which Angular 20 does not default to, and fails any test during which a warning or an
error is printed (`:49-55`). The browser project pre-bundles the Angular packages
(`vitest.config.ts`, `:51-61`). No tsconfig change.

## Consequences

- A `feat`: it shipped in the minor `0.3.0` on 2026-09-26.
- CI gains an eleventh check, from a ninth job.
- No template syntax: no `<snav-provider>` tag and no `[snavIntent]` directive. `within` is passed
  as `inject(ElementRef)`, which `docs/en/angular.md` shows.
- A component's `providers` build nothing until something asks, which is the one rule this adapter
  adds to React's, Vue's and Svelte's.
- A route's system lives as long as the route's injector. The router keeps a route's injector after
  navigating away unless its `RouteReuseStrategy` says otherwise, and destroying the application
  does not destroy it.
- On 20.0.0 to 20.1.6, a destroyed provider's `afterRenderEffect` stays linked to the signals its
  options read until those signals are collected; nothing it holds runs again. 20.1.7 fixed it
  (#63001), and the floor suite is green either way.
- The adapter uses a deprecated token, `ENVIRONMENT_INITIALIZER`; if Angular removes it, the
  environment case needs another hook and the component rule stays.
- The React, Vue and Svelte lines did not move: 1 452, 1 434 and 1 481 bytes.
- The test components' templates are not type-checked: JIT compiles them at run time.
- CI runs the suite zoneless only. Under Zone.js, an application started with `createApplication`
  and a component attached later can build its system in a change detection that rendered nothing,
  so that component's first render already sees it; `bootstrapApplication` does not.

## Alternatives considered

| Option | Why not |
|---|---|
| Partially compiled directives, built by ng-packagr | ng-packagr 22.2.1 and `@angular/compiler-cli` 22.2.0 peer `typescript` `>=6.0 <6.1`, and TypeScript 7.0.2 exports no classic compiler API; a second build pipeline in the Angular package format beside tsdown, its exports map, `publint`, `attw` and the size lines; a `tslib` runtime dependency, which ngxtension 7.3.1 carries; and a floor tied to the version it is compiled with. |
| Analog's `fastCompile` in partial mode | `@analogjs/vite-plugin-angular` 2.7.4 imports `typescript` and `@angular/compiler-cli`, the same TypeScript conflict; it is a Vite plugin, not a tsdown one; and publishing a library through its partial mode is not verified. |
| No adapter, and a recipe over the core or `/auto` | Fails the parity gate, and every consumer re-implements the build after the first render, the server guard and the teardown. |
| `makeEnvironmentProviders`, or `provideEnvironmentInitializer` | Both return `EnvironmentProviders`, which a component's `providers` reject with NG0207. |
| `APP_BOOTSTRAP_LISTENER` as the start-up hook | Not deprecated, and called only by `ApplicationRef.bootstrap`: swapped in for the initializer, three cases failed, the route-like injector and the two on-screen keyboard cases, whose applications are created without a bootstrap. |
| A floor of 19 | `DOCUMENT` is not in `@angular/core` before 20, so `@angular/common` would become a second peer; `effect` is developer preview and `afterRenderEffect` experimental in the 19.2 typings; and 19 is out of support. |
| A floor of 21 | Drops a major that is in long-term support until 2026-11-28, for no API the adapter uses. |
| `TestBed`, the CLI's unit-test builder or Analog for the tests | The builder peers TypeScript 6.0 and needs an `angular.json`; plain JIT runs in the existing Vitest projects. |

## Evidence

- Code: `src/angular/angular.ts`, anchors above; `src/internal/scope-registry.ts` (`openOn`,
  `register`, `release`, `reopen`); `tsdown.config.ts`, `:17`, `:36`, `:52` (entry, external,
  subpath); `package.json`, `:34`, `:50`, `:57`, `:95` (export, peer, optional, devDependency).
- Tests, `src/angular/angular.browser.test.ts`: 37 cases of its own and
  `runAdapterParitySuite(parity)` at `:1143`, 16 cases, among them "builds a system at bootstrap
  when nothing injects anything, for a plugin and no scope" (`:325`), "builds one in an environment
  injector created the way a route's is" (`:333`), "opens a child projected into its parent before
  its parent" (`:432`), "re-opens a scope in its place when a signal it was given for trapped
  changes" (`:639`), "moves a radio group mounted with its dialog, both passing their ElementRef"
  (`:803`) and "lets a real ArrowDown check the next radio through injectIntent" (`:917`).
  `src/angular/angular.test.ts:75` and `:120`, server renders with `renderApplication` in Node,
  whose document getter throws and is never called.
- Red first, 2026-09-24, `bun x vitest run --project browser src/angular` and `--project unit`:
  with no adapter both files fail to import and run no test; against a stub that does nothing, 47 of
  53 browser cases and 1 of 2 unit cases fail.
- Sabotage, 2026-09-24, same commands: registering in the constructor instead of after the render,
  dropping the post-order sort, re-opening in reverse on a rebuild, dropping the re-open on a
  rebuild, comparing plugins by identity, dropping the release, ignoring `within`, building in the
  factory, dropping the options dedupe and dropping the initializer turned the browser file red
  with 7, 6, 7, 11, 1, 2, 4, 12, 2 and 4 failures; building in the factory also failed both unit
  cases, and warning at injection time failed one browser and one unit case.
- Green, 2026-09-24: `bun run test` → 577 passed, 1 skipped (578) in 32 files; `bun run test:unit`
  → 121 passed in 14 files; `bun run test:browser` with `SNAV_BROWSER` at chromium, firefox and
  webkit → 456 passed, 1 skipped in 18 files each. After deleting `node_modules/.vite` and
  `.vitest`, the browser project passed cold, and passed cold again with the pre-bundled list
  emptied: this harness loads no `@angular/*/testing` entry, which is what re-optimised mid-run and
  loaded two copies of `@angular/core` (NG0201) in a spike of the same day that used `TestBed`.
  An environment injector created from the application's, as a route's is, outlived
  `ApplicationRef.destroy()` with its system still listening: two later cases found
  `data-snav-input` still set until the harness destroyed that injector itself.
- Floor, 2026-09-24, on a `git archive` copy: `bun install --frozen-lockfile`, the job's `bun add
  --dev` line at 20.0.0, then `bun run typecheck` green, `bun run test:unit` → 121 passed and
  `SNAV_BROWSER=chromium bun run test:browser` → 456 passed, 1 skipped. The same lines at 19.2.25,
  the latest 19: the typecheck fails with TS2305 "Module '"@angular/core"' has no exported member
  'DOCUMENT'" at `src/angular/angular.ts(19,3)`, TS2322 at `(86,16)`, and TS2724 on
  `provideZonelessChangeDetection` in the harness and the unit file; the unit cases fail with
  "provideZonelessChangeDetection is not a function"; the browser file fails to import, "does not
  provide an export named 'DOCUMENT'"; and Node importing the built `dist/angular/angular.js`
  throws "The requested module '@angular/core' does not provide an export named 'DOCUMENT'".
- #63001, 2026-09-24: a provider whose getter read a signal, destroyed with its application, left
  that signal with one live consumer on 20.0.0 and none on 22.2.0, which had one while mounted.
  The fix is commit `322042c5b3`, "destroying the effect on `afterRenderEffect`", listed under
  20.1.7 in the CHANGELOG below.
- Version facts, fetched 2026-09-24: `bun info @angular/core` gives 22.2.0 as latest, published
  2026-09-23, 20.0.0 on 2025-05-28 and 19.2.25 as `v19-lts`;
  https://angular.dev/reference/releases gives 20 in long-term support until 2026-11-28 and 19 and
  older as unsupported; https://angular.dev/reference/versions gives TypeScript `>=6.0.0 <6.1.0`
  for 22.0; https://angular.dev/tools/libraries/creating-libraries requires partial compilation and
  an application Angular "the same or greater" than a library's;
  https://raw.githubusercontent.com/angular/angular/main/CHANGELOG.md lists "move DOCUMENT token
  into core" (#60663) and the rename of `provideExperimentalZonelessChangeDetection` under 20.0.0,
  #63001 under 20.1.7, `BootstrapContext` for the server bootstrap under 20.3.0, and the zoneless
  default under 21.0.0. In the `@angular/core` tarballs, `effect` is `@developerPreview` and
  `afterRenderEffect` `@experimental` in 19.2.0, and `@publicApi` in 20.0.0 with the callback form
  of `afterNextRender`; in 22.2.0, `ENVIRONMENT_INITIALIZER` is "@deprecated from v19.0.0",
  `provideEnvironmentInitializer` wraps it (`fesm2022/_pending_tasks-chunk.mjs`, lines 896 to 902),
  NG0207 is thrown for `EnvironmentProviders` in a component (the same file, line 537), and
  `APP_BOOTSTRAP_LISTENER` is read only in `ApplicationRef`'s `_loadComponent`, called from
  `bootstrap` (`fesm2022/_debug_node-chunk.mjs`, lines 13189 to 13225 and 13349 to 13361).
  `@angular/router` 22.2.0 creates a route's injector with `createEnvironmentInjector` in
  `getOrCreateRouteInjectorIfNeeded` and destroys one only when
  `RouteReuseStrategy.shouldDestroyInjector` says so, in `destroyUnusedInjectors`
  (`fesm2022/_router-chunk.mjs`, lines 2764 to 2769 and 4161 to 4181).
  `bun info` for `ng-packagr` 22.2.1, `@angular/compiler-cli` 22.2.0 and `@angular/build` 22.2.0
  gives the peer `typescript` `>=6.0 <6.1`, and for `ngxtension` 7.3.1 the dependency `tslib`
  `^2.3.0`; the `typescript` 7.0.2 manifest maps `.` to `lib/version.cjs` and the rest to
  `./unstable/*`; in the `@analogjs/vite-plugin-angular` 2.7.4 tarball, 14 files import
  `typescript`, 4 import `@angular/compiler-cli`, and `fastCompileMode` is `'full' | 'partial'`.
- Zone.js, 2026-09-24, on a scratch copy with `zone.js` 0.16.3 added and the harness on
  `provideZoneChangeDetection()`, Angular 22.2.0, chromium: 50 of the 53 browser cases passed. The
  three others, "builds exactly one system, and not during the first render", "renders once with
  no system, then builds one after the first render and hands it down" and "answers a scope opened
  while the component is constructed, before the system exists", found the system built before the
  component's first render, by a change detection Zone.js ran between `createApplication` and the
  harness's `createComponent`. Started with `bootstrapApplication`, the first render saw no system,
  with the provider at application and at component level.
- Real page, 2026-09-24: a temporary page served by `bun x vite <dir> --port 5193 --strictPort`,
  compiled just in time, with `provideNav` and `spatialPlugin({ mode: "app" })` given to
  `bootstrapApplication`, four buttons and a dialog opened by the last with `trapped` and `within`
  its `ElementRef`, holding a radio group that answers `"native"` on its vertical axis and an OK
  button to its right. Real keys from Playwright, on chromium, firefox and webkit alike: Tab, then
  ArrowDown and ArrowUp moved between the buttons, Enter opened the dialog on the checked radio,
  ArrowDown checked `m` then `l` and ArrowUp `m` again with the focus following, ArrowRight moved to
  OK with `m` still checked, ArrowDown and ArrowUp from OK moved to a radio inside the dialog and
  never to the buttons above it, and Escape closed the dialog and the focus went back to its button.
  No console warning or error on any engine.
