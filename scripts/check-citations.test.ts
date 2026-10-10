import { describe, expect, it } from "vitest";
import { checkDocument, named, type Tree } from "./check-citations";

function treeOf(files: Record<string, string>): Tree {
  const basenames = new Map<string, string[]>();
  for (const file of Object.keys(files)) {
    const base = file.slice(file.lastIndexOf("/") + 1);
    basenames.set(base, [...(basenames.get(base) ?? []), file]);
  }
  return {
    linesOf: (relative) => files[relative]?.split("\n") ?? null,
    exists: (relative) => relative in files,
    basenames,
  };
}

const tree = treeOf({
  "src/a.ts": "one\n\nthree\nfour",
  "src/b.ts": "first\nsecond",
  "docs/adr/0001-x.md": "# x",
  "README.md": "# readme",
});

function problemsOf(text: string, document = "docs/guide.md"): string[] {
  return checkDocument(document, text, tree).problems.map((problem) => problem.what);
}

describe("checkDocument, full citations", () => {
  it("accepts a citation on a real line and counts it", () => {
    const report = checkDocument("docs/guide.md", "see `src/a.ts:3-4`", tree);
    expect(report.problems).toEqual([]);
    expect(report.counts.checked).toBe(1);
  });

  it("refuses a citation that lands on a blank line", () => {
    expect(problemsOf("see `src/a.ts:2`")).toEqual([
      "src/a.ts:2 is a blank line — the anchor has drifted",
    ]);
  });

  it("refuses a range that runs backwards", () => {
    expect(problemsOf("see `src/a.ts:4-3`")).toEqual(["src/a.ts:4-3 runs backwards"]);
  });

  it("refuses a citation past the end of the file", () => {
    expect(problemsOf("see `src/b.ts:3`")).toEqual([
      "src/b.ts:3 is past the end of the file (2 lines)",
    ]);
  });

  it("refuses a citation of a missing file under one of this repository's roots", () => {
    expect(problemsOf("see `src/gone.ts:1`")).toEqual(["cites src/gone.ts, which does not exist"]);
  });

  it("reports a path outside this repository's roots without failing on it", () => {
    const report = checkDocument("docs/guide.md", "see `focus/tabbable.ts:5`", tree);
    expect(report.problems).toEqual([]);
    expect(report.unprefixed.map((one) => one.what)).toEqual(["focus/tabbable.ts"]);
  });

  it("counts a citation with no directory as shorthand and checks nothing", () => {
    const report = checkDocument("docs/guide.md", "see `spatial.ts:999`", tree);
    expect(report.problems).toEqual([]);
    expect(report.counts.shorthand).toBe(1);
  });
});

describe("checkDocument, bare anchors", () => {
  it("refuses an anchor written before any file is named", () => {
    expect(problemsOf("line `:3` of nothing")).toEqual([
      "`:3` before any file is named — nothing to resolve it against",
    ]);
  });

  it("resolves an anchor against the file named last on the line, in reading order", () => {
    expect(problemsOf("`src/b.ts` at `:1`, then `src/a.ts` at `:2`")).toEqual([
      "`:2` is src/a.ts:2, a blank line — the anchor has drifted",
    ]);
  });

  it("carries the subject over to the following lines", () => {
    expect(problemsOf("`src/a.ts` says\nat `:9` that")).toEqual([
      "`:9` is src/a.ts:9, past the end of the file (4 lines)",
    ]);
  });

  it("keeps the subject when a name resolves to nothing", () => {
    expect(problemsOf("`src/b.ts` builds `debug.js` at `:2`")).toEqual([]);
  });

  it("refuses an anchor range that runs backwards", () => {
    expect(problemsOf("`src/a.ts` at `:4-3`")).toEqual(["src/a.ts:4-3 runs backwards"]);
  });

  it("leaves the licence record's anchors alone and counts them", () => {
    const report = checkDocument("docs/adr/0002-license-and-copyright.md", "`:2`", tree);
    expect(report.problems).toEqual([]);
    expect(report.counts.inherited).toBe(1);
  });
});

describe("checkDocument, links and forbidden references", () => {
  it("resolves a link relative to the document that holds it", () => {
    expect(problemsOf("[x](adr/0001-x.md) and [r](../README.md#top)")).toEqual([]);
  });

  it("refuses a dead link", () => {
    expect(problemsOf("[y](adr/0099-y.md)")).toEqual([
      "links to adr/0099-y.md, which does not exist",
    ]);
  });

  it("ignores an external link and a fragment inside the document", () => {
    const report = checkDocument("docs/guide.md", "[a](https://bun.sh) [b](#heading)", tree);
    expect(report.problems).toEqual([]);
    expect(report.counts.links).toBe(0);
  });

  it("refuses an absolute filesystem path", () => {
    expect(problemsOf("built in D:/Work/repo")).toEqual([
      "absolute filesystem path: built in D:/Work/repo",
    ]);
  });

  it("refuses a reference to the gitignored .local directory", () => {
    expect(problemsOf("notes in .local/plan.md")).toEqual(["reference to the gitignored .local/"]);
  });
});

describe("named", () => {
  it("takes a path from the root as written, and a unique basename as its one path", () => {
    expect(named("./src/a.ts", tree)).toBe("src/a.ts");
    expect(named("b.ts", tree)).toBe("src/b.ts");
  });

  it("resolves an ambiguous basename to nothing", () => {
    const twice = treeOf({ "src/x/i.ts": "", "src/y/i.ts": "" });
    expect(named("i.ts", twice)).toBeNull();
  });
});
