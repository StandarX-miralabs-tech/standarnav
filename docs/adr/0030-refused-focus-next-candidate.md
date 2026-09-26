# ADR-0030: A refused focus hands the move to the next candidate

Status: Accepted
Date: 2026-09-24
Deciders: Wesley Cormier

## Context

The engine moves the real focus ([ADR-0005](0005-real-dom-focus.md)) and, since 2026-09-23,
checks that it landed before writing anything; after a refusal `move()` returned `false`, and
specification R21 wrote that down as "the engine does not try the next candidate".
[Issue #19](https://github.com/StandarX-miralabs-tech/standarnav/issues/19) named three gaps: a
refused candidate ended the move though a next best was often right behind it; `isFocusable`
offered candidates every engine refuses; and the `pointerover` handler of `pointerFollowsFocus`
wrote `data-snav-focused` and the container memory without checking the landing.

Every arm of `FOCUSABLE_SELECTOR` was placed inside an editing host, with no tabindex, and focused
from a button outside it, on 2026-09-24 (Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6,
Playwright 1.63.0; Evidence):

| Inside an editing host, no tabindex | chromium | firefox | webkit |
|---|---|---|---|
| `input`, `select`, `textarea`, `button` | focused | focused | focused |
| `a[href]`, a child or a grandchild of the host | refused | refused | refused |
| `area[href]` of an image map in use | refused | focused | focused |
| `iframe`, with or without `srcdoc` | focused | focused | focused |
| `object` with `data` / empty | focused / focused | focused / **refused** | focused / focused |
| `embed` with `src` / with `type` and no `src` | focused / **refused** | focused / focused | focused / **refused** |
| `audio[controls]`, `video[controls]` | focused | focused | focused |
| the first `<summary>` of a `<details>` / the second | focused / refused | focused / refused | focused / refused |
| a nested `[contenteditable]` (`true`, `plaintext-only`) | refused | refused | refused |
| a `span` with `tabindex` 0 or -1 | focused | focused | focused |
| `input`, `select`, `textarea`, `button`, `iframe`, `object`, `embed`, `audio` or a first `<summary>` carrying `contenteditable` itself | focused | focused | focused |
| an `a` or a `div` carrying `contenteditable` | refused | refused | refused |

With a tabindex, 0 or -1, a nested editable is focused on all three and a link on chromium and
webkit only; so is a link in a `contenteditable="false"` island of a host, with no tabindex. An
editable in such an island is a new host, focused on all three. Outside any host a second, a deeper and an orphan `<summary>` are
refused on all three. `isTabbable` said `true` for the link in a host, which no Tab key reaches.

## Decision

**1. What all three engines refuse is not focusable, in the core.** `isFocusable` rejects an
element with no `tabindex` attribute whose parent is editable and that matches none of the arms
that take the focus in their own right, now a named list (`NATIVE_SELECTOR`,
`src/tabbable.ts:18-30`; the rule at `:73-81`). That rejects exactly the refused rows of the table:
a link, and an element focusable only for being editable. The `summary` arm becomes
`details>summary:first-of-type`. `FOCUSABLE_SELECTOR` is public, and its string changes: the native
arms first, then `a[href]`, `[contenteditable]:read-write` and `[tabindex]` (`:32-39`). The rule is
in `src/tabbable.ts` rather than in the spatial engine because `isFocusable`, `isTabbable` and
`getFocusables` are exports of the core (`src/index.ts`) that an application reads as well, and an
answer of "focusable" for what no engine focuses is wrong for every caller. It costs the core line
36 bytes, for which [ADR-0017](0017-size-budgets.md) raised the cap to 3.50 kB in its own commit.
`inTabOrder`'s nested-editable clause stays: an `embed` in a host is editable and reports
`tabIndex` -1 on chromium and webkit, as do `audio` and `video` on webkit, so without the clause
they would become Tab stops.

**2. The refusals the engines split on are left to a retry, in the spatial engine.** A static rule
cannot follow them without sniffing the engine. `commit()` reads the deepest active element before
and after the focus call, through open shadow roots (`src/spatial/spatial.ts:338-345`, `:360-364`):

- the target, in its own root (`landed`, `:354-356`): the move landed;
- unchanged: the browser refused; the target joins the move's refused set, `commit` answers `null`;
- anything else: an application's focus handler moved it; the move stops, `false`, nothing written.

**3. After a refusal, in order:** the next best in the same container, rescored without what
refused; the wrap candidate of that same filtered list if the container wraps; the scroll and
rescan; the parent container, and outwards; and `onBoundsHit` when everything refused
(`attempt`, `:378-391`, driven by `move`, `:483-528`). A redirect whose target refuses falls through
to the geometry, as one whose target is not focusable does (R28); a vetoed redirect, or one the
application sent elsewhere, stops. `enter="last"` skips a remembered child that refused and enters by
geometry, `enter="first"` takes the next node, and a nested container with nothing that lands counts
as refused as a unit (`enterContainer`, `:393-427`). `focusFirst` tries its nodes in order
(`:530-538`). `focus(target)` names one target and has no next best: a refusal is its answer
(`:639`). A veto still ends the move, with no retry and no `onBoundsHit`. `onWillMove` fires once
per attempted candidate.

**4. The refused set belongs to one operation.** It is a parameter of `move`, created per call, and
local to `focusFirst` and `focus`; the public `move` takes the direction alone (`:629`), so a caller
passing it as a callback cannot hand an index in as the set. The rescan frame receives the move's
own set, so an element that refused before the scroll is not tried again after it (`:471-475`).
Nothing keeps it on the plugin, so no element that refused is held once the operation and its frame
are over, on the `WeakRef` fallback path of [ADR-0013](0013-browser-baseline-and-fallbacks.md) as
on any other.

**5. A hover marks only what took the focus.** The `pointerover` handler writes the marker and the
memory only when `landed` says so (`:601`), and still bypasses `onWillMove` (ADR-0005, amendment
of this date).

**6. `explainMove` keeps not focusing,** so its winner may be an element the engine skips, now a
documented difference (`src/debug.ts:34-41`; [ADR-0010](0010-dev-mode-diagnostics.md), amendment
of this date).

## Consequences

- `onBoundsHit` fires when every candidate refused, where the move used to end silently. A listener
  that counts moves through `onWillMove` counts attempts.
- Each retry reruns `collectNavNodes`: a move costs refusals times candidates. After decision 1 the
  refusals left are the ones an engine splits on, and a stubbed `focus`.
- Two limits of the landing check, recorded rather than fixed. The deep read stops at a closed
  shadow root, so a focus an application moves between two elements inside one reads as a refusal;
  and a focus handler that sends the focus straight back to where it was cannot be told from a
  refusal, so the move goes on to the next candidate.
- The spatial line measures 3 318 bytes of its 3 328, 10 left (ADR-0017, amendment of this date).
  Specification R21, R26, R27, R28, R30 and §4 are amended to match this record.
- A neighbouring false negative is left for its own issue: an `<area href>` of an image map in use
  is focused by all three engines, while `isFocusable` answers `false` on chromium and webkit
  (Evidence).

## Alternatives considered

- **The static filter in `collectNavNodes`, spatial only.** It fitted both caps without an
  amendment. Rejected: the public `isFocusable` and `isTabbable` would go on answering "focusable"
  and "Tab stop" for what no engine focuses.
- **A retry alone, with no static filter.** Every move past a known dead element would pay a focus
  call and an `onWillMove` call, and `isTabbable` would stay wrong.
- **A focus moved elsewhere read as a refusal.** Rejected: the retry would pull the focus away from
  where an application sent it. A read of the target's own root alone does exactly that across a
  shadow boundary, which is why the read goes deep.
- **Clearing the refused set before the rescan frame.** Simpler, and it tries the refused element
  again after the scroll, with one more `onWillMove`; carrying it costs one parameter.
- **A refused set on the plugin, cleared by the next move**, as the exploratory spike had it: it
  held the last refused element strongly until the next move or the teardown. Rejected for ADR-0013.
- **A veto as "skip this one".** Rejected: a veto is the application's no to the move, pinned by
  "lets a machine veto a move before the focus goes anywhere".

## Evidence

- The table of the Context: a temporary browser fixture under `src/`, run with
  `SNAV_BROWSER=chromium|firefox|webkit bun run test:browser` on 2026-09-24 and deleted before any
  commit. Pinned by "drops a link and a nested editable of an editing host, unless they carry a
  tabindex", "keeps a link with a tabindex in an editing host, which the engines split on" and
  "takes only the first summary child of a details as focusable" (`src/tabbable.browser.test.ts`),
  and "steps over a second summary, which chromium, firefox and webkit all refuse" and "steps over a
  link and a nested editable inside an editing host" (`src/spatial/spatial.browser.test.ts`).
- The retry: the `describe` "spatialPlugin — a refused candidate hands the move on (ADR-0030)" in
  `src/spatial/spatial.browser.test.ts`, nineteen cases, whose witness is a `focus` method replaced
  by a no-op; its cases on a real `<embed>` and a real empty `<object>` expect whatever the running
  engine does. Mutating the code on 2026-09-24: a read of the target's own root alone fails both
  shadow-root cases, a read of the document alone fails the second, and a set not carried over the
  frame fails the rescan case. The hover: "spatialPlugin — a hover marks only what took the focus
  (ADR-0005)", three cases. `explainMove`: "names a winner the browser refuses, where the engine
  goes on to the next" (`src/debug.browser.test.ts`).
- 2026-09-24: `bun run test` → 605 passed, 1 skipped (606) in 32 files, of which `bun run test:unit`
  121 in 14 and `bun run test:browser` 484 and the skip in 18; the three touched browser files on
  chromium, firefox and webkit → 100 passed, 1 skipped each. `bun run check:size`: core 3.27 kB
  (3 346 B) of 3.50, spatial engine 3.24 kB (3 318 B) of 3.25, debug 0.49 kB (499 B) of 0.50.
- The real page, 2026-09-24: a Playwright script put rows `a | refusing | c` in the playground
  (`app` mode) and pressed ArrowRight on each engine. With a second `<summary>`, a nested editable
  or a button whose `focus` does nothing in the middle, the focus stayed on `a` at cc0b219 and
  reached `c` with this change; hovering each wrote `data-snav-focused` on it at cc0b219 only.
- The `<area>`, in the fixture of the first item, outside any host: focused on all three engines;
  `checkVisibility()` `false`, no client rect and `isFocusable` `false` on chromium and webkit;
  `true`, one rect and `true` on firefox.
