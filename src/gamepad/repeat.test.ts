import { describe, expect, it } from "vitest";
import { firstRepeatAt, nextRepeatAt } from "./repeat";

describe("firstRepeatAt", () => {
  it("waits out the initial delay", () => {
    expect(firstRepeatAt(1_000)).toBe(1_400);
    expect(firstRepeatAt(1_000, { delay: 250 })).toBe(1_250);
  });
});

describe("nextRepeatAt", () => {
  it("says nothing while the repeat is not due", () => {
    expect(nextRepeatAt(1_400, 0, 1_399, null)).toBe(-1);
  });

  it("paces a digital source at the steady interval", () => {
    expect(nextRepeatAt(1_400, 0, 1_400, null)).toBe(1_530);
  });

  it("accelerates after the sixth repeat", () => {
    // Six at 130 ms to cross a short list, then 60 ms so a long one is survivable.
    expect(nextRepeatAt(0, 4, 1_000, null)).toBe(1_130);
    expect(nextRepeatAt(0, 5, 1_000, null)).toBe(1_060);
    expect(nextRepeatAt(0, 40, 1_000, null)).toBe(1_060);
  });

  it("takes the whole ladder from options", () => {
    const options = { interval: 100, intervalFast: 20, fastAfter: 2 };
    expect(nextRepeatAt(0, 0, 0, null, options)).toBe(100);
    expect(nextRepeatAt(0, 1, 0, null, options)).toBe(20);
  });

  it("modulates an analogue source by how hard the stick is pushed", () => {
    expect(nextRepeatAt(0, 0, 0, 0.5)).toBe(250);
    expect(nextRepeatAt(0, 0, 0, 1)).toBe(60);
    expect(nextRepeatAt(0, 0, 0, 0.75)).toBe(155);
  });

  it("ignores the acceleration ladder while modulating", () => {
    expect(nextRepeatAt(0, 40, 0, 1)).toBe(60);
    expect(nextRepeatAt(0, 40, 0, 0.5)).toBe(250);
  });

  it("clamps a magnitude outside the modulation window", () => {
    expect(nextRepeatAt(0, 0, 0, 0.1)).toBe(250);
    expect(nextRepeatAt(0, 0, 0, 2)).toBe(60);
  });

  it("schedules from now, not from the missed deadline", () => {
    // A frame that arrives late must not queue up the repeats it slept through.
    expect(nextRepeatAt(1_000, 0, 1_800, null)).toBe(1_930);
  });
});
