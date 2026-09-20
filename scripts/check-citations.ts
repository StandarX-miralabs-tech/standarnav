/// <reference types="node" />

// Every committed document cites the code by `path:line`, and every one of those
// anchors goes stale the moment a line is inserted above it. A pre-merge review of
// this repository found eleven stale anchors in README.md alone, and the pass that
// fixed them introduced thirty more, because the code moved underneath the edit.
//
// So the anchors are checked rather than trusted: the file must exist, the line must
// be inside it, and the line must not be blank — a citation landing on whitespace is
// the signature of a block that shifted. What this cannot check is a citation that
// drifted onto some *other* real line; for that, quote the symbol in the prose and a
// reader can see the mismatch.
//
// It also refuses the two things that must never reach a committed file: an absolute
// filesystem path, and a reference to the gitignored `.local/` scratch directory.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");

/** `src/spatial/spatial.ts:188` or `docs/adr/0009-hidden-candidates.md:80-97`. */
const CITATION =
  /`([A-Za-z0-9_@./-]+\.(?:ts|tsx|js|jsx|json|ya?ml|md|css|scss|html)):(\d+)(?:-(\d+))?`/g;
/** A path in the source repository, which the house rule says must be prefixed. */
const SOURCE_PREFIXES = ["packages/"];
/** This repository's own top-level directories — what makes a path unambiguously ours. */
const OWN_ROOTS = ["src/", "scripts/", "playground/", ".github/", "docs/adr/", "docs/journal/"];
// A drive letter, but not the tail of a URL scheme: the `s` of `https://` is a
// letter followed by `:/` too, so the lookbehind for a word character is what tells
// `D:/DevSoftware` from `https://bun.sh`.
const ABSOLUTE = /(?<!\w)[A-Za-z]:[\\/]|\/Users\/|\/home\//;
const SCRATCH = /(?:^|[\s(`"'])\.local\//;
/** `[ADR-0003](0003-extraction-scope.md)` — the target, fragment and all. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
/** Nothing on the filesystem to resolve: another host, a mail client, a heading here. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

interface Problem {
  readonly file: string;
  readonly line: number;
  readonly what: string;
}

function tracked(): string[] {
  const result = spawnSync("git", ["ls-files", "*.md"], { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) throw new Error("git ls-files failed");
  return result.stdout.split("\n").filter((entry) => entry.trim() !== "");
}

const lineCache = new Map<string, string[] | null>();

function linesOf(relative: string): string[] | null {
  const cached = lineCache.get(relative);
  if (cached !== undefined) return cached;
  let lines: string[] | null;
  try {
    lines = readFileSync(path.join(rootDir, relative), "utf8").split("\n");
  } catch {
    lines = null;
  }
  lineCache.set(relative, lines);
  return lines;
}

const problems: Problem[] = [];
const unprefixed: Problem[] = [];
let checked = 0;
let sourceCitations = 0;
let shorthand = 0;
let links = 0;

for (const document of tracked()) {
  const text = readFileSync(path.join(rootDir, document), "utf8");
  const documentLines = text.split("\n");

  for (const [index, line] of documentLines.entries()) {
    const at = index + 1;

    if (ABSOLUTE.test(line)) {
      problems.push({ file: document, line: at, what: `absolute filesystem path: ${line.trim()}` });
    }
    if (SCRATCH.test(line)) {
      problems.push({ file: document, line: at, what: `reference to the gitignored .local/` });
    }

    // A `path:line` citation is checked above, but `[ADR-0003](0003-extraction-scope.md)`
    // was not checked by anything — and those links are the dense part of this tree:
    // one document is the target of twenty-four of them. Deleting or renaming a file
    // therefore used to leave dead links that every gate reported as green.
    for (const match of line.matchAll(LINK)) {
      const target = match[1];
      if (target === undefined || EXTERNAL.test(target)) continue;

      // The fragment is the reader's business, not the filesystem's; an empty path
      // before it means the link points inside the document it is written in.
      const file = target.split("#")[0] ?? "";
      if (file === "") continue;

      const resolved = file.startsWith("/")
        ? path.join(rootDir, file.slice(1))
        : path.resolve(rootDir, path.dirname(document), decodeURIComponent(file));

      links += 1;
      if (!existsSync(resolved)) {
        problems.push({ file: document, line: at, what: `links to ${file}, which does not exist` });
      }
    }

    for (const match of line.matchAll(CITATION)) {
      const [, cited, startText, endText] = match;
      if (cited === undefined || startText === undefined) continue;

      if (SOURCE_PREFIXES.some((prefix) => cited.startsWith(prefix))) {
        sourceCitations += 1;
        continue;
      }

      // `spatial.ts:198` and `.../spatial.ts:60` are the shorthand these documents
      // use once the surrounding prose has named the directory. There is nothing to
      // resolve them against, so they are counted and left alone — the anchors worth
      // gating are the ones written out in full.
      if (!cited.includes("/") || cited.startsWith("...")) {
        shorthand += 1;
        continue;
      }

      // Only a path rooted in one of this repository's own top-level directories is
      // unambiguously about this repository. Anything else — `focus/tabbable.ts`,
      // `apps/docs/...` — is the source repository written without its prefix, which
      // is a house-rule break rather than a broken anchor: reported, not fatal,
      // because the fix is prose and the reader is not being sent anywhere wrong.
      if (!OWN_ROOTS.some((root) => cited.startsWith(root))) {
        const lines = linesOf(cited);
        if (lines === null) {
          unprefixed.push({ file: document, line: at, what: cited });
          continue;
        }
      }

      checked += 1;
      const lines = linesOf(cited);
      if (lines === null) {
        problems.push({ file: document, line: at, what: `cites ${cited}, which does not exist` });
        continue;
      }

      const start = Number(startText);
      const end = endText === undefined ? start : Number(endText);
      if (end < start) {
        problems.push({
          file: document,
          line: at,
          what: `${cited}:${start}-${end} runs backwards`,
        });
        continue;
      }
      if (end > lines.length) {
        problems.push({
          file: document,
          line: at,
          what: `${cited}:${startText}${endText === undefined ? "" : `-${endText}`} is past the end of the file (${lines.length} lines)`,
        });
        continue;
      }
      // A range is allowed to contain blank lines; its first and last must not be,
      // because that is what a block boundary looks like when it has moved.
      for (const edge of end === start ? [start] : [start, end]) {
        if ((lines[edge - 1] ?? "").trim() === "") {
          problems.push({
            file: document,
            line: at,
            what: `${cited}:${edge} is a blank line — the anchor has drifted`,
          });
        }
      }
    }
  }
}

if (unprefixed.length > 0) {
  console.log("");
  console.log(
    `${unprefixed.length} citation${unprefixed.length === 1 ? " resolves" : "s resolve"} nowhere here and read as a path in this repository.` +
      ` The house rule is to prefix a source-repository path, e.g. \`miralabs-ui: packages/core/src/...\`:`,
  );
  for (const one of unprefixed) console.log(`  ${one.file}:${one.line} — ${one.what}`);
}

console.log("");
console.log(
  `checked ${checked} citation${checked === 1 ? "" : "s"} and ${links} link${links === 1 ? "" : "s"} into this repository across ${tracked().length} documents` +
    ` (${sourceCitations} citations into the source repository and ${shorthand} written in shorthand, neither resolvable here)`,
);

if (problems.length > 0) {
  console.error("");
  for (const problem of problems) {
    console.error(`${problem.file}:${problem.line} — ${problem.what}`);
  }
  console.error(`\n${problems.length} citation problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}

console.log("every citation resolves");
