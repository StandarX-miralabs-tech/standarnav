/**
 * The console-style pointer: the left stick pushes a dot around the screen and the
 * element under it takes the focus, the way a game console lets you point at a web
 * page instead of hopping between its controls.
 *
 * It is built here, on the package's public surface, and deliberately not inside the
 * gamepad engine. Two reasons, and the second is the real one.
 *
 * The engine measures 2.49 kB against a 2.50 cap ([ADR-0017](../docs/adr/0017-size-budgets.md)),
 * so a cursor mode there costs an amendment before a line of it is written. But the
 * better reason is that this file is the proof: a consumer can replace the whole
 * navigation grammar of a pad without the engine growing a mode for it. `assign` hands
 * one pad's intents to a private handler (`src/gamepad/gamepad.ts:121`), which is the
 * documented seam for exactly this, and the raw axes are read from the Gamepad API the
 * same way the engine reads them.
 *
 * The focus it moves is real focus, so [ADR-0005](../docs/adr/0005-real-dom-focus.md)
 * and the "never virtual focus" guarantee are untouched: there is no focus key, no id
 * map and no painted imitation of a ring. The dot points; `document.activeElement` is
 * still what answers where the user is.
 */

import { applyDeadZone } from "../src/gamepad/dead-zone";
import type { GamepadPlugin } from "../src/gamepad/gamepad";

export interface PadCursor {
  dispose(): void;
}

/** Pixels per second at full stick deflection — a screen's width in about two seconds. */
const SPEED = 900;
/** A frame delta is clamped so a backgrounded tab does not teleport the dot on return. */
const MAX_FRAME = 0.05;

const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]";

/**
 * `getGamepads` is absent on engines that never shipped the API, and throws rather
 * than returning nothing when a permissions policy forbids it — which is what happens
 * inside a cross-origin iframe. Both have to read as "no pads" rather than as an
 * exception that stops the animation frame for good.
 */
function readPads(): readonly (Gamepad | null)[] {
  if (typeof navigator.getGamepads !== "function") return [];
  try {
    return navigator.getGamepads();
  } catch {
    return [];
  }
}

export function attachPadCursor(pad: GamepadPlugin, padIndex = 0): PadCursor {
  const dot = document.createElement("div");
  dot.className = "pad-cursor";
  // The dot is decoration for a pointer the user is already looking at, and naming it
  // to a screen reader would announce a second cursor that does not exist.
  dot.setAttribute("aria-hidden", "true");
  document.body.append(dot);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let frame = 0;
  let last = 0;
  let hovered: HTMLElement | null = null;

  function place(): void {
    dot.style.transform = `translate(${x}px, ${y}px)`;
  }

  /**
   * The dot is in the document, so it is what `elementFromPoint` finds unless it is
   * taken out of the way first. `pointer-events: none` would do it in CSS; hiding it
   * for the duration of the hit test also covers a stylesheet that forgets to.
   */
  function under(): HTMLElement | null {
    dot.style.visibility = "hidden";
    const hit = document.elementFromPoint(x, y);
    dot.style.visibility = "";
    return hit instanceof HTMLElement ? hit : null;
  }

  function follow(): void {
    const hit = under();
    if (hit === null) return;
    const focusable = hit.closest<HTMLElement>(FOCUSABLE);
    if (focusable === null || focusable === hovered) return;
    hovered = focusable;
    focusable.focus();
  }

  function step(now: number): void {
    frame = requestAnimationFrame(step);
    const delta = last === 0 ? 0 : Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;

    const pads = readPads();
    const it = pads[padIndex];
    if (!it) return;

    const ax = it.axes[0] ?? 0;
    const ay = it.axes[1] ?? 0;
    const magnitude = applyDeadZone(ax, ay);
    if (magnitude === 0) return;

    // The dead zone returns a corrected *magnitude*, so the direction has to come back
    // from the raw pair — dividing by the raw length keeps a diagonal a diagonal.
    const raw = Math.hypot(ax, ay) || 1;
    x = Math.min(window.innerWidth - 1, Math.max(0, x + (ax / raw) * magnitude * SPEED * delta));
    y = Math.min(window.innerHeight - 1, Math.max(0, y + (ay / raw) * magnitude * SPEED * delta));
    place();
    follow();
  }

  place();
  frame = requestAnimationFrame(step);

  // Every intent this pad would emit is taken here instead of reaching the bus: the
  // stick is a pointer now, and leaving the directional intents on would move the focus
  // a second time, away from whatever the dot is over. A stays useful as the click.
  pad.assign(padIndex, (event) => {
    if (event.intent === "select") under()?.click();
    return true;
  });

  return {
    dispose(): void {
      cancelAnimationFrame(frame);
      pad.assign(padIndex, null);
      dot.remove();
    },
  };
}
