import { describe, expect, it } from "vitest";
import {
  isFocusVisibleModality,
  isPointerIntent,
  MODALITY_ATTRIBUTE,
  trackPointerStreak,
} from "./modality";

describe("MODALITY_ATTRIBUTE", () => {
  it("is the frozen public name", () => {
    expect(MODALITY_ATTRIBUTE).toBe("data-snav-input");
  });
});

describe("trackPointerStreak", () => {
  it("opens a streak on the first move", () => {
    expect(trackPointerStreak(null, 1_000)).toEqual({ start: 1_000, last: 1_000 });
  });

  it("extends a streak while the moves keep coming", () => {
    let streak = trackPointerStreak(null, 0);
    for (const at of [40, 80, 120]) streak = trackPointerStreak(streak, at);

    expect(streak).toEqual({ start: 0, last: 120 });
  });

  it("starts over when the pointer stopped in between", () => {
    const streak = trackPointerStreak(trackPointerStreak(null, 0), 260);

    expect(streak).toEqual({ start: 260, last: 260 });
  });

  it("starts over when the timestamps go backwards", () => {
    const streak = trackPointerStreak({ start: 5_000, last: 5_050 }, 40);

    expect(streak).toEqual({ start: 40, last: 40 });
  });
});

describe("isPointerIntent", () => {
  it("waits for 300 ms of movement before calling it intent", () => {
    expect(isPointerIntent({ start: 0, last: 299 })).toBe(false);
    expect(isPointerIntent({ start: 0, last: 300 })).toBe(true);
  });
});

describe("isFocusVisibleModality", () => {
  it("rings for the modalities that cannot point at anything", () => {
    expect(isFocusVisibleModality("keyboard")).toBe(true);
    expect(isFocusVisibleModality("gamepad")).toBe(true);
    expect(isFocusVisibleModality("pointer")).toBe(false);
    expect(isFocusVisibleModality("touch")).toBe(false);
  });
});
