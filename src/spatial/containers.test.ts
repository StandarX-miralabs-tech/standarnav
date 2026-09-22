import { describe, expect, it } from "vitest";
import { blocksDirection, directionAttribute, entryStrategy, wrapsDirection } from "./containers";

describe("blocksDirection", () => {
  it("blocks the ways it names", () => {
    expect(blocksDirection("left right", "left")).toBe(true);
    expect(blocksDirection("left right", "up")).toBe(false);
  });

  it("blocks every way when written bare", () => {
    expect(blocksDirection("", "down")).toBe(true);
  });

  it("blocks nothing when absent", () => {
    expect(blocksDirection(null, "down")).toBe(false);
  });
});

describe("wrapsDirection", () => {
  it("wraps on the named axis only", () => {
    expect(wrapsDirection("x", "left")).toBe(true);
    expect(wrapsDirection("x", "up")).toBe(false);
    expect(wrapsDirection("y", "down")).toBe(true);
  });

  it("wraps both ways for `both` and for a bare attribute", () => {
    for (const value of ["both", ""]) {
      expect(wrapsDirection(value, "left")).toBe(true);
      expect(wrapsDirection(value, "down")).toBe(true);
    }
  });

  it("wraps nothing when absent", () => {
    expect(wrapsDirection(null, "left")).toBe(false);
  });
});

describe("entryStrategy", () => {
  it("remembers by default", () => {
    expect(entryStrategy(null)).toBe("last");
    expect(entryStrategy("nonsense")).toBe("last");
  });

  it("reads the two other strategies", () => {
    expect(entryStrategy("first")).toBe("first");
    expect(entryStrategy("nearest")).toBe("nearest");
  });
});

describe("directionAttribute", () => {
  it("names the redirection attribute per direction", () => {
    expect(directionAttribute("up")).toBe("data-snav-up");
    expect(directionAttribute("right")).toBe("data-snav-right");
  });
});
