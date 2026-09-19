import { describe, expect, it } from "vitest";
import { applyDeadZone, resolveSector, type StickDirection } from "./dead-zone";

describe("applyDeadZone", () => {
  it("reads a centred stick as centred", () => {
    expect(applyDeadZone(0, 0)).toBe(0);
    expect(applyDeadZone(0.1, 0.1)).toBe(0);
  });

  it("cuts on the magnitude, not on each axis", () => {
    // A per-axis threshold would carve a square hole and let this diagonal through
    // at a lower true deflection than a straight push of the same size.
    const diagonal = applyDeadZone(0.1, 0.1, { curve: "linear" });
    const straight = applyDeadZone(Math.hypot(0.1, 0.1), 0, { curve: "linear" });

    expect(diagonal).toBe(straight);
  });

  it("renormalises so the first movement past the edge starts at zero", () => {
    const justOutside = applyDeadZone(0.1501, 0, { curve: "linear" });

    expect(justOutside).toBeGreaterThan(0);
    expect(justOutside).toBeLessThan(0.001);
  });

  it("reaches exactly one at full deflection", () => {
    expect(applyDeadZone(1, 0, { curve: "linear" })).toBe(1);
    expect(applyDeadZone(1, 0)).toBe(1);
  });

  it("keeps the quadratic curve below the linear one", () => {
    const half = 0.5;
    expect(applyDeadZone(half, 0)).toBeLessThan(applyDeadZone(half, 0, { curve: "linear" }));
  });

  it("clamps a stick that over-reports past the corner", () => {
    expect(applyDeadZone(1, 1, { curve: "linear" })).toBe(1);
  });

  it("honours a custom dead zone", () => {
    expect(applyDeadZone(0.3, 0, { deadZone: 0.4 })).toBe(0);
    expect(applyDeadZone(0.5, 0, { deadZone: 0.4 })).toBeGreaterThan(0);
  });
});

describe("resolveSector", () => {
  it("claims nothing until the stick is pushed past the entry threshold", () => {
    expect(resolveSector(null, 0.4, 0)).toBeNull();
    expect(resolveSector(null, 0.5, 0)).toBe("right");
  });

  it("reads the four sectors in screen axes", () => {
    expect(resolveSector(null, 0.9, 0)).toBe("right");
    expect(resolveSector(null, -0.9, 0)).toBe("left");
    expect(resolveSector(null, 0, 0.9)).toBe("down");
    expect(resolveSector(null, 0, -0.9)).toBe("up");
  });

  it("holds on below the entry threshold and lets go below the exit one", () => {
    expect(resolveSector("right", 0.4, 0)).toBe("right");
    expect(resolveSector("right", 0.3, 0)).toBeNull();
  });

  it("does not machine-gun on a stick held near a boundary", () => {
    // 46° past the horizontal: inside the "up" half by the naive test, but the
    // margin keeps the direction the user already earned.
    const x = Math.cos((46 * Math.PI) / 180);
    const y = -Math.sin((46 * Math.PI) / 180);

    expect(resolveSector(null, x, y)).toBe("up");
    expect(resolveSector("right", x, y)).toBe("right");
  });

  it("changes sector once the stick is past the margin", () => {
    const angle = (58 * Math.PI) / 180;

    expect(resolveSector("right", Math.cos(angle), -Math.sin(angle))).toBe("up");
  });

  it("walks a full circle without ever landing on nothing", () => {
    let direction: StickDirection | null = null;
    const seen = new Set<StickDirection>();
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const angle = (degrees * Math.PI) / 180;
      direction = resolveSector(direction, Math.cos(angle), -Math.sin(angle));
      expect(direction).not.toBeNull();
      if (direction !== null) seen.add(direction);
    }

    expect([...seen].sort()).toEqual(["down", "left", "right", "up"]);
  });
});
