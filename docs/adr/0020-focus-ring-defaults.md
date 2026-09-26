# ADR-0020: Focus ring defaults, and why no stylesheet ships

Status: Accepted
Date: 2026-09-20
Deciders: Wesley Cormier

## Context

`@standarx/nav/focus-ring` is an overlay element that follows `focusin`, so it rings a keyboard
Tab, a gamepad move and a programmatic `focus()` alike. The engine that draws it was written
against a stylesheet that supplied its colour, width, radius and stacking rung. This package
carries no stylesheet, and it never will: a headless navigation engine that ships CSS has opinions
about how an application looks.

Shipped as it stood, the ring would have painted nothing. An overlay with no colour and no spread
is invisible, and the failure is silent — no error, no warning, just a focus indicator that never
appears. That is worse than shipping no ring at all, because the plugin reports success.

## Decision

**The plugin paints itself inline, and every value falls back to a custom property the application
can override** (`src/focus-ring/focus-ring.ts:51-52`). Three options were on the table — inline
defaults, an optional stylesheet, or dropping `focus-ring` from v0 — and the first was taken.

| Property | Fallback | Why this value |
|---|---|---|
| `--snav-focus-ring-color` | `#1a73e8` | 4.51:1 on white and 4.36:1 on `#0b0b0f`, both above the 3:1 that WCAG SC 1.4.11 asks of a non-text indicator |
| `--snav-focus-ring-width` | `3px` | The ring's own spread |
| `--snav-focus-ring-z-index` | `1700` | Above a modal, a popover, a toast and a tooltip. `position: fixed` opens no stacking context, so without a z-index the overlay paints in DOM order and goes behind the first dialog it meets |
| `--snav-focus-ring-offset` | `2` | How far outside the target the ring sits, in pixels (`src/focus-ring/focus-ring.ts:104-106`) |
| `--snav-focus-ring-duration` | 260 ms, or 150 ms under reduced motion | `src/focus-ring/focus-ring.ts:128-139` |
| `--snav-focus-ring-easing` | `cubic-bezier(0.22, 1, 0.36, 1)` | `src/focus-ring/focus-ring.ts:31`, `:137-138` |

Show and hide fade over 150 ms through the Web Animations API, skipped entirely under reduced
motion (`src/focus-ring/focus-ring.ts:147-154`). This replaces a `transition: opacity` that only
worked from a stylesheet: nothing transitions an inline style assigned in the same task, so without
the explicit animation the ring cuts in and out.

The radius is not in the table because it is not a constant. It is read from the focused element,
so the ring wears the shape of whatever it is around — a capsule on a control, a rounded rectangle
on a field (`src/focus-ring/focus-ring.ts:114-116`).

## Consequences

- The contract is six custom property names, not five. The sixth is the z-index, added when the
  ring was found painting behind modals. [ADR-0001](0001-name-scope-and-attribute-prefix.md)
  carries the same six under the naming rule.
- **A custom property of the wrong type computes the ring to nothing, silently.** An invalid
  substitution makes the whole declaration invalid at computed-value time, and because the
  declaration is inline there is no earlier one to fall back to. One typo in an application's
  stylesheet removes the focus indicator with no error anywhere. The limit is written at the
  declaration itself (`src/focus-ring/focus-ring.ts:44-49`) because nothing can catch it at runtime.
- **`forced-colors: active` suppresses `box-shadow` outright**, so the ring disappears in a
  forced-colours theme. An inline style cannot carry the media query a stylesheet would have used.
  This is a v1 item in [ROADMAP.md](../../ROADMAP.md), recorded rather than discovered later.
- An application that wants a different ring writes six declarations at most, and needs no build
  step, no import and no stylesheet ordering to make them win — an inline style with a custom
  property is overridden by defining the property, not by out-specifying a selector.

## Amendment, 2026-09-23: a zero duration removes the fade too

The decision above fades show and hide over 150 ms and skips the fade only under reduced motion.
Issue #12 found the hole in that: a host that turns its own motion off by resolving
`--snav-focus-ring-duration` to `0ms` stopped the ring travelling, but every hide and every return
still ran a 150 ms opacity animation, because `fade` animated over the constant `FADE_DURATION`
whatever the ring's duration was.

**The fade now reads the ring's resolved duration and is skipped when it is zero or less.**
`fade` calls `motion()` (`src/focus-ring/focus-ring.ts:128-139`), which resolves the same value
the move uses — the `duration` option, else `--snav-focus-ring-duration`, else 260 ms, or 150 ms
under reduced motion — and returns before animating when that value is `<= 0` or reduced motion
is on (`src/focus-ring/focus-ring.ts:147-154`). The move already stopped at the same bound
(`src/focus-ring/focus-ring.ts:182`). A positive duration leaves the fade exactly as it was:
150 ms, `FADE_DURATION`, with the fallback easing.

Two things were left out on purpose. The fade is not scaled to the duration (no
`min(150, duration)`): nothing asked for it, and the only case reported is the off switch. And no
seventh custom property: the issue suggested `--snav-focus-ring-fade-duration`, but the contract
stays the six names above and in [ADR-0001](0001-name-scope-and-attribute-prefix.md), and the host
in the report already sets the property that now switches the fade off.

Evidence, 2026-09-23, in this repository:

- `src/focus-ring/focus-ring.browser.test.ts:210-235`, "neither fades in nor out with %s", runs
  three ways — the `duration` option at `0`, and `--snav-focus-ring-duration` at `0ms` and at `0s`
  set on the ring — and asserts `ring.getAnimations()` is empty after a hide and a return, both
  through `pause`/`resume` and through a switch to `pointer` modality and back. Before the fix all
  three failed on chromium, firefox and webkit with `expected [ Animation{} ] to have a length of
  +0 but got 1`.
- `src/focus-ring/focus-ring.browser.test.ts:197-208`, "fades out and back in over 150 ms by
  default", is the guard the other way: with no duration set, the hide and the return each start
  one opacity animation whose timing reports `duration` 150, on all three engines.
- `bun run test:browser src/focus-ring`, with `SNAV_BROWSER` set to chromium, firefox and webkit
  in turn → 17 passed on each.
- On the playground (`bun run dev`), a Playwright script recording every `animate` call on the
  overlay, with `--snav-focus-ring-duration` set on the root element: at `0ms` and at `0s` a
  pointer click that hides the ring and a Tab that brings it back start no opacity animation on
  chromium, firefox or webkit. The same script against `main` before the fix recorded a 150 ms
  fade for each at `0ms`, and after the fix it still records one for each when the property is
  unset.

## Amendment, 2026-09-26: the ring wears an area's shape over its image

The ring measured its target with `getBoundingClientRect()`. For an `<area>` of an image map in
use, which every engine focuses, chromium and webkit answer all zero and firefox the whole image's
rect ([ADR-0031](0031-image-map-area-candidate.md), measured on 2026-09-26), so the ring sat at the
top-left corner of the viewport, about 4 px square with its offset, on the first two, and around the
whole image on the third.

**`measure` now reads `rectOf`** (`src/focus-ring/focus-ring.ts:107`), the rect the spatial engine
scores a candidate by (`src/dom/platform.ts:14-48`): an area's `shape` and `coords` laid over the
border box of the image that uses its map, and any other element's own `getBoundingClientRect()`.
The ring is drawn around the shape's box, so a circle is ringed by its bounding square; the radius
is still read off the target's computed style (`src/focus-ring/focus-ring.ts:114-116`), the area's
here. The ring's own live rect, from which it travels, is untouched (`:175`).

`rectOf` reaches `imageOf` in `tabbable.js`, which the core line carries and nobody reaches
`/focus-ring` without, so the focus ring size line marks it external
(`scripts/size-budget.ts:105`). The line measured 1 863 bytes min+gzip on 2026-09-26, over its
1.75 kB cap, which [ADR-0017](0017-size-budgets.md) raised to 2.00 kB in its amendment of that date,
before the code.

Evidence, 2026-09-26: "wears the shape of an area over its image"
(`src/focus-ring/focus-ring.browser.test.ts:249-267`) puts a circle of radius 30 at (50, 50) on an
image at (100, 100) and expects a 64 px square ring at (118, 118); it fails at cf28e57 on chromium,
firefox and webkit, and passes on all three with the change. On the playground's image map, driven
with Playwright on the three engines, the ring around a 90 px circle measured 94 px square.

## Alternatives considered

**Ship an optional stylesheet.** Rejected: it reintroduces the problem the package exists to avoid.
A consumer must then remember an import, an import that does nothing until it is ordered correctly,
and the plugin's behaviour depends on a file the bundler may tree-shake away. "Nothing to import"
is why there is nothing to forget to import.

**Drop `focus-ring` from v0.** Rejected: it is the piece that makes spatial navigation legible on a
television across the room, and the one a consumer is least likely to write themselves correctly —
the stacking rung and the reduced-motion handling are both easy to get wrong and invisible when
wrong.

**Ship no fallbacks and require the application to define all six.** Rejected for the same reason as
shipping no ring: the failure mode is an invisible focus indicator, and it fires for anyone who
mounts the plugin without reading this far.
