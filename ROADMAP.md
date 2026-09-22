# Roadmap

Status: unreleased. Nothing is published on npm, nothing has been run on a television, and no demo
exists yet.

This file lists what is still open. What is done is in the git history, and will be in the CHANGELOG
once a release has actually run.

## How this file is maintained

- An item that depends on a measurement says "measure first"; it cannot be closed by an opinion.
- New work is added to the section it belongs to, never silently retitled.
- An item is removed when it ships, not ticked — the commit is the record.

## v0: what is left before the first publication

The engine navigates between focusable elements, the five controls that hold a value are wired, the
`<select>` question is answered and the on-screen keyboard is built. **One thing blocks the first
publication**: the release tooling is wired but has never run, and the account it would publish from
has neither a token nor 2FA.

The two sections below are not blockers. The keyboard's open items are limitations of a shipped
module, documented rather than discovered; the release section is the blocker.

Controls that hold a value were the last gap to close before this one. The grammar was always public —
`pushEngageScope` takes hold of a control, the directional intents become adjustments, confirm
commits and back restores the entry value (`src/engage.ts:49`) — and nothing used it. The four
controls it was written for are now wired in the playground — the listbox beside them takes a
trapped scope instead, because a list is moved through rather than adjusted — and all five are
driven by `src/engage.browser.test.ts`, and the `<select>` question is settled in
[ADR-0021](docs/adr/0021-native-select-on-television.md).

Four constraints came out of writing them, and all four are worth knowing before the surface
freezes at v1. A number field cannot be a native `<input type="number">`: that is a text-entry
target, and `select` is not one of the intents allowed to cross one, so A never reaches the control.
Engage can only be released by the bus — its dispose detaches in silence — so a control the user
tabs out of while holding it has to redo the commit-or-restore bookkeeping itself. A trapped scope
does not confine the focus; `data-snav-trap` on the container does, because the engine is a `base`
scope and is asked through a trap on purpose. And inside a trap nothing activates the focused
element for you: `select` cannot escape a trap, so the dispatch reports it consumed and
`activateFocused` stands down.

### Virtual keyboard

A television has no keyboard, and this one is built: `@standarx/nav/keyboard` with `/keyboard/qwerty`,
`/keyboard/azerty` and `/keyboard/alphabetic` as data entries, capped in
[ADR-0017](docs/adr/0017-size-budgets.md) and driven by `src/keyboard/keyboard.browser.test.ts`.

The design is [ADR-0022](docs/adr/0022-virtual-keyboard.md): the keys take real focus,
because the alternative is the virtual cursor [ADR-0005](docs/adr/0005-real-dom-focus.md) refuses; a
layout is data in its own module and the consumer passes it in, because a self-registering layout is
a side effect and a registry is how a French application ends up shipping Cyrillic; insertion is
`beforeinput`, then the mutation, then `input`, so a mask or a length limit can refuse a keystroke;
and composition is deferred, so a CJK layout needs its own record first. `back` closes the keyboard
and **keeps** what was typed — deliberately unlike engage mode, where B restores, because a slider's
value is re-set with one press and thirty seconds of typing on a remote is not re-entered at all.
The field draws no caret while the keys hold the focus; the keyboard's own preview row, at the
bottom of its box, draws one mirrored from the field's selection, and the directions move it from
that row. `data-snav-editing` is the field-side hook and the application styles it.

Writing it corrected three things the record had not foreseen, and the first amendment to ADR-0022
carries them: a controlled React field rejected a keystroke on the one path that assigns `value`
directly, because that is the property React instruments — fixed by going through the prototype's
setter; a field with no selection at all, `type="email"` among them, would have thrown on
`setRangeText`; and the caret had to be placed on open, because `focus()` leaves it at 0 and a space
then lands in front of what is already there. Driving it on a real page corrected more, and the two
later amendments carry those: a keyboard that opened on hover, a box with no paint, an open keyboard
that swallowed the page's activations, a shift key that dropped the focus to `body`, and a stale
playground rule that stretched the box over the field.

- [ ] **A clear-all and a forward-delete action.** Erasing a forty-character email is forty presses,
      and the caret sits between characters where `⌫` removes the one before it. Both are new
      `action` values a layout carries; the azerty layout line is at 97% of its cap, so the first
      layout to carry them needs an [ADR-0017](docs/adr/0017-size-budgets.md) amendment
- [ ] Feedback when an application cancels `beforeinput`: the preview row does not change and the
      user presses again. `edit()` returns `false` on that path and nothing reads it
- [ ] Up from the preview row lands on the key nearest the row's centre, not on the key the user
      came from. Remembering that key costs a hidden state; measure whether the extra presses matter
      on a real remote first
- [ ] Selection in the preview row. A range the application set is drawn as a caret at its start and
      the next key edits the range; the keyboard never creates one
- [ ] A CJK layout, and the composition ADR it needs first. The package stands aside from IME today
      (`src/input-system.ts:158-160`), and a layout that composes would have to own it
- [ ] `contenteditable`. The keyboard declines it deliberately — inserting into a range is easy and
      erasing one character backward across element boundaries is not — and the refusal is pinned by
      a test. Closing it means choosing between `selection.modify`, which is not a standard, and a
      text-node walk

### Release tooling

The wiring is in place: `release-please-config.json`, `.release-please-manifest.json` and
[.github/workflows/release.yml](.github/workflows/release.yml), three jobs — release-please, a
verify that replays every gate on the tag, then a publish that calls the npm CLI with
`--provenance`. It has never run: nothing reaches it until this branch is on `main`.

Two things about its shape are worth knowing before reading it. The publish job lives in the
**same run** as release-please rather than in a tag-triggered workflow, because GitHub does not
trigger workflows on events made with the default token — the same rule that leaves the release
pull request with no checks would have left a tag-triggered publish never running at all. And the
verify job exists precisely because of that missing-checks half: the version bump and the CHANGELOG
that land on `main` were never seen by CI.

- [ ] First npm publication of a 0.x version with provenance. Needs a granular `NPM_TOKEN` secret,
      2FA on the publishing account, and the owner's hand on the merge of the release pull request
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
