/**
 * The focus ring that slides between elements — a delight, never a dependency.
 * Zero bytes if it is not imported, and without it the fallback is whatever outline
 * the application already draws.
 *
 * It cannot be pure CSS yet. Anchor positioning is the promising route — anchor the
 * ring on `:focus-visible` and transition it — but the interop is not there, so this
 * is WAAPI over one overlay element and the enhancement can be revisited later.
 *
 * The module measures and animates its own overlay, and never touches an
 * application's elements. The "lift" — the focused control itself growing slightly
 * under a gamepad — is not shipped; it is three lines of CSS an application writes
 * against `html[data-snav-input="gamepad"] [data-snav-focused]`.
 *
 * It listens to `focusin`, not to the spatial engine, so it rings a keyboard Tab, a
 * gamepad move and a programmatic `focus()` alike — one ring for every modality.
 */

import { addDomEvent } from "../dom/event";
import { prefersReducedMotion } from "../dom/platform";
import { isHTMLElement } from "../dom/query";
import type { InputPlugin } from "../input-system";
import { isFocusVisibleModality, trackInputModality } from "../modality";
import type { InputModality } from "../types";

export const RING_ATTRIBUTE = "data-snav-focus-ring";

const DEFAULT_DURATION = 260;
const REDUCED_DURATION = 150;
const FADE_DURATION = 150;
const FALLBACK_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * The paint and the stacking, which the source took from a stylesheet this package
 * does not carry. `#1a73e8` is 4.51:1 on white and 4.36:1 on `#0b0b0f`, both above
 * the 3:1 WCAG SC 1.4.11 asks of a non-text indicator, and `1700` is the rung the
 * source gave the ring — above its modal, popover, toast and tooltip — so an
 * ordinary stacking context cannot bury it. The overlay carries no z-index of its
 * own otherwise: `position: fixed` opens no stacking context, so it would paint at
 * the root level in DOM order and go behind the first dialog it meets.
 *
 * An application overrides any of the three through the custom properties.
 *
 * Two things this cannot do. A value of the wrong type still substitutes, which
 * makes the whole declaration invalid at computed-value time — and because it is
 * inline there is no earlier declaration to fall back to, so one typo computes the
 * ring to nothing with no error anywhere. And `forced-colors: active` suppresses
 * `box-shadow` outright, so the ring disappears in a forced-colours theme; an
 * inline style cannot carry the media query the stylesheet used for that.
 */
const RING_PAINT =
  "z-index:var(--snav-focus-ring-z-index, 1700);box-shadow:0 0 0 var(--snav-focus-ring-width, 3px) var(--snav-focus-ring-color, #1a73e8)";

export interface FocusRingOptions {
  /** How far outside the target the ring sits. Falls back to the CSS custom property. */
  readonly offset?: number | undefined;
  /** Overrides the `--snav-focus-ring-duration` custom property. */
  readonly duration?: number | undefined;
}

export interface FocusRingPlugin extends InputPlugin {
  /** Re-measures the current target — after a layout change the ring cannot see. */
  refresh(): void;
}

interface Geometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: string;
}

function readPixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readMilliseconds(value: string, fallback: number): number {
  const trimmed = value.trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return trimmed.endsWith("ms") ? parsed : parsed * 1000;
}

export function focusRingPlugin(options: FocusRingOptions = {}): FocusRingPlugin {
  let ring: HTMLElement | null = null;
  let win: Window | null = null;
  let target: HTMLElement | null = null;
  let modality: InputModality = "pointer";
  let placed = false;
  let visible = false;

  function styleOf(element: Element): CSSStyleDeclaration | null {
    return win?.getComputedStyle(element) ?? null;
  }

  function measure(element: HTMLElement): Geometry | null {
    const style = styleOf(element);
    const box = ring;
    if (style === null || box === null) return null;

    const ringStyle = styleOf(box);
    const offset =
      options.offset ??
      readPixels(ringStyle?.getPropertyValue("--snav-focus-ring-offset") ?? "", 2);
    const rect = element.getBoundingClientRect();

    return {
      x: rect.x - offset,
      y: rect.y - offset,
      width: rect.width + offset * 2,
      height: rect.height + offset * 2,
      // Read from the target so the ring wears the shape of whatever it is around —
      // a capsule on a control, a rounded rectangle on a field.
      radius: style.borderRadius,
    };
  }

  function apply(geometry: Geometry): void {
    if (ring === null) return;
    ring.style.width = `${geometry.width}px`;
    ring.style.height = `${geometry.height}px`;
    ring.style.borderRadius = geometry.radius;
    ring.style.transform = `translate(${geometry.x}px, ${geometry.y}px)`;
  }

  function motion(): { duration: number; easing: string; reduced: boolean } {
    const reduced = win !== null && prefersReducedMotion(win);
    const style = ring === null ? null : styleOf(ring);
    const duration =
      options.duration ??
      readMilliseconds(
        style?.getPropertyValue("--snav-focus-ring-duration") ?? "",
        reduced ? REDUCED_DURATION : DEFAULT_DURATION,
      );
    const easing = (style?.getPropertyValue("--snav-focus-ring-easing") ?? "").trim();
    return { duration, easing: easing === "" ? FALLBACK_EASING : easing, reduced };
  }

  /**
   * The appearing and disappearing the source stylesheet carried as
   * `transition: opacity`. Nothing transitions an inline style that is assigned in
   * the same task, so without this the ring cuts in and out. It is skipped under
   * reduced motion, as the source's zeroed token did, and at a duration of zero (#12).
   */
  function fade(from: number, to: number): void {
    const { duration, reduced } = motion();
    if (ring === null || reduced || duration <= 0) return;
    ring.animate([{ opacity: from }, { opacity: to }], {
      duration: FADE_DURATION,
      easing: FALLBACK_EASING,
    });
  }

  function hide(): void {
    if (ring === null || !visible) return;
    visible = false;
    ring.style.opacity = "0";
    fade(1, 0);
  }

  function moveTo(element: HTMLElement, animate: boolean): void {
    if (ring === null) return;
    const next = measure(element);
    if (next === null) return;

    // Coming back from hidden rather than travelling: the ring has to appear, and
    // the move animation below only carries geometry. First placement is neither —
    // it has nowhere to come from and nothing to fade.
    const returning = placed && !visible;
    const { duration, easing, reduced } = motion();
    // The ring's own live rect, so a burst of d-pad presses retargets from wherever
    // it visually is rather than restarting from the element it left three moves ago.
    const from = ring.getBoundingClientRect();
    const fromRadius = styleOf(ring)?.borderRadius ?? next.radius;

    apply(next);
    ring.style.opacity = "1";
    if (returning) fade(0, 1);

    if (!animate || !placed || duration <= 0) {
      visible = true;
      placed = true;
      return;
    }

    if (reduced) {
      // Movement becomes a crossfade — the ring never travels.
      ring.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "linear" });
    } else {
      ring.animate(
        [
          {
            transform: `translate(${from.x}px, ${from.y}px)`,
            width: `${from.width}px`,
            height: `${from.height}px`,
            borderRadius: fromRadius,
          },
          {
            transform: `translate(${next.x}px, ${next.y}px)`,
            width: `${next.width}px`,
            height: `${next.height}px`,
            borderRadius: next.radius,
          },
        ],
        { duration, easing },
      );
    }

    visible = true;
    placed = true;
  }

  function retarget(element: HTMLElement | null, animate: boolean): void {
    target = element;
    const document = ring?.ownerDocument ?? null;
    if (element === null || document === null || element === document.body) {
      hide();
      return;
    }
    // A ring is for the modalities that cannot point at anything; a mouse already
    // shows the user where they are.
    if (!isFocusVisibleModality(modality)) {
      hide();
      return;
    }
    moveTo(element, animate);
  }

  return {
    name: "focus-ring",

    setup(context): VoidFunction {
      const document = context.doc;
      win = document.defaultView;
      if (win === null) return () => {};

      const overlay = document.createElement("div");
      overlay.setAttribute(RING_ATTRIBUTE, "");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = `position:fixed;left:0;top:0;opacity:0;pointer-events:none;will-change:transform,width,height;${RING_PAINT}`;
      document.body.append(overlay);
      ring = overlay;

      modality = context.getModality();
      const teardowns = [
        trackInputModality(document, (next) => {
          modality = next;
          retarget(target, false);
        }),
        addDomEvent(document, "focusin", (event: FocusEvent) => {
          const next = event.target;
          retarget(isHTMLElement(next) ? next : null, true);
        }),
        addDomEvent(document, "focusout", (event: FocusEvent) => {
          if (event.relatedTarget === null) {
            target = null;
            hide();
          }
        }),
        // Following a scroll must not look like a move: the ring is not going
        // anywhere, the page is.
        addDomEvent(win, "scroll", () => retarget(target, false), {
          capture: true,
          passive: true,
        }),
        addDomEvent(win, "resize", () => retarget(target, false), { passive: true }),
      ];

      return () => {
        for (const teardown of teardowns.reverse()) teardown();
        overlay.remove();
        ring = null;
        win = null;
        target = null;
        placed = false;
        visible = false;
      };
    },

    pause(): void {
      hide();
    },

    resume(): void {
      retarget(target, false);
    },

    refresh(): void {
      retarget(target, false);
    },
  };
}
