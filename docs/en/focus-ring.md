# Focus ring

`@standarx/nav/focus-ring` is one overlay element that follows `focusin`, so it rings a keyboard
Tab, a gamepad move and a programmatic `focus()` alike. It is off unless you mount it, and **no
stylesheet ships**: the plugin writes its own paint inline, which is why there is nothing to import
and nothing to forget to import. It measures and animates its own overlay and never touches an
application's elements.

```ts
import { createInputSystem } from "@standarx/nav";
import { focusRingPlugin } from "@standarx/nav/focus-ring";
import { spatialPlugin } from "@standarx/nav/spatial";

const input = createInputSystem({
  plugins: [spatialPlugin({ mode: "app" }), focusRingPlugin()],
});
```

`focusRingPlugin({ offset?, duration? })` takes the two values that are also custom properties
below, and exposes `refresh()` for a layout change the overlay cannot see.

Six CSS custom properties are the whole contract. Set them anywhere the overlay inherits from:

| Property | Fallback | What it sets |
|---|---|---|
| `--snav-focus-ring-z-index` | `1700` | The stacking rung. `position: fixed` opens no stacking context, so without a z-index the ring paints in DOM order and goes behind the first dialog it meets. `1700` is a rung above a modal, a popover, a toast and a tooltip — an ordering inherited from the predecessor implementation ([ADR-0002](../adr/0002-license-and-copyright.md)) and kept for the reason [ADR-0020](../adr/0020-focus-ring-defaults.md) gives. |
| `--snav-focus-ring-width` | `3px` | The ring's thickness, drawn as a `box-shadow` spread. |
| `--snav-focus-ring-color` | `#1a73e8` | 4.51:1 on white and 4.36:1 on `#0b0b0f`, both above the 3:1 WCAG SC 1.4.11 asks of a non-text indicator. |
| `--snav-focus-ring-offset` | `2` | Pixels between the target's box and the ring. Overridden by the `offset` option. |
| `--snav-focus-ring-duration` | `260`, or `150` under reduced motion | How long the ring takes to slide; at zero there is no fade either. Overridden by the `duration` option. |
| `--snav-focus-ring-easing` | `cubic-bezier(0.22, 1, 0.36, 1)` | The slide's easing. |

Appearing and disappearing fade over 150 ms through WAAPI, and the fade is skipped outright under
`prefers-reduced-motion` and whenever the duration resolves to zero: `focusRingPlugin({ duration:
0 })`, or `--snav-focus-ring-duration: 0ms` (or `0s`), turns off the fade as well as the slide.
That is the switch for an application's own "no motion" setting; any other duration keeps the
150 ms fade (`src/focus-ring/focus-ring.browser.test.ts:197-235`, on chromium, firefox and webkit;
[ADR-0020](../adr/0020-focus-ring-defaults.md), amendment of 2026-09-23). Two things the inline
style cannot do are written down in
`src/focus-ring/focus-ring.ts`: a custom property of the wrong type makes the whole declaration
invalid with no earlier declaration to fall back to, and `forced-colors: active` suppresses
`box-shadow`, so the ring disappears in a forced-colours theme — a v1 item on
[ROADMAP.md](../../ROADMAP.md), not a v0 fix.
