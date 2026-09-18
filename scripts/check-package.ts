/// <reference types="node" />

// tsdown runs publint during the build, but against the source tree: it never sees what
// `files` actually ships. This script packs the package with `bun pm pack` and lints the
// real tarball — the only artifact npm ever receives — with publint, then with attw in
// the `esm-only` profile (the package is ESM-only, so the CJS and node10 resolutions are
// deliberately ignored).

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const shell = process.platform === "win32";

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
}

const manifest = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")) as Manifest;
if (manifest.private === true) {
  console.error("package.json is private: there is no tarball to lint");
  process.exit(1);
}

// `files` ships dist, LICENSE and README. Without dist the pack still succeeds and the
// linters still run, on a tarball with no code in it — a failure whose message says
// nothing about the package being wrong.
if (!existsSync(path.join(rootDir, "dist"))) {
  console.error("dist/ is missing — run `bun run build` before `bun run check:package`");
  process.exit(1);
}

const outDir = mkdtempSync(path.join(tmpdir(), "standarnav-pack-"));
const failures: string[] = [];

function run(label: string, command: string, args: readonly string[]): boolean {
  const result = spawnSync(command, [...args], { cwd: rootDir, stdio: "inherit", shell });
  if (result.status !== 0) {
    failures.push(label);
    return false;
  }
  return true;
}

try {
  // `bun pm pack` refuses --filename together with --destination, so the name is
  // reconstructed the way bun builds it: scope flattened, version appended.
  const slug = manifest.name.replace("@", "").replace("/", "-");
  const tarball = path.join(outDir, `${slug}-${manifest.version}.tgz`);

  if (run("pack", "bun", ["pm", "pack", "--destination", outDir])) {
    if (!existsSync(tarball)) {
      failures.push(`tarball not found at ${tarball}`);
    } else {
      // --strict, because publint's warnings are the interesting half: without it the
      // command prints them and exits 0, which reports rather than gates.
      run("publint", "bun", ["x", "publint", "--strict", tarball]);
      run("attw", "bun", ["x", "attw", tarball, "--profile", "esm-only"]);
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\npackage checks failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\npackage checks passed for ${manifest.name}@${manifest.version}`);
