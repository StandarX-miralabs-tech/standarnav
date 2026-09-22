import { describe, expect, it } from "vitest";
import {
  detectPadType,
  isRepeatableIntent,
  isTriggerPressed,
  resolveButtonIntent,
} from "./mapping";

describe("resolveButtonIntent", () => {
  it("implements the contractual grammar", () => {
    const grammar = {
      0: "select",
      1: "back",
      2: "secondary",
      3: "contextMenu",
      4: "tabPrev",
      5: "tabNext",
      6: "pageUp",
      7: "pageDown",
      9: "contextMenu",
      12: "moveUp",
      13: "moveDown",
      14: "moveLeft",
      15: "moveRight",
    };

    for (const [index, intent] of Object.entries(grammar)) {
      expect(resolveButtonIntent(Number(index), undefined, false), index).toBe(intent);
    }
  });

  it("leaves the buttons with no contract alone", () => {
    expect(resolveButtonIntent(8, undefined, false)).toBeNull();
    expect(resolveButtonIntent(10, undefined, false)).toBeNull();
    expect(resolveButtonIntent(99, undefined, false)).toBeNull();
  });

  it("swaps confirm and cancel only when asked", () => {
    expect(resolveButtonIntent(0, undefined, true)).toBe("back");
    expect(resolveButtonIntent(1, undefined, true)).toBe("select");
    expect(resolveButtonIntent(2, undefined, true)).toBe("secondary");
  });

  it("lets an override replace or silence a button", () => {
    expect(resolveButtonIntent(0, { 0: "contextMenu" }, false)).toBe("contextMenu");
    expect(resolveButtonIntent(1, { 1: null }, false)).toBeNull();
  });

  it("puts an override above the swap", () => {
    expect(resolveButtonIntent(0, { 0: "select" }, true)).toBe("select");
  });
});

describe("isRepeatableIntent", () => {
  it("repeats what traverses and nothing that commits", () => {
    for (const intent of ["moveUp", "moveDown", "pageUp", "tabNext"] as const) {
      expect(isRepeatableIntent(intent), intent).toBe(true);
    }
    for (const intent of ["select", "back", "secondary", "contextMenu"] as const) {
      expect(isRepeatableIntent(intent), intent).toBe(false);
    }
  });
});

describe("detectPadType", () => {
  it("names the families it can draw glyphs for", () => {
    expect(detectPadType("Xbox Wireless Controller (STANDARD GAMEPAD)")).toBe("xbox");
    expect(detectPadType("045e-02fd-Xbox Wireless")).toBe("xbox");
    expect(detectPadType("DualSense Wireless Controller")).toBe("dualsense");
    expect(detectPadType("054c-0ce6-Wireless Controller")).toBe("dualsense");
    expect(detectPadType("Pro Controller (STANDARD GAMEPAD Vendor: 057e)")).toBe("switch");
    expect(detectPadType("Joy-Con L+R")).toBe("switch");
    expect(detectPadType("Some Unknown Pad")).toBe("generic");
  });
});

describe("isTriggerPressed", () => {
  it("needs a firmer pull to engage than to hold", () => {
    expect(isTriggerPressed(0.4, false)).toBe(false);
    expect(isTriggerPressed(0.6, false)).toBe(true);
    expect(isTriggerPressed(0.4, true)).toBe(true);
    expect(isTriggerPressed(0.2, true)).toBe(false);
  });
});
