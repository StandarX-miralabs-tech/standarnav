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
- [x] `package.json` with the `@standarx/nav` name and provenance publishing. Its exports map was
      limited to `./package.json` on 2026-09-18 and gained the subpaths as the entry points landed:
      it now carries `.`, `./debug`, `./focus-ring`, `./gamepad`, `./react`, `./spatial` and
      `./package.json` (`package.json:32-40`, read 2026-09-20). tsdown rewrites that map from the
      entry list, and the build job's `git diff --exit-code` is the gate against it drifting from
      what is committed
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
      size budgets, unit tests, a React peer-floor job, and a browser matrix of chromium, firefox
      and webkit (`.github/workflows/ci.yml:13`, `:23`, build job at `:33-49`, `:51`, react-floor at
      `:66-92`, browser matrix at `:94-120`, read 2026-09-20). The react-floor job is newer than the
      scaffold: it installs `react@^18.3.1` over the lockfile's 19 and re-runs typecheck plus the
      chromium browser project against the peer range the package declares
- [x] `scripts/size-budget.ts` (initial scaffold, 2026-09-18): six lines — core, gamepad engine,
      spatial engine, focus ring, debug, whole package — each built with Bun, minified, then gzipped
      at Bun's default level. Each engine line keeps its siblings external so its number is the
      marginal cost of adding that engine next to the core, and the whole-package line bundles the
      runtime entries once with nothing external. Every cap was `null` on 2026-09-18, so the run
      reported each measurement and failed. **No longer true on both counts**: the react adapter
      gained a seventh line the same day the first measurement landed, no cap is `null` any more,
      and the wildcard externals this line described were replaced by an explicit list per line
      after `../*` proved to externalise the wrong files — the debug line is now measured beside the
      spatial engine, with `./spatial/spatial.js` and `./spatial/geometry.js` external
      (`scripts/size-budget.ts:105-111`, read 2026-09-20). See the
      tooling-and-budgets entry below for the caps themselves, and
      [ADR-0017](docs/adr/0017-size-budgets.md)'s 2026-09-19 and 2026-09-20 amendments for the
      numbers. The script still fails with a clear message when `dist/` is missing
- [x] `scripts/check-package.ts` (initial scaffold, 2026-09-18): `bun pm pack` into a temporary
      directory, then publint and attw `--profile esm-only` on the tarball; it fails if the package
      is marked private
- [x] `check:size` and `check:package` entries in `package.json` (initial scaffold, 2026-09-18),
      called by the build job of CI (`.github/workflows/ci.yml:47` and `:49`)
- [x] `dev` script (`vite playground --open`) and the playground fixture page (initial scaffold,
      2026-09-18): rail, grid and plain markup fixtures. Wiring was left commented out on
      2026-09-18 because `src/` did not exist yet; it does now, and the engine is wired —
      gamepad, spatial in `app` mode and the focus ring all mounted on the fixtures, `explainMove`
      logged to the console rather than drawn as an overlay
      ([`playground/main.ts`](playground/main.ts), commit
      [0df4edc](https://github.com/StandarX-miralabs-tech/standarnav/commit/0df4edc),
      2026-09-20)
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

- [x] Move the input system into `src/` with the planned layout: `src/index.ts`, `src/types.ts`,
      `src/intent-bus.ts`, `src/input-system.ts`, `src/keymap.ts`, `src/engage.ts`,
      `src/modality.ts`, `src/tabbable.ts`, `src/dom/*.ts`, `src/gamepad/*.ts`, `src/spatial/*.ts`
      `src/focus-ring/*.ts`, `src/debug.ts`. `debug.ts` is hoisted out of `spatial/`, where the
      source keeps it. There is no `src/invariant.ts` and no `src/utils/`: see the prefix item below.
      Landed across the commits of this pull request, `e1c2512..HEAD` (37 commits,
      `git rev-list --count main..HEAD`, 2026-09-20), `src/` verified to hold the planned layout
      (`ls src`, 2026-09-20); e.g. commits
      [e1c2512](https://github.com/StandarX-miralabs-tech/standarnav/commit/e1c2512) (types) through
      [f29bf92](https://github.com/StandarX-miralabs-tech/standarnav/commit/f29bf92) (root entry and
      debug subpath)
- [x] Rename read attributes to `data-snav="container"`, `data-snav-enter`, `data-snav-wrap`,
      `data-snav-block`, `data-snav-trap`, `data-snav-scroll`, `data-snav-ignore`,
      `data-snav-up/down/left/right`. Verified in `src/spatial/spatial.ts` and
      `src/spatial/containers.ts`, no `data-mira-*` name left anywhere in `src/`
      (`grep -rn data-mira src`, 2026-09-20)
- [x] Rename written attributes to `data-snav-focused`, `data-snav-active`, `data-snav-input`,
      `data-snav-focus-ring` (the source writes `data-focused` and `data-nav-active` unprefixed).
      Three modules write the four: `src/spatial/spatial.ts:282` and `:287` set
      `data-snav-focused` and `data-snav-active` from the constants at
      `src/spatial/containers.ts:17-18`, `src/modality.ts:19` names `data-snav-input`, and
      `src/focus-ring/focus-ring.ts:26` names `data-snav-focus-ring` (read 2026-09-20). The teardown
      test asserts the first two come off the page again
      (`src/spatial/spatial.browser.test.ts:633-643`, the query at `:641`, 2026-09-20)
- [x] Rename the CSS custom properties to `--snav-focus-ring-*`. **The family grew while this item
      was open**: the plugin now reads six names, not three — `offset`, `duration`, `easing`,
      `color`, `width` and `z-index` (`src/focus-ring/focus-ring.ts:52`, `:106`, `:134`, `:137`,
      read 2026-09-20).
      `color` and `width` were added closing the focus-ring-scope item below; `z-index` is the
      newest, added by
      [92a5f89](https://github.com/StandarX-miralabs-tech/standarnav/commit/92a5f89) once review
      found the ring painting behind the playground's own chrome. The source-side family is a
      separate and much larger decision that does not travel with this extraction — see step 3 of
      [ADR-0004](docs/adr/0004-relationship-with-miralabs-ui.md)
- [x] Replace `WeakRef` (used for per-container focus memory) with a feature-detected fallback:
      strong reference validated with `isConnected` — see
      [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md). This is a `lib` coverage and
      best-effort-tier fix, not a supported-tier one: `WeakRef` is Chromium 84 / Safari 14.1 /
      Firefox 79, inside the supported tier but below the es2020 parsing floor the same ADR
      declares. Keeping `lib` at `es2020` is what stops the fallback being deleted as dead code.
      Verified at `src/spatial/spatial.ts:109-141` — the `WeakRefCtor` declaration at `:109-111` and
      the feature-detected `elementHandle` at `:127-141`, never `WeakRef` directly
      (read 2026-09-20); commit
      [f9279b4](https://github.com/StandarX-miralabs-tech/standarnav/commit/f9279b4)
- [x] Rewrite `tabbables.at(-1)` as index arithmetic (miralabs-ui:
      `packages/core/src/focus/tabbable.ts:85`, read 2026-09-18) — **mandatory, and a runtime break
      rather than a typing detail**.
      `Array.prototype.at` is Chromium 92 / Safari 15.4 / Firefox 90, *above* the supported tier, so
      it throws on Chromium 85-91, Safari 15.0-15.3 and Firefox 79-89, and `getTabbableEdges` is the
      entry point for `getFirstTabbable` and `getLastTabbable`. Under `noUncheckedIndexedAccess` the
      indexed read is already `HTMLElement | undefined`, so the existing `?? null` keeps the tuple
      type with no cast. See [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md). Verified
      at `src/tabbable.ts:92` — `[tabbables[0] ?? null, tabbables[tabbables.length - 1] ?? null]`,
      no `Array.prototype.at` call anywhere in `src/` (read 2026-09-20; a literal grep for `.at(`
      does return hits, but every one is the test harness's own `view.at("b")` or the explanatory
      comment at `src/tabbable.ts:89`); commit
      [ce1ccc7](https://github.com/StandarX-miralabs-tech/standarnav/commit/ce1ccc7)
- [x] Split `types.ts` into the types each entry point actually needs: five names survive —
      `InputModality`, `IntentSource`, `NavigationIntent`, `IntentEvent`, `Rect`. `Orientation`,
      `Density`, `MotionMode` and `EnvironmentContext` have no use in the perimeter, and neither has
      `Direction`: an earlier count of six occurrences was an artefact of grepping `dom/*.ts`, which
      is not extracted. The RTL policy therefore stays entirely on the far side of the boundary.
      Verified: `src/types.ts` exports exactly those five names and nothing else (read 2026-09-20);
      commit [e1c2512](https://github.com/StandarX-miralabs-tech/standarnav/commit/e1c2512)
- [x] Strip the `[miralabs]` prefix from the one invariant message, and port no invariant module.
      `invariant` is called exactly once in the whole perimeter
      (miralabs-ui: `.../input/input-system.ts:17` imports it, `:73` calls it) and `warn` not at
      all, so the 11-line
      `utils/invariant.ts` becomes an inlined `throw` at that single site and a deleted import — not
      a file to move and not a sweep to run. Verified: `src/input-system.ts:94` throws a plain
      `Error` with no `[miralabs]` prefix, and there is no `invariant.ts` and no `utils/` under
      `src/` (read 2026-09-20); commit
      [20d6849](https://github.com/StandarX-miralabs-tech/standarnav/commit/20d6849)
- [x] Settle the focus-ring scope for v0 — **settled: the plugin paints itself inline**. The source
      read its colour, width, radius and z-index from
      `miralabs-ui: packages/styles/scss/components/_focus-ring.scss`, which stays there, so a plugin
      published without defaults would draw an invisible ring. The overlay's inline style now
      carries `z-index: var(--snav-focus-ring-z-index, 1700); box-shadow: 0 0 0
      var(--snav-focus-ring-width, 3px) var(--snav-focus-ring-color, #1a73e8)`
      (`src/focus-ring/focus-ring.ts:51-52`, read 2026-09-20) — six custom properties in total
      with `offset`, `duration` and `easing`. The width fallback is 3px, not the 2px this line
      originally read, which matched nothing the source shipped; the offset fallback is 2; the z-index fallback,
      1700, is the rung the source stylesheet used, above its modal, popover, toast and tooltip.
      Showing and hiding now fade over 150ms via the Web Animations API rather than cutting in and
      out, skipped under `prefers-reduced-motion` (`src/focus-ring/focus-ring.ts:30`,
      `:147-154`). The colour
      default still measures 4.51:1 on white and 4.36:1 on `#0b0b0f`, both above the 3:1 that WCAG
      SC 1.4.11 asks of a non-text indicator. Closes the open question of
      [ADR-0004](docs/adr/0004-relationship-with-miralabs-ui.md); z-index and the fade landed as a
      pre-merge review fix, commit
      [92a5f89](https://github.com/StandarX-miralabs-tech/standarnav/commit/92a5f89), 2026-09-20
- [ ] Ring under `forced-colors: active`, which suppresses `box-shadow` outright, so the ring
      vanishes in a forced-colours theme. The source covered it with a media query using the
      `Highlight` system colour; an inline style cannot carry one. **Moved to v1** — the owner
      confirmed on 2026-09-20 that this is a v1 fix, not a v0 blocker; see the v1 section below

### Tests

- [x] Port **188 test cases across 16 files** and make them green on chromium, firefox and webkit.
      Ported and then grown past the plan: `bun run test:unit` runs 100 passed in 10 files and
      `bun run test:browser` runs 169 passed and 1 skipped in 10 files — 20 test files, 269 passed
      and 1 skipped in total (the one skip is the shadow-DOM fixture below), green on all three
      browsers in CI
      (`.github/workflows/ci.yml`, browser matrix; commands and counts read 2026-09-20). The final
      layout splits some ported suites further than the 16 files planned here — `dead-zone.test.ts`,
      `mapping.test.ts` and `repeat.test.ts` separate out of the gamepad port, for one — so file
      count is not a 1:1 match, but every case this bullet asked for is written and passing.
      The 160 of miralabs-ui: `packages/core/src/input` reproduce exactly by
      `grep -cE "^\s*(it|test)\("` over its twelve test files (2026-09-18), but that census
      undercounts the port, because two modules of the planned layout have their tests outside that
      tree. Derivation, all paths in miralabs-ui under `packages/core/src`: 160 (`input/`) + 5 (the
      `describe("tabbable")` block of `focus/focus.browser.test.ts`, a 17-case file whose other 12
      cover `trapFocus` and `proxyTabFocus` and stay behind) + 9 (the `trackInputModality` block of
      `interaction/interaction.browser.test.ts`, a 31-case file) + 6 (`interaction/modality.test.ts`,
      a clean move) + 8 (the portable subset of `dom/dom.browser.test.ts`, a 22-case file over seven
      describe blocks, of which 12 cover this group and 8 survive the narrowing: all 4 query cases,
      2 of 3 event cases, 1 of 4 raf cases and the platform case, once `query`, `isModifiedEvent`,
      `isPrimaryPointer`, `rafs`, `nextTick`, `timeout` and the seven user-agent sniffs are left
      behind as unimported by the perimeter). All 188 stay tests, the geometry timing guard
      included: `vitest` 5.0.1 exports no `bench`, so no benchmark file is ported and the guard is
      the only performance gate v0 has. They run through the real input system; a fake host is kept
      for the plugin contract alone ([ADR-0018](docs/adr/0018-testing-strategy.md))
- [x] Nested containers, the largest hole and the one this list did not have: the whole 25-case
      spatial browser suite holds exactly two containers, `#left` and `#right`, and they are
      siblings (miralabs-ui: `packages/core/src/input/spatial/spatial.browser.test.ts:169-179`, read
      2026-09-18). So `childContainerOf` (miralabs-ui:
      `packages/core/src/input/spatial/spatial.ts:111-120`), the container-scored-as-one-unit rule
      (`.../spatial.ts:142`, where
      `isContainer` has been `false` in every case that has ever run) and the recursive descent of
      `enterContainer` (`.../spatial.ts:305-307`) have never executed. A rail inside a row inside a
      page is the ordinary television layout. Four cases, all written, verified 2026-09-20 — two of
      them live in the containers block rather than the nested one: enter a nested container as one
      scored unit (`src/spatial/spatial.browser.test.ts:466`), bubble out through the outer
      container to a sibling (`:182`), `data-snav-enter="first"` on the inner (`:205`), and a
      three-level nest reaching the recursive branch (`:477`). The nested-containers block itself
      is `:465-511` and adds two more: returning to the remembered child of a nested container
      (`:486`) and marking every container on the active path (`:498`). Commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)
- [x] Write the scroll-and-rescan test (miralabs-ui:
      `packages/core/src/input/spatial/spatial.ts:327-351`, one frame via `raf` with a `rescanning`
      lock). Untested in the source: a grep for `rescan` over miralabs-ui:
      `packages/core/src/input/spatial/spatial.browser.test.ts` returned no match on 2026-09-18.
      **The fixture must be virtualised**, and a tall scroller will not do: `collectNavNodes`
      (`src/spatial/spatial.ts:170-193`) applies no viewport filter — it rejects only
      `[data-snav-ignore]` (`:175`) and a rect that is zero on an axis (`:188`) — so a merely
      scrolled-out-of-view button is still a candidate and `findBestCandidate` finds it without ever
      reaching the rescan branch. Only a fixture whose next row does not exist in the DOM until the
      scroll fires exercises it. Written virtualised,
      `src/spatial/spatial.browser.test.ts:713-771` (read 2026-09-20); commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)
- [x] Write the `pointerFollowsFocus` test (default on in `app` mode). Untested in the source: a grep
      for `pointerFollowsFocus` over the same file returned no match on 2026-09-18. Written,
      `src/spatial/spatial.browser.test.ts:512-545` (read 2026-09-20); commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)
- [x] Write the `data-snav-scroll="center"` test. The source attribute is `data-mira-nav-scroll`
      (miralabs-ui: `.../input/spatial/containers.ts:16`) and no test names it: a grep for
      `nav-scroll` over the `*.test.ts` files of miralabs-ui: `packages/core/src` returned no match
      on 2026-09-18. Written, `src/spatial/spatial.browser.test.ts:548-563`, inside the
      scrolling-into-view describe at `:547-581` (read 2026-09-20); commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)
- [x] Write the debug parity test, **scoped**. In the source `explainMove` re-implements the winner
      rule instead of sharing it with `findBestCandidate`, and no test names it: a grep for
      `explainMove` over the `*.test.ts` files of miralabs-ui: `packages/core/src` returned no match
      on 2026-09-18. But "assert both agree" as previously phrased here produces a test that fails
      on correct code. There, `explainMove` scores exactly one container (miralabs-ui:
      `.../input/spatial/debug.ts:48-52`, no loop) while the engine walks out through up to
      `MAX_CONTAINER_DEPTH` containers (`.../input/spatial/spatial.ts:371-390`) and may take a
      redirect (`:362-366`), wrap (`:379-382`) or scroll and rescan (`:384`) first; it also defaults
      its root to the origin's `ownerDocument.body` where the plugin uses its own root
      (`.../input/spatial/spatial.ts:217`), and defaults its score options where the engine passes
      the plugin's. So:
      assert agreement over a flat single-container fixture, passing the plugin's own root and score
      options, and add named cases for the three divergences that are correct — bubbling, redirect
      and wrap. The two rules are otherwise provably equivalent, so the test pins a real invariant
      rather than a coincidence. **Went further than scoped**: `explainMove` was refactored to call
      `findBestCandidate` for its winner directly, rather than reimplementing the rule
      (`src/debug.ts:68` calls it, commit
      [81b0b72](https://github.com/StandarX-miralabs-tech/standarnav/commit/81b0b72)), so the two
      cannot drift apart by construction; the parity fixture is written on top of that,
      `src/debug.browser.test.ts` (read 2026-09-20); commit
      [32b3280](https://github.com/StandarX-miralabs-tech/standarnav/commit/32b3280)
- [x] Write the right-stick horizontal scroll test. The gamepad side has emitted `scrollX` since the
      port (`src/gamepad/gamepad.browser.test.ts:199-200` sets the axes and steps a frame; `:203` is
      the assertion on the emitted intent), while the spatial side had cases for `scrollY` only
      (`src/spatial/spatial.browser.test.ts:317-384` — four cases opening at `:333`, `:350`, `:360`
      and `:376`, the describe closing at `:384`). Both citations were wrong in earlier revisions of
      this file; the convention adopted while fixing them is that a range naming a test case or a
      describe block runs from its opening line to its closing line, and a citation of where
      something is emitted points at the emit rather than at the assertion about it. Written,
      `src/spatial/spatial.browser.test.ts:645-711` (read 2026-09-20); commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)
- [x] Write the zero-size filter test: the source filters on `width === 0 && height === 0`
      (miralabs-ui: `.../input/spatial/spatial.ts:141`, read 2026-09-18), so a 0 x 40 element stays
      a candidate. **Settled, and landed**: change (C1) of
      [ADR-0009](docs/adr/0009-hidden-candidates.md) is accepted for v0 and is in the code —
      `src/spatial/spatial.ts:188` reads `if (rect.width === 0 || rect.height === 0) continue;`,
      with the reason written above it at `:183-187`. The fixtures pin the rule it moved to rather
      than the one it left: `src/spatial/spatial.browser.test.ts:583-631`, three cases — no size at
      all (`:598-605`), flat on a single axis (`:607-619`, where putting `&&` back fails), and a
      1px hairline kept (`:621-630`), so the rule is zero and not merely small (read 2026-09-20).
      Written at commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db), the operator
      changed and the last two fixtures added at
      [9f2f8cc](https://github.com/StandarX-miralabs-tech/standarnav/commit/9f2f8cc). (C2) did not
      ship with it — see the v1 entry for (C2) below
- [ ] Fixture: clickable `div` without `tabindex`. The behaviour is already decided — such an element
      is not in `FOCUSABLE_SELECTOR`, so it is never a candidate
      ([ADR-0009](docs/adr/0009-hidden-candidates.md),
      [ADR-0005](docs/adr/0005-real-dom-focus.md)) — and the fixture pins it. **Still open**: no
      such fixture in `src/tabbable.browser.test.ts` (read 2026-09-20) — the nearby `#span` case in
      that file covers a plain non-interactive element, not a clickable `div`, and does not stand in
      for this one
- [x] Fixture: candidate inside a shadow root. It ships skipped and documented, as the acceptance
      test of any later traversal work ([ADR-0008](docs/adr/0008-shadow-dom.md)); the source is light
      DOM only by explicit choice. Written and skipped exactly as planned,
      `src/spatial/spatial.browser.test.ts:855-877`, `it.skip` at `:856` (read 2026-09-20); this is
      the one documented skip in `bun run test:browser`'s 169 passed / 1 skipped; commit
      [32b3280](https://github.com/StandarX-miralabs-tech/standarnav/commit/32b3280)
- [ ] One fixture per line of the gap table of [ADR-0009](docs/adr/0009-hidden-candidates.md):
      `clip-path`, overflow-clipped candidates, candidates outside the scroller's viewport, and
      `visibility: hidden` on the fallback path. **Still open**, none of the four found in
      `src/spatial/*.test.ts` (read 2026-09-20). `opacity: 0` was on this line too; **it no longer
      is** — (C2) is refused for v0 (settled 2026-09-20) and its fixture moves to v1, see below
- [x] Fixtures for the inherited hard limits: container depth 16 (miralabs-ui:
      `.../input/spatial/spatial.ts:55`), `MAX_PADS = 4` and `MAX_BUTTONS = 20` (miralabs-ui:
      `packages/core/src/input/gamepad/gamepad.ts:43-44`), all read in the source on 2026-09-18.
      Depth written at `src/spatial/spatial.browser.test.ts:773-792` (commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)); `MAX_PADS`
      and `MAX_BUTTONS` written at `src/gamepad/gamepad.browser.test.ts:303-325` (commit
      [d6db398](https://github.com/StandarX-miralabs-tech/standarnav/commit/d6db398)); both read
      2026-09-20
- [x] Fixture for the `WeakRef` fallback path: the strong reference validated with `isConnected`
      needs a run of its own ([ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md)). Written,
      `src/spatial/spatial.browser.test.ts:794-826` (read 2026-09-20); commit
      [bb680db](https://github.com/StandarX-miralabs-tech/standarnav/commit/bb680db)
- [ ] Find a benchmark runner, then write both benchmarks. `vitest` 5.0.1 exports no `bench`, so
      the inherited `geometry.bench.ts` is not ported and neither benchmark exists yet. Until one
      does, the only performance gate is the median-of-51 guard in `geometry.test.ts`, and it
      measures `findBestCandidate` alone — not `collectNavNodes`, `getBoundingClientRect`,
      `querySelectorAll` or `checkVisibility`
- [ ] Add a second benchmark covering an end-to-end move, so the blind spot above is measured rather
      than described; every figure it prints records the machine, the browser and the date
      ([ADR-0018](docs/adr/0018-testing-strategy.md))
- [ ] Decide whether the timing guard inherited from the source
      (`src/spatial/geometry.test.ts:156-177`, median of 51 samples, read 2026-09-20) belongs in CI,
      where machine variance is not controlled — measure first

### Tooling and budgets

- [x] Dev-mode diagnostics in the `@standarx/nav/debug` subpath, excluded from the default build
      ([ADR-0010](docs/adr/0010-dev-mode-diagnostics.md)) — **scoped to `explainMove` for v0, the
      other four deliverables moved to v1**. Only one of the five ADR-0010 names had a source file:
      miralabs-ui: `packages/core/src/input/spatial/debug.ts` is 73 lines (`wc -l`, 2026-09-18)
      exporting
      `SpatialExplanation`, `explainMove` and four type re-exports, and it writes no DOM at all — a
      grep for `createElement`, `appendChild` and `style` over that file returns nothing.
      `scanUnreachable`, the `MAX_CONTAINER_DEPTH` saturation warning, the dead redirection warning
      and the printed documentation note are new code with no port behind them, so they are not
      extraction work and do not belong in the extraction window. ADR-0010 records the split
- [x] Run `bun run check:size` on a real `dist/` and write the caps it prints — **done 2026-09-19,
      amended 2026-09-20**. First measurement, `bun run build && bun run check:size`, bun 1.4.0,
      tsdown 0.23.0, min+gzip at Bun's default level: core 3.08 kB, gamepad 2.48 kB, spatial 3.03 kB,
      focus ring 1.44 kB, debug 0.50 kB, react adapter 1.13 kB, whole package 8.64 kB; caps at the
      next quarter kB by rule 3 of [ADR-0017](docs/adr/0017-size-budgets.md). The pre-merge review
      of 2026-09-20 re-ran the same command and rewrote four of the seven caps — the current numbers
      are **core 3.13 kB / 3.25 kB cap, gamepad engine 2.48 / 2.50 kB, spatial engine 3.04 / 3.25 kB,
      focus ring 1.51 / 1.75 kB, debug 0.40 / 0.50 kB, react adapter 1.30 / 1.50 kB, whole package
      8.77 / 9.00 kB**, min+gzip, measured 2026-09-20 — with no line left at `null`. The focus-ring,
      react-adapter and whole-package caps were raised for real growth (the ring's new z-index and
      fade, and a React re-render fix); the debug cap was cut from a stale 0.75 kB after `explainMove`
      shrank. See [ADR-0017](docs/adr/0017-size-budgets.md)'s 2026-09-19 and 2026-09-20 amendments
      for what each line leaves out and the script defects both runs exposed; commits
      [e28db82](https://github.com/StandarX-miralabs-tech/standarnav/commit/e28db82) and
      [ab635b8](https://github.com/StandarX-miralabs-tech/standarnav/commit/ab635b8). The script
      covers JavaScript only; the equivalent in miralabs-ui is 2006 lines (`wc -l`, 2026-09-18),
      about half of it about CSS. Inherited figures, the source repository's and not standarnav's,
      from `bun run check:size` in miralabs-ui on 2026-09-18 with externals `../*` and `../../*`:
      input system 1.93 kB, gamepad 2.35 kB, spatial 2.81 kB, modality 0.74 kB, and spatial without
      externals 3303 B reported but not re-measured
- [x] Confirm the scope of each budget line once the caps exist: the four subpath lines are measured
      with their siblings external, so their numbers are a marginal cost, and the whole-package line
      is the figure a consumer of everything pays. Documented in
      [ADR-0017](docs/adr/0017-size-budgets.md)'s decision (rule 1) and, per line, in the "what the
      line leaves out" column of its 2026-09-19 amendment — read 2026-09-20; commit
      [e28db82](https://github.com/StandarX-miralabs-tech/standarnav/commit/e28db82)
- [x] CI green on every job, on a runner that can actually start. `bun run lint` and
      `bun run typecheck` passed on the scaffold (2026-09-18); `bun run build`, `bun run test:unit`
      and the two build-job checks failed until `src/` existed, so CI stayed red until the first
      extraction commit. **No longer true**: every one of those commands passes locally now, and the
      workflow defines six jobs, which expand to eight checks — lint (`:13`), typecheck (`:23`),
      build (`:33-49`, which runs `bun run build`,
      then `git diff --exit-code` as the exports-map drift gate, then `check:package`, then
      `check:size`, all four passing), `test:unit` (`:51`), react-floor (`:66-92`, typecheck and the
      chromium browser project re-run against the declared `react@^18.3.1` peer floor) and the
      browser matrix of chromium, firefox and webkit (`:94-120`, three checks from the one job)
      ([`.github/workflows/ci.yml`](.github/workflows/ci.yml), read 2026-09-20). The green run to
      cite is the one on pull request
      [#1](https://github.com/StandarX-miralabs-tech/standarnav/pull/1); react-floor is the newest
      job of the six and its first run is younger than this line, so read its result there rather
      than here. The source repository's
      own runs still fail for billing, unrelated to this repository's CI
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
      documentation and a GIF for the README. Decided as a v0 item on 2026-09-18, not started — its
      one prerequisite, the engine wired into the playground, is now done (see below), so nothing
      but this item itself blocks it. No Remotion composition, MP4 or GIF anywhere in the repository
      (read 2026-09-20)
- [x] Hosted playground with `explainMove` wired to the console — not an overlay, which does not
      exist: it lived in the monorepo's documentation site and no renderer is extracted, so an
      overlay is a v1 feature needing its own spec. **The console wiring is done**: the fixture at
      `playground/index.html`, served by `bun run dev`, now mounts the gamepad, spatial (`app` mode)
      and focus-ring plugins and logs `explainMove`'s candidate table and container winner to the
      console on every move ([`playground/main.ts`](playground/main.ts), read 2026-09-20); commit
      [0df4edc](https://github.com/StandarX-miralabs-tech/standarnav/commit/0df4edc). **"Hosted"
      is not done** — nothing here deploys the playground anywhere; that remains open

### First adapter and publication

- [x] React adapter in `src/react/` — the only adapter that exists in the source
      (miralabs-ui: `packages/react/src/input.tsx`, 209 lines, read 2026-09-18), with its dependency
      on the design-system `useDocument()` removed. Verified: `src/react/react.tsx`,
      `src/react/react-harness.tsx` and `src/react/use-safe-layout-effect.ts` exist, and no import
      of a `useDocument` from outside this package (read 2026-09-20); commits
      [b9092fd](https://github.com/StandarX-miralabs-tech/standarnav/commit/b9092fd) and
      [4e3a066](https://github.com/StandarX-miralabs-tech/standarnav/commit/4e3a066)
- [x] Write the React adapter suite. The source has no test file dedicated to miralabs-ui:
      `packages/react/src/input.tsx`: the provider is only exercised through other test files
      (8 cases in miralabs-ui: `packages/react/src/components/gamepad.browser.test.tsx` and 16 in
      `packages/react/src/primitives.browser.test.tsx` of the same repository, of which the provider
      and modality cases touch the adapter, counted on 2026-09-18), so the adapter parity suite of
      [ADR-0018](docs/adr/0018-testing-strategy.md) is written here rather than ported. It grew past
      "scope unmount order" while it was open: `src/adapter-parity.ts` now exposes a `ParityTree`
      shape and an `update()` capability, and its cases cover LIFO scope order, a scope released when
      only its own subtree unmounts, a trap stopping the walk, a base scope asked through that trap,
      and base re-registering on a rerender (`src/adapter-parity.ts:48-55` for the shape, the suite
      itself at `:82-255` with those five cases opening at `:118`, `:133`, `:150`, `:161` and
      `:174`, read 2026-09-20); React runs the suite and passes it at
      `src/react/react.browser.test.tsx`. Commits
      [c634346](https://github.com/StandarX-miralabs-tech/standarnav/commit/c634346) and
      [f9185a8](https://github.com/StandarX-miralabs-tech/standarnav/commit/f9185a8)
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

These are decisions, not code changes; nobody else can make them. (The one exception is noted where
it appears: a decision recorded here can leave ordinary repository work behind it, which belongs in
its usual section, not in this list — kept here only because it continues the item directly above.)

- [ ] Install the Renovate GitHub App on the organisation. `renovate.json` is committed, but
      `gh api /orgs/StandarX-miralabs-tech/installations` returned zero installations on 2026-09-18,
      so nothing reads that configuration yet
- [ ] Check GitHub Actions billing on the account that carries the organisation, before this
      repository relies on a public CI. The source repository's last eight runs were refused with
      "The job was not started because recent account payments have failed or your spending limit
      needs to be increased." (`gh run list -R miralabs-tech/miralabs-ui --limit 8`, 2026-09-18)
- [x] Decide between changesets and release-please for version bumps and release notes, the open
      rider of [ADR-0012](docs/adr/0012-versioning-and-release.md). **Settled 2026-09-20:
      release-please**, not changesets. It reads the Conventional Commit history of `main` and keeps
      a release pull request open carrying the version bump and the CHANGELOG it derives from those
      commits. This decision item is the owner action, and it is done; what is not done is the
      wiring, which is ordinary repository code and stays open in the item directly below (not
      itself an owner action, kept here only for narrative continuity with the decision it follows)
- [ ] Wire release-please now that it is the chosen tool: `release-please-config.json`,
      `.release-please-manifest.json` and a release workflow. None of the three exists yet —
      `.github/workflows/` holds only `ci.yml` (`ls .github/workflows`, read 2026-09-20) — so nothing
      runs release-please today; the pull request description still carries the user-facing sentence
      of each change until this lands

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
      [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md)).
      **The sunset date stays 2026-12-31**, and the rule the owner confirmed on 2026-09-20 is: no
      device report by that date means no legacy build — silence defaults to dropping it, not to
      keeping it
- [ ] Second device family verified with its own dated report
- [ ] Focus ring under `forced-colors: active`. `box-shadow` is suppressed outright in a
      forced-colours theme, so the ring disappears; the source covered it with a media query on the
      `Highlight` system colour, which an inline style cannot carry. **Moved here from v0 on
      2026-09-20**, owner-confirmed: this is a v1 fix (a `matchMedia` read in the plugin, or an
      optional stylesheet), not a v0 blocker
- [ ] Shadow DOM traversal and coherence: v0 does not traverse shadow roots in `getFocusables`
      (`src/tabbable.ts:69`, where `querySelectorAll` stops at the boundary), while the shadow-aware
      `contains` in `src/dom/query.ts:24` already walks out through hosts and is deliberately unused
      in v0 — the seam the v1 path will call. A deliberate v0 inconsistency, documented in
      [ADR-0008](docs/adr/0008-shadow-dom.md), whose skipped acceptance fixture stays in place until
      this lands (`src/spatial/spatial.browser.test.ts:855-877`). **Owner-confirmed 2026-09-20:
      full coherence is the v1 direction** — the evolution path ADR-0008 already writes down: walk
      from the scan root collecting `element.shadowRoot`, one `querySelectorAll` per open root concatenated in
      document order, replace `Node.contains` with the existing shadow-aware `contains` in the
      spatial hot path, and resolve `document.activeElement` through `shadowRoot.activeElement`
      chains
- [ ] Implement (C2): exclude `opacity: 0` candidates, passing `opacityProperty: true` to
      `checkVisibility` where the browser offers it
      ([ADR-0009](docs/adr/0009-hidden-candidates.md)). **Refused for v0, deferred to v1** — settled
      2026-09-20, and it does not ship together with (C1): opacity comes from a computed style, so
      it costs a `getComputedStyle` call per candidate in the hot navigation loop, and opacity
      inherited from an ancestor escapes `checkVisibility`'s own-element check anyway, so the change
      would not even close the gap it targets. A fixture for this line of the ADR-0009 gap table is
      v1 work, alongside the other filters
- [ ] The remaining `@standarx/nav/debug` diagnostics of
      [ADR-0010](docs/adr/0010-dev-mode-diagnostics.md) — items 1, 2, 3 and 5, all scoped out of v0
      because none had a source file to port (only item 4, `explainMove`, shipped v0): (1) a
      reachability scan, `scanUnreachable(root)`, reporting elements that look interactive and are
      not focusable with a confidence level per signal — `role` and `onclick` at High, a
      `cursor: pointer` computed style at Low and gated behind its own open rider, **(O1)**, on
      whether the scan runs it by default; (2) a depth warning when the container walk saturates
      `MAX_CONTAINER_DEPTH` without finding a boundary; (3) a redirection warning for every
      `data-snav-up/down/left/right` that resolves to nothing or to a non-focusable element; and (5)
      a short printed note on how to make an element navigable, shown when the scan finds nothing

## Later

- [ ] Vidaa and Vizio remote key codes, added only once a device report exists — no public
      documentation of their runtime versions was found on 2026-09-18
- [ ] Other TV platforms not in the default keymap today: Roku, Fire TV, Android TV
- [ ] Focus ring positioned with CSS anchor positioning instead of a WAAPI overlay, once the baseline
      allows it
- [ ] Revisit `MAX_CONTAINER_DEPTH`, 16 in the source (miralabs-ui:
      `.../input/spatial/spatial.ts:55`, read 2026-09-18) and 16 here
      (`src/spatial/spatial.ts:60`, read 2026-09-20), if a real layout ever hits it — measure first
