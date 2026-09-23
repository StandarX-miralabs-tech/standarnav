import { describe, expect, it } from "vitest";
import {
  badgeFor,
  CHECKOUTS_PER_JOB,
  type CounterState,
  counterTotal,
  EMPTY_STATE,
  fold,
  lastCompleteDay,
  pendingDays,
  readState,
  residualClones,
  type Tally,
} from "./download-counts";

const fresh: Tally = { through: null, total: 0 };

describe("lastCompleteDay", () => {
  it("never returns today, because a day in progress would be folded in twice", () => {
    expect(lastCompleteDay(new Date("2026-09-23T04:00:00Z"))).toBe("2026-09-22");
  });

  it("crosses a month boundary", () => {
    expect(lastCompleteDay(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09-30");
  });
});

describe("residualClones", () => {
  it("takes two clones off per job, the ratio measured on this repository", () => {
    expect(CHECKOUTS_PER_JOB).toBe(2);
    const left = residualClones(
      [{ day: "2026-09-20", count: 294 }],
      [{ day: "2026-09-20", count: 143 }],
    );
    expect(left).toEqual([{ day: "2026-09-20", count: 8 }]);
  });

  it("clamps at zero rather than letting a heavy day pay for a later one", () => {
    const left = residualClones(
      [{ day: "2026-09-22", count: 363 }],
      [{ day: "2026-09-22", count: 182 }],
    );
    expect(left).toEqual([{ day: "2026-09-22", count: 0 }]);
  });

  it("leaves a day with no CI untouched", () => {
    expect(residualClones([{ day: "2026-09-19", count: 40 }], [])).toEqual([
      { day: "2026-09-19", count: 40 },
    ]);
  });
});

describe("fold", () => {
  it("counts every day once and remembers how far it got", () => {
    const after = fold(
      fresh,
      [
        { day: "2026-09-20", count: 5 },
        { day: "2026-09-21", count: 7 },
      ],
      "2026-09-22",
    );

    expect(after).toEqual({ through: "2026-09-21", total: 12 });
  });

  it("adds nothing when the same days come back", () => {
    const once = fold(fresh, [{ day: "2026-09-20", count: 5 }], "2026-09-22");
    const twice = fold(once, [{ day: "2026-09-20", count: 5 }], "2026-09-22");

    expect(twice).toEqual(once);
  });

  it("ignores a day that is not complete yet", () => {
    const after = fold(
      fresh,
      [
        { day: "2026-09-22", count: 5 },
        { day: "2026-09-23", count: 99 },
      ],
      "2026-09-22",
    );

    expect(after).toEqual({ through: "2026-09-22", total: 5 });
  });

  it("picks up only the new days on the next run", () => {
    const first = fold(fresh, [{ day: "2026-09-20", count: 5 }], "2026-09-20");
    const second = fold(
      first,
      [
        { day: "2026-09-20", count: 5 },
        { day: "2026-09-21", count: 7 },
      ],
      "2026-09-21",
    );

    expect(second).toEqual({ through: "2026-09-21", total: 12 });
  });

  it("keeps `through` when every day offered is already counted", () => {
    const first = fold(fresh, [{ day: "2026-09-20", count: 5 }], "2026-09-20");
    expect(fold(first, [], "2026-09-21").through).toBe("2026-09-20");
  });
});

describe("pendingDays", () => {
  it("names the days a tally has not folded, oldest first", () => {
    const tally: Tally = { through: "2026-09-20", total: 1 };
    const days = [
      { day: "2026-09-21", count: 0 },
      { day: "2026-09-19", count: 0 },
      { day: "2026-09-22", count: 0 },
      { day: "2026-09-23", count: 0 },
    ];

    expect(pendingDays(tally, days, "2026-09-22")).toEqual(["2026-09-21", "2026-09-22"]);
  });
});

describe("the counter and its badge", () => {
  const state: CounterState = {
    npm: { through: "2026-09-22", total: 1200 },
    clones: { through: "2026-09-22", total: 64 },
    releaseAssets: 3,
    updated: "2026-09-22",
  };

  it("sums the three terms", () => {
    expect(counterTotal(state)).toBe(1267);
  });

  it("renders the shields endpoint schema with a grouped number", () => {
    expect(badgeFor(state)).toEqual({
      schemaVersion: 1,
      label: "downloads",
      message: "1,267",
      color: "blue",
    });
  });

  it("reads zero from an empty state", () => {
    expect(counterTotal(EMPTY_STATE)).toBe(0);
  });
});

describe("readState", () => {
  it("round-trips a state it wrote", () => {
    const state: CounterState = {
      npm: { through: "2026-09-22", total: 10 },
      clones: { through: "2026-09-21", total: 20 },
      releaseAssets: 30,
      updated: "2026-09-22",
    };

    expect(readState(JSON.stringify(state))).toEqual(state);
  });

  it("falls back to an empty state rather than throwing on a corrupt file", () => {
    expect(readState("{ not json")).toEqual(EMPTY_STATE);
    expect(readState("null")).toEqual(EMPTY_STATE);
  });

  it("repairs a state missing its fields, so a bad write cannot zero the total silently", () => {
    expect(readState('{"npm":{"total":5}}')).toEqual({
      npm: { through: null, total: 5 },
      clones: { through: null, total: 0 },
      releaseAssets: 0,
      updated: "",
    });
  });
});
