# Architecture decision records

An ADR records one decision that was hard to take and would be expensive to
reverse: an API shape, a breaking rename, a supported-runtime tier, a size
budget, a release mechanism. It states the situation, the choice, what the
choice costs, what else was considered, and the evidence behind every number in
it. It is written once, when the decision is taken, and amended rather than
rewritten when the decision changes.

An ADR is not a specification and not a plan. What the engine does belongs in
[docs/specification.md](../specification.md); what is planned and in which order
belongs in [ROADMAP.md](../../ROADMAP.md). The ADR answers "why is it like this".

Every ADR here is English, like every committed Markdown file of this repository
([ADR-0015](0015-language-policy.md)), and carries no number without the command,
the measurement date or the URL that produced it.

## Mandatory format

```
# ADR-NNNN: Title

Status: Accepted | Proposed
Date: YYYY-MM-DD
Deciders: Wesley Cormier

## Context
## Decision
## Consequences
## Alternatives considered
## Evidence
```

Rules that go with that skeleton:

- The `Status` line carries exactly one word. When part of an accepted decision
  is still open, the `Status` line stays `Accepted` and a short paragraph after
  the `Deciders` line names the rider and points at the section that holds it —
  as [ADR-0013](0013-browser-baseline-and-fallbacks.md) and
  [ADR-0014](0014-device-and-browser-matrix.md) do.
- The five sections above are the minimum and they keep that order. A record may
  add one of its own after `## Consequences` when it needs it:
  [ADR-0005](0005-real-dom-focus.md) adds `## Gate`,
  [ADR-0019](0019-gamepad-engine-design.md) adds
  `## Open items recorded, not resolved`.
- `## Alternatives considered` names what was rejected and why. "None" is not an
  answer: a decision with no alternative did not need a record.
- `## Evidence` is where the proof lives — a source path with its line numbers, a
  command with the date it was run, a fetched URL with the date. A claim with
  none of those is written as "not measured yet" or "to be verified".
- Every code citation is a path in **this** repository, written bare and at a line
  the author opened: `src/spatial/spatial.ts:248`. There is no second repository for
  a reader to disambiguate against, and no record cites one — a claim this project
  did not re-derive carries no path at all. It is marked as inherited from the
  predecessor implementation ([ADR-0002](0002-license-and-copyright.md)) and not
  re-derived here, which is honest about what a reader can check. A line number
  without the symbol it points at is a citation waiting to drift: name the symbol
  in the prose so the mismatch is visible when it does.
- Related records are linked by file name, relative to this directory:
  `[ADR-0003](0003-package-boundaries.md)`.
- Length: 60 to 150 lines is the target **for a new record**. The twenty-nine below
  run from 98 to 721 lines (`wc -l docs/adr/0*.md`, 2026-09-24), because an
  accepted record grows by amendment. The target governs the first draft; an
  amendment is judged on whether it says something the record did not, not on the
  line count it adds.

## Adding one

1. Take the next free number. The highest in use is ADR-0031, so the next is
   ADR-0032. Numbers are never reused, and a superseded record keeps its number.
   ADR-0004 is the one gap: it recorded a migration plan for the private
   predecessor rather than a decision of this repository, so it was withdrawn on
   2026-09-20 instead of superseded, its one design decision — the focus ring's
   defaults — moving to [ADR-0020](0020-focus-ring-defaults.md). The number stays
   retired.
2. Name the file `NNNN-short-title.md`, lowercase, words separated by hyphens.
3. Write it in English, with the skeleton above, and link it from every existing
   record it touches.
4. Add its row to the index below, in the same pull request.
5. One ADR per pull request. A decision that needs two records needs two pull
   requests, so each can be discussed on its own.

Amending an accepted record is its own commit, separate from the change that
made the amendment necessary — that rule is explicit for size budgets
([ADR-0017](0017-size-budgets.md), rule 4) and applies to every other record too.
A decision that is reversed outright gets a new ADR that says so, and the old one
gains a line pointing at it rather than being deleted.

## Index

Status as of 2026-09-26. "Accepted, one rider Proposed" means the decision holds
and one named detail inside it still waits on the owner. Two rows changed on
2026-09-20: ADR-0009 moved from Proposed to Accepted when its two behaviour
changes were settled in opposite directions, and ADR-0012's rider closed on
release-please. On 2026-09-22 ADR-0012 gained the first publication and the
switch to trusted publishing, the `docs/en` and `docs/fr` of ADR-0015 came
into existence, and ADR-0011's rider closed on `@standarx/nav/auto` when
[ADR-0023](0023-vanilla-auto-mount.md) named it — leaving four records carrying
one: ADR-0010, ADR-0013, ADR-0014 and ADR-0015. On 2026-09-26 ADR-0012 gained
its third release, `0.3.0`, and the merge rule that release's changelog taught.
Every such change carries a dated amendment in its record.

| ADR | Title | Status | What it decides |
|---|---|---|---|
| [0001](0001-name-scope-and-attribute-prefix.md) | Name, npm scope and attribute prefix | Accepted | The project is standarnav, the package `@standarx/nav`, the DOM attributes `data-snav-*` and the custom properties `--snav-focus-ring-*` and `--snav-keyboard-*`. Nine written attributes and eleven custom properties as of 2026-09-21. |
| [0002](0002-license-and-copyright.md) | License and copyright holder | Accepted | MIT, copyright Wesley Cormier, contributions inbound=outbound with no CLA. |
| [0003](0003-package-boundaries.md) | Package boundaries and module layout | Accepted | The engine imports no component, machine, stylesheet or framework context; the `src/` layout, why the root entry omits the three engines, and why `internal/` is the only private directory. |
| [0005](0005-real-dom-focus.md) | Real DOM focus, never a virtual cursor | Accepted | The engine moves `element.focus()` and reads `document.activeElement`; no focus key, no registry, and a gate that keeps it true. Since 2026-09-24 a hover marks only what took the focus, as a move does. |
| [0006](0006-declarative-first.md) | Declarative first | Accepted | Containers and their behaviour are data attributes on the markup; the imperative API is the escape hatch, and `body` is the default container. |
| [0007](0007-navigation-modes.md) | Two navigation modes, composite and app | Accepted | `composite` is the default and leaves arrow keys to the page; `app` gives them spatial movement; the gamepad crosses the page in both. |
| [0008](0008-shadow-dom.md) | Light DOM only in v0 (shadow DOM is a non-goal) | Accepted | No shadow traversal in v0; the escape hatch is an explicit root. `getFocusables` and `contains` deliberately disagree about a shadow boundary, and the evolution path ships as the suite's one skipped fixture. |
| [0009](0009-hidden-candidates.md) | Which candidates count as visible | Accepted | Which elements are dropped from a move. The zero-size change (C1) is accepted for v0 and shipped in this pull request, pinned by three fixtures; `opacity: 0` (C2) is refused for v0 and deferred to v1. Since 2026-09-24 the set also drops what all three engines refuse to focus: any `<summary>` but the first child of a `<details>`, and a link or an editable-only element inside an editing host with no `tabindex` ([ADR-0030](0030-refused-focus-next-candidate.md)). Since 2026-09-26 it keeps an `<area>` of an image map in use, visible as its image is, and measures it by its shape over that image ([ADR-0031](0031-image-map-area-candidate.md)). Later that day rule 5 was written, the fallback of `isHidden` dropping `visibility: hidden` as `checkVisibility` does, and every row of the gap table got its fixture (second amendment of 2026-09-26). |
| [0010](0010-dev-mode-diagnostics.md) | Development-mode diagnostics | Accepted, one rider Proposed | A `@standarx/nav/debug` subpath with a reachability scan, depth and redirection warnings, and `explainMove` calling the engine's own winner rule. Open: (O1) the `cursor: pointer` heuristic default. Since 2026-09-24 `explainMove`'s winner may be a candidate the browser refuses and the engine skips, a fourth documented difference. Since 2026-09-26 it reads an image-map area's origin through the engine's own `rectOf`. |
| [0011](0011-package-layout-and-adapters.md) | One package, subpath exports, adapters as subpaths | Accepted | One published package with fourteen subpaths built today, adapters as optional peers, React, Vue, Svelte and Angular shipped and passing the parity suite, zero runtime dependencies enforced by `check:package`. Its one rider closed on 2026-09-22: the vanilla auto-mount helper is `/auto` ([ADR-0023](0023-vanilla-auto-mount.md)). |
| [0012](0012-versioning-and-release.md) | Versioning and release | Accepted | Semver from 0.x with breaking minors, publication from CI with provenance, `next` dist-tag for device trials, and release-please deriving the version and the CHANGELOG from the commit history. The tooling released `0.1.0` on 2026-09-22 with a signed provenance statement; from the same day the publish authenticates through npm trusted publishing, direct publish allowed, which released `0.2.0` on 2026-09-23 with the token revoked, and `0.3.0` on 2026-09-26 on the first attempt, the verbose log showing the token exchange. Since that day a pull request is merged with a merge commit whose body is empty, so the CHANGELOG lists each commit once, proven the same day on the first merge under the rule (`fa46f7d`). A `.md`-only change is `docs`, never `fix(docs)`. |
| [0013](0013-browser-baseline-and-fallbacks.md) | Browser baseline: most recent first, fallbacks for older runtimes | Accepted, one rider Proposed | Build target es2020, a fallback for every newer API, and three support tiers. Open: the decision date for a separate legacy build. |
| [0014](0014-device-and-browser-matrix.md) | Device and browser test matrix | Accepted, one rider Proposed | Three engines in CI, no device claim without a dated device report, a matrix in three columns of which two are empty today. Open: which devices are bought and which are borrowed. |
| [0015](0015-language-policy.md) | Language policy | Accepted, one rider Proposed | Every committed file is English; user documentation is `docs/en` canonical with a strict `docs/fr` mirror — four pages on each side since 2026-09-22. Open: the CI mechanism enforcing that mirror. |
| [0016](0016-scoring-constants-provenance.md) | Scoring constants and their provenance | Accepted | Where `0.3`, `30`, `2` and the alignment bonus come from, what the score formula is, and that it is not Blink's. |
| [0017](0017-size-budgets.md) | Size budgets: measure before capping | Accepted | Two measured lines per subpath, caps written only after a first measurement here, and a line without a cap fails the run. Eleven lines are measured and capped as of 2026-09-21; a twelfth, the vue adapter's, on 2026-09-23; a thirteenth, the svelte adapter's, and a fourteenth, the angular adapter's, on 2026-09-24. The core cap went to 3.50 kB the same day, before the static filter of [ADR-0030](0030-refused-focus-next-candidate.md). The spatial cap went to 3.75 kB and the focus ring's to 2.00 kB on 2026-09-26, for [ADR-0031](0031-image-map-area-candidate.md), with the rule that a helper a subpath needs lives in a module that subpath's line pays for. |
| [0018](0018-testing-strategy.md) | Testing strategy | Accepted | Two Vitest projects, inline-style fixtures, tests through the real input system, one adapter parity suite, and no benchmark until a runner is chosen. The eight gaps it listed after the port are closed, by the amendment of 2026-09-20. |
| [0019](0019-gamepad-engine-design.md) | Gamepad engine design, inherited and recorded | Accepted | The polling loop, the two dead-zone regimes, the repeat ladder, the standard mapping and the escape hatches, with their open items. |
| [0020](0020-focus-ring-defaults.md) | Focus ring defaults, and why no stylesheet ships | Accepted | The plugin paints itself inline; six custom properties override every value, with the contrast figures and the two limits the choice carries. Since 2026-09-26 the ring wears an image-map area's shape over its image. |
| [0021](0021-native-select-on-television.md) | A native `<select>` on a television, and what the package offers instead | Accepted | A closed `<select>` opens a platform popup the engine cannot see, and the trap is invisible on a desktop. A `scanNativeSelects` diagnostic in the debug subpath names it; a trigger-and-list recipe replaces it. Why no runtime warning, and the two bus mechanics the recipe depends on. |
| [0022](0022-virtual-keyboard.md) | The virtual keyboard — layout data, insertion, and what closes it | Accepted | Keys take real focus; a layout is data in its own module with no registry; insertion is `beforeinput`, mutate, `input`, with the framework-tracking risk named; `back` closes and keeps, deliberately unlike engage mode; composition deferred to its own ADR. Built, then amended three times against a real page: `activate` opens it, the box paints and places itself, and a preview row at its bottom draws the caret the field cannot show and moves it with the directions — decision 9 reversed on 2026-09-21. |
| [0024](0024-download-counter.md) | One cumulated download counter, and what it may not claim | Accepted, then withdrawn 2026-09-23 | The README's downloads badge sums npm installs, release asset downloads and the clones that are not this repository's own CI. Release assets measure 0 structurally and clones are mostly `actions/checkout`, so the script subtracts two clones per CI job — the ratio measured here — accumulates whole days against GitHub's fourteen-day traffic window, and keeps its state on an orphan `badges` branch. The residual is an upper bound on human clones, never a user count. **Withdrawn the day it shipped:** the Actions `GITHUB_TOKEN` gets 403 on the traffic API and no workflow permission grants that endpoint, so the badge is `npm/dt` and the machinery is deleted. The measurements stand as the reason not to reopen it cheaply. |
| [0023](0023-vanilla-auto-mount.md) | The vanilla auto-mount helper is `@standarx/nav/auto` | Accepted | Closes ADR-0011's rider on the subpath name. `autoMount()` is a factory, never a side-effecting import, and adds exactly two things to `createInputSystem`: it waits for `DOMContentLoaded` when the document is still parsing, and it lets the page pick the navigation mode through a new `data-snav-mode` attribute read once off the root. `plugins` takes a factory so that attribute can reach an engine at all. No engine is imported, and the adapter parity suite is not run — there is no render pass to satisfy it with. |
| [0025](0025-trap-within-its-surface.md) | A trap still asks what lies inside its surface, when both say so | Accepted | Answers issue #14. `within` on a scope, an element or a getter read at dispatch, opt-in: a trap that names its surface still asks a scope beneath it whose own `within` lies inside it, after the trap — containment does not reorder the stack. A trap or a scope without `within` behaves as before. Every trap asked sets the surface, so a nested dialog narrows it. React's `useIntent` also takes a ref; engage mode passes no element. Amends specification R4. |
| [0026](0026-native-handler-answer.md) | A scope may answer "native": the walk ends and the default acts | Accepted | Answers issue #15. A handler may return `"native"` beside `true` and `false`: it stops the walk, `base` scopes and the spatial engine included, and the dispatch reads as an intent nobody answered, so the browser keeps a key's default and a pad `select` keeps the emulated click. A trap still swallows what nobody it asked answered. No engine rule excludes native controls, since a remote's arrows arrive as keyboard arrows and a radio group wraps: the recipe answers on the control's own axis. |
| [0027](0027-vue-adapter.md) | The Vue adapter, `@standarx/nav/vue`, and its 3.3 floor | Accepted | Item 3 of ADR-0011's order. React's surface as `defineComponent` over setup functions, no compiler; the system built on mount, never in setup, so a server render reads no document; scopes opened on mount through the ordered registry React now shares; `trapped` and `base` as a value, a ref or a getter, `within` as an element, a getter or a template ref. Optional peer `vue` at `>=3.3.0`, the release that ships `toValue`, `MaybeRefOrGetter` and the function form of `defineComponent`, kept by a `vue-floor` CI job on exactly 3.3.0. |
| [0028](0028-svelte-adapter.md) | The Svelte adapter, `@standarx/nav/svelte`, and its 5.0 floor | Accepted | Item 4 of ADR-0011's order, as functions rather than the actions that order planned. `provideNav` and `provideNavDocument` stand for the two providers and are called in a component's `<script>`; plain TypeScript over Svelte's public runtime, no component, no rune, no compiler in the package. The system is built on mount, so a server render reads no document; options are a value or a getter, watched with `toStore` and compared by content; scopes open on mount through the shared ordered registry. Optional peer `svelte` at `>=5.0.0`, kept by a `svelte-floor` CI job on exactly 5.0.0. |
| [0029](0029-angular-adapter.md) | The Angular adapter, `@standarx/nav/angular`, and its 20.0 floor | Accepted | Item 5 of ADR-0011's order, as functions rather than the directives that order planned. `provideNav` and `provideNavDocument` return `Provider[]` for an application, a route or a component, and `injectIntent`, `injectInputSystem`, `injectIntentScopeHost` and `injectInputModality` are called in an injection context; plain TypeScript over Angular's public runtime, no decorator, no compiler in the package. The system is built by an after-render effect, so a server render reads no document; an environment initializer creates the provider with an application's or a route's injector, and a component's builds when something asks; the scopes of one render open in DOM post-order through the shared ordered registry. Optional peer `@angular/core` at `>=20.0.0`, kept by an `angular-floor` CI job on exactly 20.0.0. |
| [0030](0030-refused-focus-next-candidate.md) | A refused focus hands the move to the next candidate | Accepted | Answers issue #19. `isFocusable`, in the core, drops what chromium, firefox and webkit all refuse: a link or an editable-only element inside an editing host with no `tabindex`, and any `<summary>` but the first child of a `<details>`; `FOCUSABLE_SELECTOR` changes with it. What the engines split on is left to the spatial engine, which reads the deepest active element before and after the focus call: landed, refused and the move goes on to the next best, the wrap, the rescan and the parent before `onBoundsHit`, or moved elsewhere by the application and the move stops. The refused set lives for one operation and its rescan frame. A hover marks only what took the focus; `explainMove` may name what the engine skips. Amends specification R21, R26, R27, R28, R30 and §4. Since 2026-09-26 an image-map area is a candidate on all three engines, closing the false negative it left ([ADR-0031](0031-image-map-area-candidate.md)). |
| [0031](0031-image-map-area-candidate.md) | An image-map area is a candidate, scored by its shape over its image | Accepted | Answers issue #30. `isHidden`, in the core, answers for an `<area>` with the image that uses its map, found by `imageOf`: the first `<img usemap>` naming the map by `name` or `id`, never an `<object>` or an `<input type=image>`. Its geometry is its `shape` and `coords` laid over that image's border box, by `rectOf` in `dom/platform.ts`, on every engine, since chromium and webkit give an area no box and firefox gives each the whole image's; a shape that describes nothing is a zero rect and is dropped. The spatial engine, `explainMove` and the focus ring read it, and a landing area scrolls its image. What the engines split on is left to the retry of ADR-0030; an area belongs to the container that holds its map, `inert` on the map drops it, and webkit's content-box coords are a documented deviation. Amends specification R21, R31, R32 and §4. Its amendment of 2026-09-26 measures the four cases it left open — a second map of the same name, a `usemap` with no `#`, an image resized by CSS, a shadow root — and changes no code: two agreements, two more splits left to the retry, one more documented deviation, and the container-by-image alternative measured complete at 101 bytes, not adopted. |
