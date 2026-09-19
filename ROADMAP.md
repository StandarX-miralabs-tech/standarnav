# Roadmap

Status: unreleased. standarnav is being extracted from the input system of miralabs-ui
(`packages/core/src/input`, read-only source at commit `289fa607`, read on 2026-09-18). Nothing is
published on npm, nothing has been run on a television, and no demo exists yet.

v0 is one goal only: the extracted package behaves exactly like the engine it comes from, under new
names, with the tests that prove it. v1 is the API freeze plus the other framework adapters.
Anything that needs a number first is marked "measure first" and stays unchecked until the
measurement is recorded with its command and date.

## How this file is maintained

- An item is checked only when a commit or a pull request link is written next to it.
- An item that depends on a measurement says "measure first"; it cannot be checked by an opinion.
- New work is added to the section it belongs to, never silently retitled.
- The scaffold items already checked were created by the initial commit
  [6e98da5](https://github.com/StandarX-miralabs-tech/standarnav/commit/6e98da5) of 2026-09-18.

## v0: extraction and parity with miralabs-ui

### Repository scaffold

- [x] MIT LICENSE, copyright Wesley Cormier
- [x] `package.json` with the `@standarx/nav` name and provenance publishing; its exports map is still
      limited to `./package.json` and gains the subpaths when `src/` exists (`package.json`, read
      2026-09-18)
- [x] `tsconfig.json` (target es2020 with `lib: ["es2020", "dom", "dom.iterable"]`,
      `isolatedDeclarations`, `noEmit`; read 2026-09-18). `WeakRef` and `Array.prototype.at` are
      type errors under that `lib` unless they are declared locally behind a feature check, which is
      what [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md) asks for
- [x] `biome.json`, with `@biomejs/biome` 2.5.14 in `package.json` (read 2026-09-18). The source
      repository pins 2.5.10 (root `package.json` of miralabs-ui, read 2026-09-18), so the two
      repositories are not on the same version
- [x] Vitest configuration with two projects: `unit` in node and `browser` on a single Playwright
      engine per local run, selected with `SNAV_BROWSER` and defaulting to chromium
      (`vitest.config.ts:8-9`, read 2026-09-18); the three engines run as a CI matrix, not in one
      local run
- [x] `tsdown` build configuration (ESM only, unbundle, dts, exports map rewritten from the entry
      list; `tsdown.config.ts`, read 2026-09-18)
- [x] CI workflow: lint, typecheck, build with a drift gate followed by the package check and the
      size budgets, unit tests, and a browser matrix of chromium, firefox and webkit
      (`.github/workflows/ci.yml`, build job at `:33-49`, browser matrix at `:61-83`, read
      2026-09-18)
- [x] `scripts/size-budget.ts` (initial scaffold, 2026-09-18): six lines — core, gamepad engine,
      spatial engine, focus ring, debug, whole package — each built with Bun, minified, then gzipped
      at Bun's default level. The four subpath lines keep their siblings `../*` and `../../*`
      external, the debug line keeps `./*` external, and the whole-package line bundles the four
      runtime entries once with nothing external. Every cap is `null` today, so the run reports each
      measurement and fails ([ADR-0017](docs/adr/0017-size-budgets.md)); it also fails with a clear
      message when `dist/` is missing
- [x] `scripts/check-package.ts` (initial scaffold, 2026-09-18): `bun pm pack` into a temporary
      directory, then publint and attw `--profile esm-only` on the tarball; it fails if the package
      is marked private
- [x] `check:size` and `check:package` entries in `package.json` (initial scaffold, 2026-09-18),
      called by the build job of CI (`.github/workflows/ci.yml:47` and `:49`)
- [x] `dev` script (`vite playground --open`) and the playground fixture page (initial scaffold,
      2026-09-18): rail, grid and plain markup fixtures, with the engine not wired in yet because
      `src/` does not exist
- [x] `bun.lock` committed, with the development dependencies installed at their latest published
      versions on 2026-09-18 (initial scaffold)
- [x] Renovate configuration, `renovate.json` (initial scaffold, 2026-09-18). The Renovate GitHub
      App is not installed on the organisation yet; see the owner actions below
- [x] `.gitignore` covering build output, agent tooling and uncommitted local working notes
- [x] Governance files: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and pull request templates
- [x] ADRs 0001 to 0019, with their format and index in
      [docs/adr/README.md](docs/adr/README.md)
- [x] [docs/specification.md](docs/specification.md), the module-by-module description of the engine
- [x] This roadmap
- [x] First journal entry, [docs/journal/2026-09-18.md](docs/journal/2026-09-18.md)

### Source extraction

- [ ] Move the input system into `src/` with the planned layout: `src/index.ts`, `src/types.ts`,
      `src/intent-bus.ts`, `src/input-system.ts`, `src/keymap.ts`, `src/engage.ts`,
      `src/modality.ts`, `src/tabbable.ts`, `src/dom/*.ts`, `src/gamepad/*.ts`, `src/spatial/*.ts`
      `src/focus-ring/*.ts`, `src/debug.ts`. `debug.ts` is hoisted out of `spatial/`, where the
      source keeps it. There is no `src/invariant.ts` and no `src/utils/`: see the prefix item below
- [ ] Rename read attributes to `data-snav="container"`, `data-snav-enter`, `data-snav-wrap`,
      `data-snav-block`, `data-snav-trap`, `data-snav-scroll`, `data-snav-ignore`,
      `data-snav-up/down/left/right`
- [ ] Rename written attributes to `data-snav-focused`, `data-snav-active`, `data-snav-input`,
      `data-snav-focus-ring` (the source writes `data-focused` and `data-nav-active` unprefixed)
- [ ] Rename the CSS custom properties to `--snav-focus-ring-*`. Three names in one file here: the
      plugin reads `offset`, `duration` and `easing` and nothing else
      (`focus-ring.ts:84`, `:112`, `:115`). The source-side family is a separate and much larger
      decision that does not travel with this extraction — see step 3 of
      [ADR-0004](docs/adr/0004-relationship-with-miralabs-ui.md)
- [ ] Replace `WeakRef` (used for per-container focus memory) with a feature-detected fallback:
      strong reference validated with `isConnected` — see
      [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md). This is a `lib` coverage and
      best-effort-tier fix, not a supported-tier one: `WeakRef` is Chromium 84 / Safari 14.1 /
      Firefox 79, inside the supported tier but below the es2020 parsing floor the same ADR
      declares. Keeping `lib` at `es2020` is what stops the fallback being deleted as dead code
- [ ] Rewrite `tabbables.at(-1)` as index arithmetic (source `focus/tabbable.ts:85`, read
      2026-09-18) — **mandatory, and a runtime break rather than a typing detail**.
      `Array.prototype.at` is Chromium 92 / Safari 15.4 / Firefox 90, *above* the supported tier, so
      it throws on Chromium 85-91, Safari 15.0-15.3 and Firefox 79-89, and `getTabbableEdges` is the
      entry point for `getFirstTabbable` and `getLastTabbable`. Under `noUncheckedIndexedAccess` the
      indexed read is already `HTMLElement | undefined`, so the existing `?? null` keeps the tuple
      type with no cast. See [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md)
- [ ] Split `types.ts` into the types each entry point actually needs: five names survive —
      `InputModality`, `IntentSource`, `NavigationIntent`, `IntentEvent`, `Rect`. `Orientation`,
      `Density`, `MotionMode` and `EnvironmentContext` have no use in the perimeter, and neither has
      `Direction`: an earlier count of six occurrences was an artefact of grepping `dom/*.ts`, which
      is not extracted. The RTL policy therefore stays entirely on the far side of the boundary
- [ ] Strip the `[miralabs]` prefix from the one invariant message, and port no invariant module.
      `invariant` is called exactly once in the whole perimeter
      (`input-system.ts:17` imports it, `:73` calls it) and `warn` not at all, so the 11-line
      `utils/invariant.ts` becomes an inlined `throw` at that single site and a deleted import — not
      a file to move and not a sweep to run
- [ ] Settle the focus-ring scope for v0 — inline default tokens in the plugin, a small optional
      stylesheet, or focus-ring out of v0 — then implement the answer. The source reads its colours,
      width, radius and z-index from `packages/styles/scss/components/_focus-ring.scss`, which stays
      in miralabs-ui, so a plugin published without defaults draws an invisible ring. Open question
      of [ADR-0004](docs/adr/0004-relationship-with-miralabs-ui.md)

### Tests

- [ ] Port **188 test cases across 16 files** and make them green on chromium, firefox and webkit.
      The 160 of `packages/core/src/input` reproduce exactly by
      `grep -cE "^\s*(it|test)\("` over its twelve test files (2026-09-18), but that census
      undercounts the port, because two modules of the planned layout have their tests outside that
      tree. Derivation: 160 (`input/`) + 5 (the `describe("tabbable")` block of
      `focus/focus.browser.test.ts`, a 17-case file whose other 12 cover `trapFocus` and
      `proxyTabFocus` and stay behind) + 9 (the `trackInputModality` block of
      `interaction/interaction.browser.test.ts`, a 31-case file) + 6 (`interaction/modality.test.ts`,
      a clean move) + 8 (the portable subset of `dom/dom.browser.test.ts`, a 22-case file over seven
      describe blocks, of which 12 cover this group and 8 survive the narrowing: all 4 query cases,
      2 of 3 event cases, 1 of 4 raf cases and the platform case, once `query`, `isModifiedEvent`,
      `isPrimaryPointer`, `rafs`, `nextTick`, `timeout` and the seven user-agent sniffs are left
      behind as unimported by the perimeter). All 188 stay tests, the geometry timing guard
      included: `vitest` 5.0.1 exports no `bench`, so no benchmark file is ported and the guard is
      the only performance gate v0 has. They run through the real input system; a fake host is kept
      for the plugin contract alone ([ADR-0018](docs/adr/0018-testing-strategy.md))
- [ ] Nested containers, the largest hole and the one this list did not have: the whole 25-case
      spatial browser suite holds exactly two containers, `#left` and `#right`, and they are
      siblings (`spatial.browser.test.ts:169-179`, read 2026-09-18). So `childContainerOf`
      (`spatial.ts:111-120`), the container-scored-as-one-unit rule (`.../spatial.ts:142`, where
      `isContainer` has been `false` in every case that has ever run) and the recursive descent of
      `enterContainer` (`.../spatial.ts:305-307`) have never executed. A rail inside a row inside a
      page is the ordinary television layout. Four cases: enter a nested container as one scored
      unit, bubble out through the outer container to a sibling, `data-snav-enter="first"` on the
      inner, and a three-level nest to reach the recursive branch
- [ ] Write the scroll-and-rescan test (source `spatial.ts:327-351`, one frame via `raf` with a
      `rescanning` lock). Untested in the source: a grep for `rescan` over
      `packages/core/src/input/spatial/spatial.browser.test.ts` returned no match on 2026-09-18.
      **The fixture must be virtualised**, and a tall scroller will not do: `collectNavNodes`
      (`spatial.ts:128-146`) applies no viewport filter — it rejects only `[data-snav-ignore]` and a
      rect that is zero on *both* axes — so a merely scrolled-out-of-view button is still a
      candidate and `findBestCandidate` finds it without ever reaching the rescan branch. Only a
      fixture whose next row does not exist in the DOM until the scroll fires exercises it
- [ ] Write the `pointerFollowsFocus` test (default on in `app` mode). Untested in the source: a grep
      for `pointerFollowsFocus` over the same file returned no match on 2026-09-18
- [ ] Write the `data-snav-scroll="center"` test. The source attribute is `data-mira-nav-scroll`
      (`containers.ts:16`) and no test names it: a grep for `nav-scroll` over the `*.test.ts` files of
      `packages/core/src` returned no match on 2026-09-18
- [ ] Write the debug parity test, **scoped**. `explainMove` re-implements the winner rule instead
      of sharing it with `findBestCandidate`, and no test names it today: a grep for `explainMove`
      over the `*.test.ts` files of `packages/core/src` returned no match on 2026-09-18. But "assert
      both agree" as previously phrased here produces a test that fails on correct code.
      `explainMove` scores exactly one container (`debug.ts:48-52`, no loop) while the engine walks
      out through up to `MAX_CONTAINER_DEPTH` containers (`spatial.ts:371-390`) and may take a
      redirect (`:362-366`), wrap (`:379-382`) or scroll and rescan (`:384`) first; it also defaults
      its root to the origin's `ownerDocument.body` where the plugin uses its own root
      (`spatial.ts:217`), and defaults its score options where the engine passes the plugin's. So:
      assert agreement over a flat single-container fixture, passing the plugin's own root and score
      options, and add named cases for the three divergences that are correct — bubbling, redirect
      and wrap. The two rules are otherwise provably equivalent, so the test pins a real invariant
      rather than a coincidence
- [ ] Write the right-stick horizontal scroll test. The gamepad side emits `scrollX`
      (`gamepad.browser.test.ts:192-193` sets the axes and steps a frame; `:196` is the assertion on
      the emitted intent), but the spatial side has cases for `scrollY` only
      (`spatial.browser.test.ts:333-383` — four cases opening at `:333`, `:350`, `:360` and `:376`,
      the last assertion at `:382`, the describe closing at `:384`; read 2026-09-18). Both citations
      were wrong in an earlier revision of this file; the convention adopted while fixing them is
      that a range naming a test case includes its closing assertion, and a citation of where
      something is emitted points at the emit rather than at the assertion about it
- [ ] Write the zero-size filter test: the source filters on `width === 0 && height === 0`
      (`spatial.ts:141`, read 2026-09-18), so a 0 x 40 element stays a candidate. Change (C1) of
      [ADR-0009](docs/adr/0009-hidden-candidates.md) proposes `||` instead, and is still Proposed, so
      the fixture pins today's behaviour first
- [ ] Fixture: clickable `div` without `tabindex`. The behaviour is already decided — such an element
      is not in `FOCUSABLE_SELECTOR`, so it is never a candidate
      ([ADR-0009](docs/adr/0009-hidden-candidates.md),
      [ADR-0005](docs/adr/0005-real-dom-focus.md)) — and the fixture pins it
- [ ] Fixture: candidate inside a shadow root. It ships skipped and documented, as the acceptance
      test of any later traversal work ([ADR-0008](docs/adr/0008-shadow-dom.md)); the source is light
      DOM only by explicit choice
- [ ] One fixture per line of the gap table of [ADR-0009](docs/adr/0009-hidden-candidates.md):
      `opacity: 0`, `clip-path`, overflow-clipped candidates, candidates outside the scroller's
      viewport, and `visibility: hidden` on the fallback path. Changes (C1) and (C2) wait on the
      owner's confirmation; the other rows pin the inherited behaviour
- [ ] Fixtures for the inherited hard limits: container depth 16 (`spatial.ts:55`), `MAX_PADS = 4` and
      `MAX_BUTTONS = 20` (`gamepad/gamepad.ts:43-44`), all read in the source on 2026-09-18
- [ ] Fixture for the `WeakRef` fallback path: the strong reference validated with `isConnected`
      needs a run of its own ([ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md))
- [ ] Find a benchmark runner, then write both benchmarks. `vitest` 5.0.1 exports no `bench`, so
      the inherited `geometry.bench.ts` is not ported and neither benchmark exists yet. Until one
      does, the only performance gate is the median-of-51 guard in `geometry.test.ts`, and it
      measures `findBestCandidate` alone — not `collectNavNodes`, `getBoundingClientRect`,
      `querySelectorAll` or `checkVisibility`
- [ ] Add a second benchmark covering an end-to-end move, so the blind spot above is measured rather
      than described; every figure it prints records the machine, the browser and the date
      ([ADR-0018](docs/adr/0018-testing-strategy.md))
- [ ] Decide whether the timing guard inherited from the source (`geometry.test.ts:156-177`, median
      of 51 samples) belongs in CI, where machine variance is not controlled — measure first

### Tooling and budgets

- [ ] Dev-mode diagnostics in the `@standarx/nav/debug` subpath, excluded from the default build
      ([ADR-0010](docs/adr/0010-dev-mode-diagnostics.md)). **Only one of the five deliverables that
      ADR names has a source file.** `packages/core/src/input/spatial/debug.ts` is 73 lines
      (`wc -l`, 2026-09-18) exporting `SpatialExplanation`, `explainMove` and a type re-export, and
      it writes no DOM at all — a grep for `createElement`, `appendChild` and `style` over that file
      returns nothing. `scanUnreachable`, the `MAX_CONTAINER_DEPTH` saturation warning, the dead
      redirection warning and the printed documentation note are new code with no port behind them,
      and open detail (O1) of that ADR — whether the `cursor: pointer` signal is opt-in or opt-out —
      is still unanswered. Whether they are v0 or v1 is an owner decision, and it is the only v0
      line in this file with no source file behind it. The hosted-playground line below inherits the
      same problem: there is no debug overlay to switch on, because the overlay lived in the
      monorepo's documentation site, not in `debug.ts`
- [ ] Run `bun run check:size` on a real `dist/` and write the caps it prints — measure first. Every
      cap in `scripts/size-budget.ts` is `null` today, so the run fails by design until the numbers
      exist ([ADR-0017](docs/adr/0017-size-budgets.md)). The script here covers JavaScript only; the
      equivalent in miralabs-ui is 2006 lines (`wc -l`, 2026-09-18), about half of it about CSS.
      Inherited figures from `bun run check:size` in miralabs-ui on 2026-09-18, dist built the same
      day, externals `../*` and `../../*`: input system 1.93 kB, gamepad 2.35 kB, spatial 2.81 kB,
      modality 0.74 kB. Reported but not re-measured: spatial without externals 3303 B. These are
      the source repository's numbers, not standarnav's
- [ ] Confirm the scope of each budget line once the caps exist: the four subpath lines are measured
      with their siblings external, so their numbers are a marginal cost, and the whole-package line
      is the figure a consumer of everything pays
- [ ] CI green on every job, on a runner that can actually start. `bun run lint` and
      `bun run typecheck` pass on the scaffold (2026-09-18); `bun run build`, `bun run test:unit`
      and the two build-job checks fail until `src/` exists, so CI stays red until the first
      extraction commit. The source repository's own runs fail for billing
      (`gh run list -R miralabs-tech/miralabs-ui --limit 8`, 8 failures, 2026-09-18)

### Documentation and demo

- [x] [README.md](README.md) with the read and written `data-snav-*` attribute tables
- [x] [docs/research/competitors.md](docs/research/competitors.md), 20 fact sheets verified on
      2026-09-18 and reconciled into 18 distinct projects, each figure carrying the date it was read
- [x] README comparison table, with the full verified table linked from it
- [x] [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md), the
      browser and TV runtime versions with their vendor URLs, fetched 2026-09-18
- [x] [docs/research/name-availability-2026-09-18.md](docs/research/name-availability-2026-09-18.md),
      the 48 candidates, their verbatim probes and the judge panel of 2026-09-18
- [ ] README: recorded GIF of a real navigation session
- [ ] Demo video and GIF rendered with Remotion, the React-based programmatic video renderer: one
      composition drives the playground fixtures with scripted intents and exports an MP4 for the
      documentation and a GIF for the README. Decided as a v0 item on 2026-09-18, not started; it
      needs the engine wired into the playground first
- [ ] Hosted playground with the debug overlay switched on. The fixture exists at
      `playground/index.html`, served by `bun run dev`, but the engine is not wired into it because
      `src/` does not exist yet

### First adapter and publication

- [ ] React adapter in `src/react/` — the only adapter that exists in the source
      (`packages/react/src/input.tsx`, 209 lines, read 2026-09-18), with its dependency on the
      design-system `useDocument()` removed
- [ ] Write the React adapter suite. The source has no test file dedicated to
      `packages/react/src/input.tsx`: the provider is only exercised through other test files
      (8 cases in `packages/react/src/components/gamepad.browser.test.tsx` and 16 in
      `packages/react/src/primitives.browser.test.tsx`, of which the provider and modality cases
      touch the adapter, counted on 2026-09-18), so the adapter parity suite of
      [ADR-0018](docs/adr/0018-testing-strategy.md) is written here rather than ported, and
      it covers scope unmount order
- [ ] First npm publication of a 0.x version with provenance, once CI is green and the package check
      passes
- [ ] Record the published size from the registry after that publication — measure first

### miralabs-ui migration ([ADR-0004](docs/adr/0004-relationship-with-miralabs-ui.md))

- [ ] Branch in miralabs-ui, no work on its default branch
- [ ] Replace the internal imports with `@standarx/nav` subpaths, including the value imports
      `pushEngageScope` and `isTextEntryTarget`
- [ ] Rename the attributes emitted by the components that emit `data-mira-nav*`: 14 component
      directories, from `grep -rl "data-mira-nav" packages/core/src/components --include=*.ts` with
      the test files removed, run in miralabs-ui on 2026-09-18
- [ ] Rename the SCSS selectors reading `data-mira-input`: 9 files, from
      `grep -rl "data-mira-input" packages/styles --include=*.scss`, run in miralabs-ui on 2026-09-18
- [ ] Delete `packages/core/src/input` once nothing imports it
- [ ] Run the full miralabs-ui suite as the safety net, and keep its result in the pull request
- [ ] Decide where `_focus-ring.scss` lives after the migration

### Device verification

- [ ] One real television verified, Tizen or webOS, with a dated device report: model, firmware,
      Chromium version, what worked, what did not
- [ ] One gamepad verified on desktop with a dated report: pad model, browser, mapping observed
- [ ] Publish both reports under `docs/` so later claims can point at them

### Owner actions outside the repository

These are not code changes; nobody else can do them.

- [ ] Install the Renovate GitHub App on the organisation. `renovate.json` is committed, but
      `gh api /orgs/StandarX-miralabs-tech/installations` returned zero installations on 2026-09-18,
      so nothing reads that configuration yet
- [ ] Check GitHub Actions billing on the account that carries the organisation, before this
      repository relies on a public CI. The source repository's last eight runs were refused with
      "The job was not started because recent account payments have failed or your spending limit
      needs to be increased." (`gh run list -R miralabs-tech/miralabs-ui --limit 8`, 2026-09-18)
- [ ] Decide between changesets and release-please for version bumps and release notes, the open
      rider of [ADR-0012](docs/adr/0012-versioning-and-release.md). Until one is wired, the pull
      request description carries the user-facing sentence of the change

### Success metrics

- [ ] Record the first external user, with the issue or repository link
- [ ] Record the first third-party issue that is not from the owner
- [ ] Record weekly downloads with the command and date used to read them, once published — measure
      first; before the first publication this number does not exist

## v1

- [ ] Freeze the public API: entry points, attribute names, option names, event payloads
- [ ] Write the deprecation policy that the freeze implies
- [ ] Vanilla auto-mount helper: build the containers from the attributes with no framework
- [ ] Vue adapter, on the same browser test suite
- [ ] Svelte adapter, on the same browser test suite
- [ ] Angular adapter, on the same browser test suite
- [ ] SSR and hydration guard: no DOM access at import time, no attribute written before mount
- [ ] Full `docs/en`, with a strict file-by-file `docs/fr` mirror
- [ ] CI gate that fails when a `docs/en` page has no `docs/fr` mirror
- [ ] Legacy build decision for the 2020-2021 television runtimes, on the date
      [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md) proposes, 2026-12-31: the
      es2020 output does not parse on Chromium below 80, and Tizen 5.5/6.0 are Chromium 69/76,
      webOS 5/6 are Chromium 68/79 (Samsung "Web Engine Specifications" and LG "Web API and Web
      Engine", fetched 2026-09-18; the full table with its URLs is in
      [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md))
- [ ] Second device family verified with its own dated report

## Later

- [ ] Shadow DOM traversal: the source is light DOM only by an explicit choice documented in
      `focus/tabbable.ts:10-11`; a shadow-aware `contains` already exists in the source but is unused.
      The steps and their cost are in [ADR-0008](docs/adr/0008-shadow-dom.md)
- [ ] Vidaa and Vizio remote key codes, added only once a device report exists — no public
      documentation of their runtime versions was found on 2026-09-18
- [ ] Other TV platforms not in the default keymap today: Roku, Fire TV, Android TV
- [ ] Focus ring positioned with CSS anchor positioning instead of a WAAPI overlay, once the baseline
      allows it
- [ ] Revisit `MAX_CONTAINER_DEPTH`, 16 in the source (`spatial.ts:55`, read 2026-09-18), if a real
      layout ever hits it — measure first
