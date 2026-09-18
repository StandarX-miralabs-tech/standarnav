# Competitor comparison

standarnav is unreleased (extraction in progress). This document compares the
verified state of 18 other spatial-navigation, focus-management, and D-pad
libraries and specifications, as of 2026-09-18. It carries facts only — no
adjectives about competitors that are not themselves a quoted fact.

Twenty fact sheets were produced during the research pass, but two pairs of
sheets turned out to describe the same project under two names, so the
comparison table has 18 rows. The Method section names both pairs. Wherever a
count below says "twenty" it counts sheets; wherever it says "eighteen" it
counts distinct projects.

## Method

Twenty fact sheets were built on 2026-09-18 from four kinds of primary
source: the npm registry (`registry.npmjs.org`, for version and license),
`api.npmjs.org` weekly-download counts for the fixed window 2026-09-10 to
2026-09-16, the GitHub API (`api.github.com`, for stars, archive status, and
last activity), and a full read of each project's own source code (for
framework coupling, focus model, algorithm, declarative-attribute support,
and gamepad support). Each of the twenty sheets was then adversarially
re-verified by a second agent that re-fetched the same primary sources and
re-read the same source code independently, without trusting the first
agent's claims.

Fields marked unverifiable by that second pass are called out where they
affect a claim in this document. One field surfaced this way applies to
several rows: the `maintained` label (`active` / `slow` / `abandoned`) is a
subjective classification, not itself a fact — where the re-verification
flagged a label as misleadingly generous given the objective activity data
(e.g. years without a commit, release, or npm publish), that is noted in the
table.

The two pairs that reduce twenty sheets to 18 rows are these:

- The **WICG spatial-navigation polyfill** was sheeted twice under two
  titles ("WICG spatial-navigation polyfill" and "Spatial Navigation
  Explainer/Polyfill (WICG)"). Both point to the same repository
  (`WICG/spatial-navigation`) and the same npm package
  (`spatial-navigation-polyfill`, version 1.3.1, 903 downloads/week, 225
  stars). Merged into one row.
- **`js-spatial-navigation` (luke-chang)** was sheeted twice because the
  same GitHub repository (`luke-chang/js-spatial-navigation`) is reachable
  through two different npm package names: `js-spatial-navigation` (the name
  matching the repo, 120 downloads/week for 2026-09-10 to 2026-09-16,
  `dist-tags.latest` = 1.0.1 published 2017-06-24) and `spatial-navigation-js`
  (a third-party republish by a different npm maintainer, not the repo
  owner, 239 downloads/week for the same window, `dist-tags.latest` = 1.0.0
  published 2018-08-27). The re-verification pass additionally found that
  neither npm version number matches the repository's own most recent
  GitHub release, `v0.3.3` (2022-03-02) — the three version channels are
  desynchronized. Merged into one row; both npm names and both download
  counts are kept in the version cell below.

## Comparison table

Sources per column. `version`, `license` and the publish dates: npm registry,
2026-09-18. `weekly downloads`: `api.npmjs.org`, 2026-09-18, for the fixed
window 2026-09-10 to 2026-09-16. `stars`, archive status and the last-commit
dates: GitHub API, 2026-09-18. Framework coupling, focus model, algorithm,
declarative-HTML support and gamepad support: a read of each project's own
source code on 2026-09-18, cross-checked by the adversarial second pass. Where
the `maintained` label and the objective dates disagree, both are given in the
maintenance cell.

| Library | Version | Framework coupling | Focus model | Algorithm | Declarative HTML | Gamepad | Maintenance | License | Weekly downloads | Stars |
|---|---|---|---|---|---|---|---|---|---|---|
| Norigin Spatial Navigation | 3.3.0 (legacy combined package); core package `@noriginmedia/norigin-spatial-navigation-core` 4.1.1 | Framework-agnostic core (dependency: `lodash-es`) + React + React Native adapters; only the React adapter is published today | Virtual by default, with an option to switch to real DOM focus | Geometric (rects) | No — navigable elements are registered through the `useFocusable()` hook, not a `data-*` attribute; the library writes `data-focused` as output only | No | Active: last commit 2026-08-31 on the default branch (GitHub API, 2026-09-18; the repository's `pushed_at` field reads 2026-09-07, which points to activity on another branch or tag), version 3.3.0 published on npm 2026-07-30 (npm registry, 2026-09-18) | MIT | 38,114 | 487 |
| BBC `lrud` | 8.0.0 | Vanilla | Virtual (state + events) | Declared tree | No | No | Archived on GitHub; last commit 2023-06-27 (GitHub API, 2026-09-18); version 8.0.0 published on npm 2021-10-26 (npm registry, 2026-09-18) | Apache-2.0 | 3,599 | 103 |
| BBC `lrud-spatial` (npm: `@bbc/tv-lrud-spatial`) | 0.0.18 | Vanilla, zero dependencies | Real DOM focus, but the calling application invokes `focus()` itself | Geometric (rects) | Yes (`nav`, `section`, `.lrud-container`, `data-block-exit`, `data-focus`) | No | Slow (last commit 2026-07-09, GitHub API, 2026-09-18; version 0.0.18 published on npm the same day, npm registry, 2026-09-18) | Apache-2.0 | 4,516 | 66 |
| WICG `spatial-navigation-polyfill` | 1.3.1 | Global script | Real DOM focus | Geometric + containers | Via CSS custom properties (`--spatial-navigation-*`) | No | Repository archived on GitHub; version 1.3.1 published on npm 2019-11-29 (npm registry, 2026-09-18). The GitHub API reports a last commit of 2026-03-23 (GitHub API, 2026-09-18), which the re-verification pass flagged as inconsistent with the archived flag and could not explain; the npm package has not moved since 2019 | MIT for the polyfill code (`polyfill/LICENSE`, and the declared license of the npm package); the repository root carries the W3C Software and Document License, which GitHub reports as `license.spdx_id = NOASSERTION` | 903 | 225 |
| CSS Spatial Navigation Level 1 | No semver — first Public Working Draft 2019-04-23, last Working Draft 2019-11-26 (https://www.w3.org/standards/history/css-nav-1/); the Editor's Draft URL printed in the spec (`drafts.csswg.org/css-nav-1/`) returned 404 when fetched on 2026-09-18 | Specification, not a package | Real DOM focus (as specified: `focus()`, `document.activeElement`, `navbeforefocus` / `navnotarget` events) | Geometric; the only known implementation is Blink's | Three CSS properties (`spatial-navigation-contain`, `-action`, `-function`), not HTML attributes | No | Never shipped; last commit touching the `css-nav-1` folder 2026-06-01 (`gh api repos/w3c/csswg-drafts/commits?path=css-nav-1`) | Not a recognized open-source SPDX license on the GitHub repo (`w3c/csswg-drafts`); the content is a W3C document license | Not applicable — not an npm package | 4,878 (stars on the whole `w3c/csswg-drafts` monorepo, not specific to the css-nav-1 folder) |
| `js-spatial-navigation` (luke-chang) | Two npm names for the same repository: `js-spatial-navigation` 1.0.1 (matches the repo name; the repository's own most recent GitHub release is `v0.3.3`, 2022-03-02) and `spatial-navigation-js` 1.0.0 (third-party republish, not by the repo owner) | Vanilla, optional jQuery plugin in the same file; no per-framework adapters | Real DOM focus (`document.activeElement`, `element.focus()`) | Geometric (`getBoundingClientRect()`) | Partial (`data-sn-up/down/left/right` redirections only; section topology itself is configured in JS) | No | Labelled "abandoned" / "slow" depending on the sheet; the re-verification pass called both labels too generous given the facts and recommended "unmaintained" or "dormant": no commit on any branch since 2022-03-02 (GitHub API, 2026-09-18), no npm publish since 2017-06-24 for the `js-spatial-navigation` name (npm registry, 2026-09-18) | MPL-2.0 (GitHub `license.spdx_id` and both npm packages' `package.json.license` agree); the third-party `spatial-navigation-js` republish declares `ISC` in its own `package.json`, an inconsistency the re-verification pass confirmed | 120 (`js-spatial-navigation`) + 239 (`spatial-navigation-js`), same window | 429 |
| `react-tv-space-navigation` (bamlab) | `dist-tags.latest` = 6.0.0-beta1; the latest published stable tag is 5.2.0 | React / React Native, delegates the LRUD tree to the external dependency `@bam.tech/lrud` | Virtual | Tree-based LRUD (`@bam.tech/lrud`) | No — component API (`SpatialNavigationRoot`, `View`, `FocusableView`, `ScrollView`), not `data-*` attributes | No | Labelled "slow" in the fact sheet; last commit 2025-10-23 (GitHub API, 2026-09-18), last stable publish 5.2.0 on 2025-07-10 (npm registry, 2026-09-18) | MIT | 1,820 | 320 |
| `@please/lrud` | 1.0.0 | React | Virtual (CSS classes) | Tree | No | No | Abandoned: last commit 2024-09-13 (GitHub API, 2026-09-18), version 1.0.0 published on npm the same day (npm registry, 2026-09-18) | MIT | 416 | 43 |
| `@salutejs/spatial` | 3.0.14 | React in practice | Real DOM focus | Geometric | Partial (`sn-section-item` class + `data-sn-self-section-id`) | No | Abandoned: last commit 2023-10-31 (GitHub API, 2026-09-18), version 3.0.14 published on npm the same day (npm registry, 2026-09-18) | Unverified — no license field in `package.json`, GitHub reports `license.spdx_id = null`, no LICENSE file found at the repository root | 121 | 1 |
| `@arrow-navigation/core` | 2.2.0 | Core + web + React packages | Real DOM focus | Explicit pointers, then geometry | No | No | Abandoned: last commit 2024-12-16 (GitHub API, 2026-09-18), version 2.2.0 published on npm 2024-04-26 (npm registry, 2026-09-18) | MIT (declared in the npm `package.json`; GitHub's `license.spdx_id` is null even though a `LICENSE` file exists at `packages/an-core/LICENSE`) | `@arrow-navigation/core` 78 + `@arrow-navigation/react` 46, same window | 24 (repository `borisbelmar/arrow-navigation`; the name assumed at the start of this research pass, `arrow-navigation/arrow-navigation`, returns 404 and was corrected by a GitHub repository search) |
| Enact Spotlight (LG) | 5.6.0 | React | Real DOM focus | Geometric | Partial (`data-spotlight-*`) | No | Active: last commit 2026-09-02 on the `enactjs/enact` monorepo (GitHub API, 2026-09-18), version 5.6.0 published on npm the same day (npm registry, 2026-09-18) | Apache-2.0 | 5,463 | 346 (whole `enactjs/enact` monorepo; no separate count exists for the `spotlight` subpackage) |
| Tabster (Microsoft) | 8.8.1 | Vanilla | Real DOM focus | DOM order, with geometric scoring in grid mode | Yes (`data-tabster`, a JSON attribute value) | No | Active: last commit 2026-09-08 (GitHub API, 2026-09-18), version 8.8.1 published on npm 2026-09-03 (npm registry, 2026-09-18) | MIT | 372,308 | 164 |
| `@gauntface/dpad-nav` | 3.0.2 on npm (`dist-tags.latest`); the `main` branch's own `package.json` still declares 3.0.1 | Vanilla | Real DOM focus | Geometric | Partial (`.dpad-focusable` class) | No | Labelled "active" in the fact sheet; the objective dates are last commit 2026-08-01 (GitHub API, 2026-09-18) and last npm publish 2022-06-10, version 3.0.2 (npm registry, 2026-09-18) | Apache-2.0 | 45 | 66 |
| `react-sunbeam` | 1.0.5 | React | Virtual | 45-degree frustum + Minkowski distance | No | No | Abandoned: last commit 2020-11-15 (GitHub API, 2026-09-18), version 1.0.5 published on npm the same day (npm registry, 2026-09-18) | MIT | 73 | 55 |
| `vue-spatialnavigation` (twcapps) | 1.2.1 | Vue 2 | Virtual (CSS class) | Explicit pointers (`data-up/down/left/right`) | Yes | No | Abandoned: last commit 2018-06-26 (GitHub API, 2026-09-18; the only later branch activity is unmerged dependabot branches), version 1.2.1 published on npm the same day (npm registry, 2026-09-18) | Divergent: Apache-2.0 on the GitHub repository's own LICENSE / `license.spdx_id`, but MIT in the npm `package.json` | 29 | 77 |
| `naviix` | 1.2.0 | Framework-agnostic | None — computes the neighbor only, does not move focus itself | Geometric | No | No | Slow: last commit and last publish both 2025-12-30, version 1.2.0 (GitHub API and npm registry, 2026-09-18) | MPL-2.0 | 8 | 75 |
| `@sberdevices/spatial-navigation` | 1.0.5 | Fork of the WICG polyfill | Real DOM focus | Geometric | CSS custom properties | No | Archived: last commit 2022-02-15 (GitHub API, 2026-09-18), version 1.0.5 published on npm the same day (npm registry, 2026-09-18) | MIT declared in `package.json`; GitHub's license detector reports `NOASSERTION` because the repository's root `LICENSE.md` is the W3C Software and Document License, not an OSS SPDX license | 256 | 2 |
| `react-js-spatial-navigation` | 0.0.5 | React 15 | Real DOM focus | Geometric | Partial (`data-sn-*`) | No | Abandoned: last commit 2017-12-21 on `master` (GitHub API, 2026-09-18), version 0.0.5 published on npm 2017-12-26 (npm registry, 2026-09-18) | MIT per GitHub (`license.spdx_id`, detected from `LICENSE.md`); none of the published npm versions (0.0.1 through 0.0.5) declares a `license` field in `package.json` — the license is visible on GitHub only, not on the npm registry page | 60 | 33 |

## What is and is not a differentiator

- **Real DOM focus is not unique to standarnav.** Eleven of the eighteen
  projects move the browser's real focus
  (`document.activeElement` / `element.focus()`) instead of keeping a
  virtual focus state: BBC `lrud-spatial`, the WICG polyfill, its
  `@sberdevices` fork, the CSS Spatial Navigation Level 1 specification as
  written, `js-spatial-navigation`, `@salutejs/spatial`,
  `@arrow-navigation/core`, Enact Spotlight, Tabster, `@gauntface/dpad-nav`,
  and `react-js-spatial-navigation`. Norigin is a twelfth case: virtual by
  default, with real DOM focus available as an option.
- **No Gamepad API use in any of the eighteen, by the same source-code test.**
  None of the twenty fact sheets found a call to `navigator.getGamepads`, or
  any read of a gamepad's `axes`, in any of the eighteen projects. What that
  test establishes is the absence of analog-stick reading; it does not
  establish how each project expects a controller to be wired up. One project
  states it explicitly: Norigin's `docs/guides/key-mapping.md` says a gamepad
  is usable only if it emits standard `KeyboardEvent`s, remappable through
  `setKeyMap()`. The other seventeen were not checked for that statement.
- **Declarative attributes on plain HTML are not unique either.** Full
  declarative support (author-written attributes and selectors on ordinary
  markup, no required JS registration call) exists in BBC `lrud-spatial`.
  Tabster achieves it through a single JSON-valued `data-tabster` attribute.
  `vue-spatialnavigation` is declarative through `data-up/down/left/right`
  pointers, but only inside Vue 2. `js-spatial-navigation` and Enact
  Spotlight support it partially — a `data-*` attribute can redirect one
  direction, but defining the navigable regions themselves still requires a
  JS call in both. The WICG polyfill, its `@sberdevices` fork and the CSS
  specification are declarative through CSS properties rather than HTML
  attributes.
- **A framework-agnostic core with separate framework adapters already
  exists, at Norigin.** The `@noriginmedia/norigin-spatial-navigation-core`
  package (4.1.1) has no framework dependency of its own beyond `lodash-es`.
  As of 2026-09-18, only a React adapter (`@noriginmedia/norigin-spatial-navigation-react`)
  is published from that core; no official Vue, Svelte, or Angular adapter
  was found.

## Still unverified

- Whether Norigin's focus-measurement code (`getBoundingClientRect()` /
  manual `offsetParent` traversal) works across a Shadow DOM boundary. The
  fact sheet found zero occurrences of `shadowRoot` or `attachShadow` in its
  source and inferred a likely gap, but this was not exercised against a
  live Shadow DOM tree.
- The current status of the Chromium command-line flag
  `--enable-spatial-navigation`. Its existence is corroborated by several
  Chromium bug/review threads, but no `chromestatus.com` feature entry for
  it could be located, so its present shipping status carries medium
  confidence at best, not a direct, dated fetch of an authoritative status
  page.
- The Chromium (or other engine) version underlying Hisense VIDAA or Vizio
  SmartCast. No public version number was found for either during this
  research pass; see `tv-runtime-compatibility.md`.

Every number in this document is a snapshot fetched or cross-checked on
2026-09-18 for the fixed download window 2026-09-10 to 2026-09-16. Re-read the
primary sources before quoting these figures on a later date.
