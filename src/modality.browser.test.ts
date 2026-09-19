import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInputModality,
  isFocusVisible,
  MODALITY_ATTRIBUTE,
  setInputModality,
  trackInputModality,
} from "./modality";

const cleanups: VoidFunction[] = [];

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, ...init });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("trackInputModality", () => {
  async function sweep(steps: number, gap: number): Promise<void> {
    for (let step = 0; step < steps; step++) {
      document.dispatchEvent(pointer("pointermove", { pointerType: "mouse" }));
      await wait(gap);
    }
  }

  it("flips between keyboard and pointer, ignoring bare modifiers", () => {
    const seen: string[] = [];
    cleanups.push(trackInputModality(document, (modality) => seen.push(modality)));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(isFocusVisible(document)).toBe(true);

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    expect(getInputModality(document)).toBe("pointer");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    expect(getInputModality(document)).toBe("pointer");

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
    );
    expect(seen).toEqual(["keyboard", "pointer", "touch"]);
  });

  it("publishes the modality on the root element while it runs", () => {
    const root = document.documentElement;
    const dispose = trackInputModality(document);
    expect(root.getAttribute(MODALITY_ATTRIBUTE)).toBe("pointer");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(root.getAttribute(MODALITY_ATTRIBUTE)).toBe("keyboard");

    dispose();
    expect(root.hasAttribute(MODALITY_ATTRIBUTE)).toBe(false);
  });

  it("takes the gamepad modality from a source the DOM has no events for", () => {
    cleanups.push(trackInputModality(document));

    setInputModality(document, "gamepad");

    expect(getInputModality(document)).toBe("gamepad");
    expect(isFocusVisible(document)).toBe(true);
    expect(document.documentElement.getAttribute(MODALITY_ATTRIBUTE)).toBe("gamepad");
  });

  it("ignores a mouse brushing past a gamepad session", async () => {
    cleanups.push(trackInputModality(document));
    setInputModality(document, "gamepad");

    await sweep(3, 25);

    expect(getInputModality(document)).toBe("gamepad");
  });

  it("hands the modality to the mouse after sustained movement", async () => {
    cleanups.push(trackInputModality(document));
    setInputModality(document, "gamepad");

    // Long enough that one stalled timer on CI cannot swallow the 300 ms window.
    await sweep(20, 25);

    expect(getInputModality(document)).toBe("pointer");
  });

  it("takes a mouse move at its word when no ring is at stake", () => {
    cleanups.push(trackInputModality(document));
    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
    );

    document.dispatchEvent(pointer("pointermove", { pointerType: "mouse" }));

    expect(getInputModality(document)).toBe("pointer");
  });

  it("removes its listeners with the last subscriber", () => {
    const listener = vi.fn();
    const dispose = trackInputModality(document, listener);
    dispose();
    dispose();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(listener).not.toHaveBeenCalled();
    expect(getInputModality(document)).toBe("pointer");
  });

  it("keeps tracking while another subscriber is alive", () => {
    const first = vi.fn();
    const second = vi.fn();
    const disposeFirst = trackInputModality(document, first);
    cleanups.push(trackInputModality(document, second));

    disposeFirst();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("keyboard");
  });

  it("keeps running for a subscriber that only wants the attribute", () => {
    const listener = vi.fn();
    const disposeListener = trackInputModality(document, listener);
    cleanups.push(trackInputModality(document));

    disposeListener();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(listener).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute(MODALITY_ATTRIBUTE)).toBe("keyboard");
  });
});
