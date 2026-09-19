import { describe, expect, it } from "vitest";
import type { Rect } from "../types";
import { findBestCandidate, findWrapCandidate, type MoveDirection } from "./geometry";

interface Cell {
  readonly name: string;
  readonly rect: Rect;
}

function cell(name: string, x: number, y: number, width = 100, height = 40): Cell {
  return { name, rect: { x, y, width, height } };
}

function best(origin: Rect, candidates: readonly Cell[], direction: MoveDirection): string | null {
  return findBestCandidate(origin, candidates, direction)?.name ?? null;
}

describe("findBestCandidate — a regular grid", () => {
  // 3 × 3, 100 × 40 cells on a 120 × 60 pitch.
  const grid: Cell[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      grid.push(cell(`r${row}c${column}`, column * 120, row * 60));
    }
  }
  const centre = grid[4]?.rect as Rect;

  it("moves one cell in each direction", () => {
    expect(best(centre, grid, "right")).toBe("r1c2");
    expect(best(centre, grid, "left")).toBe("r1c0");
    expect(best(centre, grid, "up")).toBe("r0c1");
    expect(best(centre, grid, "down")).toBe("r2c1");
  });

  it("never teleports diagonally", () => {
    const corner = grid[0]?.rect as Rect;
    expect(best(corner, grid, "right")).toBe("r0c1");
    expect(best(corner, grid, "down")).toBe("r1c0");
  });

  it("finds nothing past the edge of the grid", () => {
    expect(best(grid[2]?.rect as Rect, grid, "right")).toBeNull();
    expect(best(grid[0]?.rect as Rect, grid, "up")).toBeNull();
  });

  it("excludes nothing it should keep: every cell is reachable by walking", () => {
    let at = grid[0] as Cell;
    const path: string[] = [at.name];
    for (let step = 0; step < 2; step++) {
      const next = findBestCandidate(at.rect, grid, "right");
      expect(next).not.toBeNull();
      at = next as Cell;
      path.push(at.name);
    }
    expect(path).toEqual(["r0c0", "r0c1", "r0c2"]);
  });
});

describe("findBestCandidate — an offset grid", () => {
  // Rows that do not line up: the classic television layout where a naive nearest-
  // centre search drifts sideways a little more with every press.
  const rails: Cell[] = [
    cell("top-a", 0, 0, 200, 40),
    cell("top-b", 220, 0, 200, 40),
    cell("bottom-a", 60, 60, 140, 40),
    cell("bottom-b", 220, 60, 300, 40),
  ];

  it("keeps the dominant overlap rather than the nearest centre", () => {
    expect(best(rails[0]?.rect as Rect, rails, "down")).toBe("bottom-a");
    expect(best(rails[1]?.rect as Rect, rails, "down")).toBe("bottom-b");
  });

  it("comes back to where it left from", () => {
    expect(best(rails[3]?.rect as Rect, rails, "up")).toBe("top-b");
  });
});

describe("findBestCandidate — alignment weighting", () => {
  const row = [cell("aligned", 200, 0), cell("higher", 160, -200)];

  it("prefers staying on the line during a horizontal move", () => {
    // `higher` is closer as the crow flies, but 200 px off-axis with a weight of 30.
    expect(best({ x: 0, y: 0, width: 100, height: 40 }, row, "right")).toBe("aligned");
  });

  it("tolerates far more drift on a vertical move than on a horizontal one", () => {
    // The same relative geometry, transposed. Nothing is aligned either way, so the
    // only thing deciding is the orthogonal weight: 2 going down, 30 going across.
    // Reading down a column forgives being off to the side; reading along a row does
    // not, and that asymmetry is the whole point of Chromium's two constants.
    const down = [cell("straight-far", 110, 400), cell("sideways-near", 250, 60)];
    expect(best({ x: 0, y: 0, width: 100, height: 40 }, down, "down")).toBe("sideways-near");

    const across = [
      cell("straight-far", 400, 110, 40, 100),
      cell("sideways-near", 60, 250, 40, 100),
    ];
    expect(best({ x: 0, y: 0, width: 40, height: 100 }, across, "right")).toBe("straight-far");
  });
});

describe("findBestCandidate — the two passes", () => {
  it("falls back to unaligned candidates when nothing lines up", () => {
    const origin: Rect = { x: 0, y: 0, width: 100, height: 40 };
    const nothingAligned = [cell("far-below-right", 400, 500)];

    expect(best(origin, nothingAligned, "right")).toBe("far-below-right");
  });

  it("prefers an aligned candidate even when an unaligned one scores lower", () => {
    const origin: Rect = { x: 0, y: 0, width: 100, height: 40 };
    const mixed = [cell("unaligned-near", 110, 60), cell("aligned-far", 600, 0)];

    expect(best(origin, mixed, "right")).toBe("aligned-far");
  });
});

describe("findBestCandidate — the overlap tolerance", () => {
  const origin: Rect = { x: 0, y: 0, width: 100, height: 40 };

  it("accepts a candidate that reaches back over the origin a little", () => {
    // 20 px of overlap on a 100 px origin: inside the 30 % that BBC settled on.
    expect(best(origin, [cell("nudged", 80, 0)], "right")).toBe("nudged");
  });

  it("refuses one that reaches back too far", () => {
    expect(best(origin, [cell("behind", 40, 0)], "right")).toBeNull();
  });
});

describe("findBestCandidate — ties", () => {
  it("gives a tie to document order", () => {
    const origin: Rect = { x: 0, y: 0, width: 100, height: 40 };
    const mirrored = [cell("first", 200, 0), cell("second", 200, 0)];

    expect(best(origin, mirrored, "right")).toBe("first");
  });
});

describe("findWrapCandidate", () => {
  const row = [cell("a", 0, 0), cell("b", 120, 0), cell("c", 240, 0), cell("other-row", 0, 200)];

  it("comes back round to the far side of the same line", () => {
    expect(findWrapCandidate(row[2]?.rect as Rect, row, "right")?.name).toBe("a");
    expect(findWrapCandidate(row[0]?.rect as Rect, row, "left")?.name).toBe("c");
  });

  it("stays on the line it wrapped from", () => {
    const grid = [cell("r0c0", 0, 0), cell("r0c1", 120, 0), cell("r1c0", 0, 60)];

    expect(findWrapCandidate(grid[1]?.rect as Rect, grid, "right")?.name).toBe("r0c0");
  });
});

describe("scoring cost", () => {
  it("scores 200 candidates in well under a millisecond", () => {
    const candidates: Cell[] = [];
    for (let index = 0; index < 200; index++) {
      candidates.push(cell(`n${index}`, (index % 20) * 90, Math.floor(index / 20) * 50));
    }
    const origin: Rect = { x: 450, y: 200, width: 80, height: 40 };

    // Warm the JIT, then take a median so one unlucky sample cannot fail the build.
    for (let run = 0; run < 200; run++) findBestCandidate(origin, candidates, "right");

    const samples: number[] = [];
    for (let run = 0; run < 51; run++) {
      const start = performance.now();
      findBestCandidate(origin, candidates, "right");
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);

    expect(samples[25]).toBeLessThan(1);
  });
});
