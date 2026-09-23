import path from "node:path";
import { describe, expect, it } from "vitest";
import { chargedBy, moduleImports, uncoveredModules } from "./size-budget";

const dist = "/dist";

describe("moduleImports", () => {
  it("resolves a relative import against the module that wrote it", () => {
    expect(moduleImports('import { a } from "./dom/event.js";', "/dist/index.js")).toEqual([
      path.resolve("/dist", "dom", "event.js"),
    ]);
  });

  it("reads a re-export, an unspaced import and a bare side-effect import", () => {
    const source = ['export * from "./a.js";', 'import{b}from"./b.js";', 'import "./c.js";'].join(
      "\n",
    );

    expect(moduleImports(source, "/dist/index.js")).toHaveLength(3);
  });

  it("ignores a bare specifier, which is somebody else's package", () => {
    expect(moduleImports('import { useRef } from "react";', "/dist/react/react.js")).toEqual([]);
  });

  it("walks out of a directory", () => {
    const [resolved] = moduleImports('import "../keymap.js";', "/dist/keyboard/keyboard.js");
    expect(resolved).toBe(path.resolve("/dist", "keymap.js"));
  });
});

describe("chargedBy", () => {
  const graph: Record<string, string[]> = {
    "a.js": ["shared.js", "only-a.js"],
    "b.js": ["shared.js"],
    "shared.js": ["deep.js"],
    "only-a.js": [],
    "deep.js": [],
  };
  const importsOf = (file: string): string[] => graph[file] ?? [];

  it("charges everything reachable from an entry", () => {
    expect([...chargedBy(["a.js"], new Set(), importsOf)].sort()).toEqual([
      "a.js",
      "deep.js",
      "only-a.js",
      "shared.js",
    ]);
  });

  it("stops at an external, and does not charge what only that external reaches", () => {
    expect([...chargedBy(["a.js"], new Set(["shared.js"]), importsOf)].sort()).toEqual([
      "a.js",
      "only-a.js",
    ]);
  });

  it("terminates on a cycle rather than walking it forever", () => {
    const cyclic = (file: string): string[] => (file === "x.js" ? ["y.js"] : ["x.js"]);
    expect([...chargedBy(["x.js"], new Set(), cyclic)].sort()).toEqual(["x.js", "y.js"]);
  });
});

describe("uncoveredModules", () => {
  it("is empty when every built module is on some line", () => {
    expect(uncoveredModules([`${dist}/a.js`], new Set([`${dist}/a.js`]))).toEqual([]);
  });

  /**
   * The failure the whole-package line used to be a proxy for: `shared.js` is external
   * on both lines that reach it, so neither ever goes red when it grows.
   */
  it("names a module that every line hands away", () => {
    const graph: Record<string, string[]> = {
      "a.js": ["shared.js"],
      "b.js": ["shared.js"],
      "shared.js": [],
    };
    const importsOf = (file: string): string[] => graph[file] ?? [];
    const charged = new Set([
      ...chargedBy(["a.js"], new Set(["shared.js"]), importsOf),
      ...chargedBy(["b.js"], new Set(["shared.js"]), importsOf),
    ]);

    expect(uncoveredModules(["a.js", "b.js", "shared.js"], charged)).toEqual(["shared.js"]);
  });

  it("sorts, so the failure message reads the same on every run", () => {
    expect(uncoveredModules(["z.js", "a.js", "m.js"], new Set())).toEqual(["a.js", "m.js", "z.js"]);
  });
});
