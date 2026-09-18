/// <reference types="node" />

// Size budgets, enforced on the built `dist/` (ADR-0017).
//
// A budget is not "how big is this file" but "how much does a consumer pay". Each
// subpath is therefore measured alone, with the sibling entries it imports marked
// external: the marginal cost of adding that engine next to the core. One more line
// bundles every entry together with nothing external: what a consumer of everything
// pays. Sizes are minified, then gzipped at Bun's default level, which reads a little
// heavier than `gzip -9`; cite one or the other, never mix.
//
// A `null` cap means "measured, not yet capped". The line is bundled and reported like
// any other, and the run fails printing the number: a cap is written after the number
// exists, never before, and a default would be a guess this file ratifies by being green.

import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Declared locally rather than through `@types/bun`, which ships its own node typings
// and collides with `@types/node`. Only the two calls below are needed.
declare const Bun: {
  build(options: {
    entrypoints: string[];
    target?: "browser" | "node" | "bun";
    format?: "esm";
    minify?: boolean;
    splitting?: boolean;
    external?: string[] | undefined;
  }): Promise<{
    success: boolean;
    logs: unknown[];
    outputs: { text(): Promise<string> }[];
  }>;
  gzipSync(data: Uint8Array): Uint8Array;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(rootDir, "dist");
const KB = 1024;

interface Line {
  readonly name: string;
  /** Built files bundled together for this line, relative to `dist/`. */
  readonly entries: readonly string[];
  /** min+gzip ceiling in bytes, or `null` while the line is measured but not yet capped. */
  readonly cap: number | null;
  /** Import specifiers left out of the bundle: the layers a consumer already pays for. */
  readonly external?: readonly string[];
  readonly note: string;
}

// Externals are named file by file, never globbed. A glob is how a budget line stops
// measuring without ever going red: `*` does not cross a path separator, so `../*` marks
// `../types.js` external and misses `../dom/query.js`, while `./*` on a top-level entry
// can externalise the line's own contents and report a re-export stub as proof. Each list
// below is the part of the core graph that the subpath also imports — and deliberately
// not a module whose only importers are subpaths, because externalising one of those
// charges it to nobody and only the whole-package line ever sees it.
const LINES: readonly Line[] = [
  {
    name: "core",
    entries: ["index.js"],
    cap: null,
    note: "intent bus, input system, keymap, engage mode, modality, tabbable — what every consumer pays",
  },
  {
    name: "gamepad engine",
    entries: ["gamepad/gamepad.js"],
    cap: null,
    external: ["../types.js", "../input-system.js", "../dom/event.js"],
    note: "opt-in subpath, measured next to the core",
  },
  {
    name: "spatial engine",
    entries: ["spatial/spatial.js"],
    cap: null,
    external: ["../types.js", "../input-system.js", "../dom/query.js", "../tabbable.js"],
    note: "opt-in subpath next to the core; dom/raf.js and dom/platform.js are charged here, no root export reaching them",
  },
  {
    name: "focus ring",
    entries: ["focus-ring/focus-ring.js"],
    cap: null,
    external: [
      "../types.js",
      "../input-system.js",
      "../dom/event.js",
      "../dom/query.js",
      "../modality.js",
    ],
    note: "opt-in subpath next to the core; dom/platform.js is charged here as it is to spatial, which is correct for a marginal cost",
  },
  {
    name: "debug",
    entries: ["debug.js"],
    cap: null,
    external: [
      "./types.js",
      "./spatial/spatial.js",
      "./spatial/geometry.js",
      "./spatial/containers.js",
    ],
    note: "explainMove, measured next to the spatial engine",
  },
  {
    name: "whole package",
    entries: ["index.js", "gamepad/gamepad.js", "spatial/spatial.js", "focus-ring/focus-ring.js"],
    cap: null,
    note: "every runtime entry bundled once, nothing external — the debug entry is excluded on purpose",
  },
];

interface Measurement {
  readonly line: Line;
  readonly minified: number;
  readonly gzipped: number;
}

async function measure(line: Line): Promise<Measurement> {
  const files = line.entries.map((entry) => path.join(distDir, entry));
  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`${path.relative(rootDir, file)} is missing — run \`bun run build\` first`);
    }
  }

  // A named external that matches no built file is silent: the bundle simply keeps the
  // module, the line measures more than it claims, and nothing ever goes red. Since the
  // lists above encode a file layout, they have to be checked against it.
  for (const file of files) {
    for (const specifier of line.external ?? []) {
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!existsSync(resolved)) {
        throw new Error(
          `${line.name}: external \`${specifier}\` resolves to ${path.relative(rootDir, resolved)}, which does not exist — re-derive this line's externals from the built graph`,
        );
      }
    }
  }

  // Several entries are bundled once through a synthetic module: with code splitting off,
  // passing them as separate entrypoints would duplicate every shared module in every
  // output and overstate the sum. It imports namespaces into a sink rather than
  // re-exporting, because an ambiguous star export is dropped by ES semantics — the code
  // behind the dropped names becomes unreachable and the measurement reads as a fraction
  // of itself. It is written inside dist/ so its relative specifiers resolve the way a
  // consumer's would and so its own path cannot match one of the external patterns.
  let entrypoint: string;
  let synthetic: string | null = null;
  if (files.length === 1) {
    entrypoint = files[0] as string;
  } else {
    entrypoint = path.join(distDir, `__size-${line.name.replace(/\W+/g, "-")}.js`);
    const names = files.map((_, index) => `entry${index}`);
    const source = [
      ...files.map((file, index) => {
        const specifier = `./${path.relative(distDir, file).split(path.sep).join("/")}`;
        return `import * as ${names[index]} from ${JSON.stringify(specifier)};`;
      }),
      `export const sink = [${names.join(", ")}];`,
    ];
    writeFileSync(entrypoint, `${source.join("\n")}\n`);
    synthetic = entrypoint;
  }

  try {
    const result = await Bun.build({
      entrypoints: [entrypoint],
      target: "browser",
      format: "esm",
      minify: true,
      splitting: false,
      external: line.external ? [...line.external] : undefined,
    });
    if (!result.success) {
      throw new Error(`bundling ${line.name} failed: ${JSON.stringify(result.logs, null, 2)}`);
    }

    const chunks: Uint8Array[] = [];
    for (const output of result.outputs) chunks.push(new TextEncoder().encode(await output.text()));
    const minified = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const gzipped = Bun.gzipSync(Buffer.concat(chunks)).byteLength;
    return { line, minified, gzipped };
  } finally {
    if (synthetic !== null) rmSync(synthetic, { force: true });
  }
}

function kb(bytes: number): string {
  return `${(bytes / KB).toFixed(2)} kB`;
}

if (!existsSync(distDir)) {
  console.error("dist/ is missing — run `bun run build` before `bun run check:size`");
  process.exit(1);
}

const failures: string[] = [];
const rows: string[] = [];

for (const line of LINES) {
  const { minified, gzipped } = await measure(line);
  let status: string;
  if (line.cap === null) {
    status = "UNCAPPED";
    failures.push(
      `${line.name}: measured ${kb(gzipped)} min+gzip and has no cap — write the cap in scripts/size-budget.ts (next 0.25 kB above the measurement) and record it in an ADR-0017 amendment`,
    );
  } else if (gzipped > line.cap) {
    status = "OVER";
    failures.push(`${line.name}: ${kb(gzipped)} exceeds its cap of ${kb(line.cap)}`);
  } else {
    status = "ok";
  }
  const used = line.cap === null ? "  —" : `${Math.round((gzipped / line.cap) * 100)}%`.padStart(4);
  const cap = line.cap === null ? "(none)" : kb(line.cap);
  rows.push(
    `${line.name.padEnd(16)} ${kb(minified).padStart(10)} ${kb(gzipped).padStart(10)} ${cap.padStart(9)} ${used}  ${status.padEnd(8)} — ${line.note}`,
  );
}

console.log(
  `${"line".padEnd(16)} ${"min".padStart(10)} ${"min+gzip".padStart(10)} ${"cap".padStart(9)} used  status`,
);
for (const row of rows) console.log(row);

if (failures.length > 0) {
  console.error(`\nsize budgets failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nsize budgets passed for ${LINES.length} lines`);
