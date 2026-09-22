/**
 * The three engines on one system — the only configuration a consumer ever ships,
 * and the one no other test file mounts. Every other browser suite passes a
 * single-element `plugins` array, so everything that exists only in composition
 * went unexercised: the gamepad emitting the intents the spatial engine consumes,
 * the ring following focus the spatial engine moved, one shared `intentListeners`
 * set, one ref-counted modality tracker, and a `destroy()` that has to unwind all
 * three in reverse in a single pass.
 */

import { afterEach, describe, expect, it } from "vitest";
import { focusRingPlugin, RING_ATTRIBUTE } from "./focus-ring/focus-ring";
import { type GamepadRuntime, gamepadPlugin } from "./gamepad/gamepad";
import { createInputSystem } from "./input-system";
import { spatialPlugin } from "./spatial/spatial";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

function pad(buttons: Readonly<Record<number, number>>): Gamepad {
  return {
    index: 0,
    id: "Test Pad (STANDARD GAMEPAD)",
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_unused, index) => {
      const value = buttons[index] ?? 0;
      return { pressed: value > 0.5, touched: value > 0, value };
    }),
  } as unknown as Gamepad;
}

/** D-pad down on the standard mapping. */
const DPAD_DOWN = 13;

function scene() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0";
  host.innerHTML = `
    <div data-snav="container" id="rail">
      <button id="one" style="position:absolute;left:20px;top:20px;width:80px;height:40px"></button>
      <button id="two" style="position:absolute;left:20px;top:120px;width:80px;height:40px"></button>
    </div>
  `;
  document.body.append(host);

  // Present before setup, the way the gamepad suite's own harness does it: a pad
  // already exposed never fires `gamepadconnected`, and the engine has to find it.
  const pads: (Gamepad | null)[] = [pad({})];
  let pending: ((now: number) => void) | null = null;
  const runtime: GamepadRuntime = {
    getGamepads: (): readonly (Gamepad | null)[] => pads,
    requestFrame(callback): number {
      pending = callback;
      return 1;
    },
    cancelFrame(): void {
      pending = null;
    },
  };

  const input = createInputSystem({
    plugins: [gamepadPlugin({ runtime }), spatialPlugin({ root: host }), focusRingPlugin()],
  });
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });

  const frame = (now: number): void => {
    const callback = pending;
    pending = null;
    callback?.(now);
  };
  // Whatever the pad is holding belongs to before we existed.
  frame(0);

  return {
    input,
    host,
    frame,
    button: (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement,
    ring: (): HTMLElement | null => document.querySelector<HTMLElement>(`[${RING_ATTRIBUTE}]`),
    press(buttons: Readonly<Record<number, number>>): void {
      pads[0] = pad(buttons);
    },
    polling: (): boolean => pending !== null,
  };
}

describe("the three engines on one system", () => {
  it("moves the focus from a pad press and takes the ring with it", () => {
    const view = scene();
    view.button("one").focus();

    view.press({ [DPAD_DOWN]: 1 });
    view.frame(16);

    // The gamepad emitted, the bus carried it, the spatial engine moved the real
    // focus, and the ring followed a focus change it was never told about — three
    // plugins and one event.
    expect(document.activeElement).toBe(view.button("two"));
    const ring = view.ring();
    expect(ring).not.toBeNull();
    expect(ring?.style.opacity).toBe("1");
    expect(ring?.style.transform).toContain("translate(");
  });

  it("puts the modality on the document once, from whichever engine moved last", () => {
    const view = scene();
    view.button("one").focus();

    view.press({ [DPAD_DOWN]: 1 });
    view.frame(16);

    expect(document.documentElement.getAttribute("data-snav-input")).toBe("gamepad");
  });

  it("unwinds all three in one destroy", () => {
    const view = scene();
    view.button("one").focus();
    view.press({ [DPAD_DOWN]: 1 });
    view.frame(16);

    expect(view.ring()).not.toBeNull();
    expect(view.polling()).toBe(true);

    view.input.destroy();

    // The ring's overlay, the pad's frame and the modality refcount are owned by
    // three different plugins and released by one call. A refcount left above zero
    // is the one of these three that no single-plugin test can see.
    expect(view.ring()).toBeNull();
    expect(view.polling()).toBe(false);
    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
    expect(view.button("two").hasAttribute("data-snav-focused")).toBe(false);
  });

  it("stops moving the focus while the system is paused, and resumes", () => {
    const view = scene();
    view.button("one").focus();

    view.input.pause();
    view.press({ [DPAD_DOWN]: 1 });
    view.frame(16);
    expect(document.activeElement).toBe(view.button("one"));

    view.input.resume();
    view.press({ [DPAD_DOWN]: 0 });
    view.frame(32);
    view.press({ [DPAD_DOWN]: 1 });
    view.frame(48);
    expect(document.activeElement).toBe(view.button("two"));
  });
});
