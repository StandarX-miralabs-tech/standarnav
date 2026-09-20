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
