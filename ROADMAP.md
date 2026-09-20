# Roadmap

Status: unreleased. Nothing is published on npm, nothing has been run on a television, and no demo
exists yet.

This file lists what is still open. What is done is in the git history, and will be in the CHANGELOG
once the release tooling is wired.

## How this file is maintained

- An item that depends on a measurement says "measure first"; it cannot be closed by an opinion.
- New work is added to the section it belongs to, never silently retitled.
- An item is removed when it ships, not ticked — the commit is the record.

## v0: what is left before the first publication

The engine navigates between focusable elements. Three gaps stand between that and a package worth
publishing, and they are the reason nothing is on npm yet.

### Controls that hold a value

The grammar already exists and is public: `pushEngageScope` takes hold of a control, the directional
intents become adjustments, confirm commits and back restores the entry value (`src/engage.ts:49`).
The four controls it was written for are now wired in the playground and driven by
`src/engage.browser.test.ts`, which leaves one gap in this section rather than two.

Two constraints came out of writing them, and both are worth knowing before the surface freezes.
A number field cannot be a native `<input type="number">`: that is a text-entry target, and
`select` is not one of the intents allowed to cross one, so A never reaches the control. And engage
can only be released by the bus — its dispose detaches in silence — so a control the user tabs out
of while holding it has to redo the commit-or-restore bookkeeping itself.

- [ ] `<select>` on a television. A native `<select>` opens a platform popup that no library can
      navigate, so the engine loses focus into something it cannot see. Decide and document what
      the package offers instead — detection and a warning, a documented listbox pattern, or both

### Virtual keyboard

A television has no keyboard. Every text input on one needs an on-screen one, and the package that
moves focus is the package that has to place it.

- [ ] `@standarx/nav/keyboard`: an overlay that opens on a focused text input, navigates with the
      same intents as everything else, and commits into the field. Its own subpath — nobody who
      never renders an input should pay for it
- [ ] Layouts are **data, in their own importable modules**, one per layout:
      `@standarx/nav/keyboard/qwerty`, `/azerty`, `/alphabetic`, and so on. A contributor adds a
      language by adding a module and a line to an index, with no engine change and no lookup
      through the source. A French application must not ship Cyrillic, which is why the layouts are
      separate entries and not one table
- [ ] Size budget lines for the keyboard entry and for each layout, capped by the rule of
      [ADR-0017](docs/adr/0017-size-budgets.md) after the first measurement
- [ ] An ADR for the keyboard: the layout data shape, how a layout is registered, what commits and
      what cancels, and how IME and `beforeinput` are handled

### Release tooling

- [ ] Wire release-please: `release-please-config.json`, `.release-please-manifest.json` and a
      release workflow. None of the three exists; `.github/workflows/` holds `ci.yml` only
- [ ] The release workflow publishes with provenance. `bun publish` emits no attestation
      ([oven-sh/bun#15601](https://github.com/oven-sh/bun/issues/15601), open), so the npm CLI is
      called there and nowhere else — the documented exception to the rule in
      [CONTRIBUTING.md](CONTRIBUTING.md)
- [ ] First npm publication of a 0.x version with provenance, once the three sections above are done
- [ ] Record the published size from the registry after that publication — measure first
- [ ] Move to npm trusted publishing and revoke the token. A trusted publisher is configured on an
      existing package, so this can only happen after the first publication

### Test fixtures still missing

- [ ] Clickable `div` without `tabindex`. The behaviour is decided — such an element is not in
      `FOCUSABLE_SELECTOR`, so it is never a candidate
      ([ADR-0009](docs/adr/0009-hidden-candidates.md), [ADR-0005](docs/adr/0005-real-dom-focus.md))
      — and no fixture pins it. The nearby `#span` case covers a plain non-interactive element and
      does not stand in for this one
- [ ] One fixture per line of the gap table of [ADR-0009](docs/adr/0009-hidden-candidates.md):
      `clip-path`, overflow-clipped candidates, candidates outside the scroller's viewport, and
      `visibility: hidden` on the fallback path. None of the four exists
- [ ] Find a benchmark runner, then write two benchmarks. `vitest` 5 exports no `bench` function, so
      neither exists. Until one does, the only performance gate is the median-of-51 guard in
      `src/spatial/geometry.test.ts:156-177`, and it measures `findBestCandidate` alone — not
      `collectNavNodes`, `getBoundingClientRect`, `querySelectorAll` or `checkVisibility`
- [ ] The second benchmark covers an end-to-end move, so that blind spot is measured rather than
      described; every figure it prints records the machine, the browser and the date
      ([ADR-0018](docs/adr/0018-testing-strategy.md))
- [ ] Decide whether the timing guard belongs in CI at all, where machine variance is not
      controlled — measure first

### Documentation and demo

- [ ] README: recorded GIF of a real navigation session
- [ ] Demo video and GIF rendered with Remotion: one composition drives the playground fixtures with
      scripted intents and exports an MP4 for the documentation and a GIF for the README. Its one
      prerequisite, the engine wired into the playground, is done

### Device verification

- [ ] One real television verified, Tizen or webOS, with a dated device report: model, firmware,
      Chromium version, what worked, what did not
- [ ] One gamepad verified on desktop with a dated report: pad model, browser, mapping observed
- [ ] Publish both reports under `docs/` so later claims can point at them

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
      [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md) proposes, **2026-12-31**: the
      es2020 output does not parse on Chromium below 80, and Tizen 5.5/6.0 are Chromium 69/76,
      webOS 5/6 are Chromium 68/79 (the table with its vendor URLs is in
      [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md)). The
      rule is settled: no device report by that date means no legacy build — silence defaults to
      dropping it, not to keeping it
- [ ] Second device family verified with its own dated report
- [ ] Focus ring under `forced-colors: active`. `box-shadow` is suppressed outright in a
      forced-colours theme, so the ring disappears, and an inline style cannot carry the media query
      a stylesheet would have used ([ADR-0020](docs/adr/0020-focus-ring-defaults.md)). The fix is a
      `matchMedia` read in the plugin, or an optional stylesheet
- [ ] Shadow DOM traversal and coherence. v0 does not traverse shadow roots in `getFocusables`
      (`src/tabbable.ts:69`, where `querySelectorAll` stops at the boundary), while the shadow-aware
      `contains` in `src/dom/query.ts:24` already walks out through hosts and is deliberately unused
      — the seam the v1 path will call. The inconsistency is deliberate and documented in
      [ADR-0008](docs/adr/0008-shadow-dom.md), whose skipped acceptance fixture stays in place until
      this lands (`src/spatial/spatial.browser.test.ts:855-877`). The direction is full coherence:
      walk from the scan root collecting `element.shadowRoot`, one `querySelectorAll` per open root
      concatenated in document order, replace `Node.contains` with the shadow-aware `contains` in
      the spatial hot path, and resolve `document.activeElement` through `shadowRoot.activeElement`
      chains
- [ ] Implement (C2): exclude `opacity: 0` candidates, passing `opacityProperty: true` to
      `checkVisibility` where the browser offers it
      ([ADR-0009](docs/adr/0009-hidden-candidates.md)). Refused for v0 and deferred here: opacity
      comes from a computed style, so it costs a `getComputedStyle` call per candidate in the hot
      navigation loop, and opacity inherited from an ancestor escapes `checkVisibility`'s
      own-element check anyway — the change would not close the gap it targets. Its fixture is v1
      work, alongside the other filters
- [ ] The remaining `@standarx/nav/debug` diagnostics of
      [ADR-0010](docs/adr/0010-dev-mode-diagnostics.md) — items 1, 2, 3 and 5, scoped out of v0
      because only item 4, `explainMove`, had anything to ship: (1) a reachability scan,
      `scanUnreachable(root)`, reporting elements that look interactive and are not focusable, with
      a confidence level per signal — `role` and `onclick` at High, a `cursor: pointer` computed
      style at Low and gated behind its own open rider, **(O1)**, on whether the scan runs it by
      default; (2) a depth warning when the container walk saturates `MAX_CONTAINER_DEPTH` without
      finding a boundary; (3) a redirection warning for every `data-snav-up/down/left/right` that
      resolves to nothing or to a non-focusable element; and (5) a short printed note on how to make
      an element navigable, shown when the scan finds nothing

## Later

- [ ] Vidaa and Vizio remote key codes, added only once a device report exists — no public
      documentation of their runtime versions was found
- [ ] Other TV platforms not in the default keymap today: Roku, Fire TV, Android TV
- [ ] Focus ring positioned with CSS anchor positioning instead of a WAAPI overlay, once the
      baseline allows it
- [ ] Revisit `MAX_CONTAINER_DEPTH`, 16 today (`src/spatial/spatial.ts:60`), if a real layout ever
      hits it — measure first

## Owner actions outside the repository

These are decisions nobody else can make.

- [ ] Install the Renovate GitHub App on the organisation. `renovate.json` is committed, but no
      installation reads it yet
- [ ] Reserve the brand on the third-party `standarx` GitHub organisation
      ([ADR-0001](docs/adr/0001-name-scope-and-attribute-prefix.md))
- [ ] Enable 2FA on the npm publishing account before the first release
      ([ADR-0012](docs/adr/0012-versioning-and-release.md))

## Success metrics

- [ ] Record the first external user, with the issue or repository link
- [ ] Record the first third-party issue that is not from the owner
- [ ] Record weekly downloads with the command and date used to read them, once published — measure
      first; before the first publication this number does not exist
