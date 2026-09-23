import { defineConfig, type UserConfig } from "tsdown";

// The published surface is listed entry by entry so it stays readable here. Each subpath
// points at a real module, never at an index of re-exports, and the exports map is
// rewritten from this list so that `@standarx/nav/gamepad` does not leak the file layout.
const config: UserConfig = defineConfig({
  entry: [
    "src/index.ts",
    "src/gamepad/gamepad.ts",
    "src/spatial/spatial.ts",
    "src/focus-ring/focus-ring.ts",
    "src/debug.ts",
    "src/auto/auto.ts",
    "src/react/react.tsx",
    "src/vue/vue.ts",
    "src/keyboard/keyboard.ts",
    // One entry per layout, never one module holding them all: a French application must
    // not ship Cyrillic (ADR-0022, decision 4).
    "src/keyboard/layouts/qwerty.ts",
    "src/keyboard/layouts/azerty.ts",
    "src/keyboard/layouts/alphabetic.ts",
  ],
  format: ["esm"],
  platform: "neutral",
  // Optional peers: an application that never imports `./react` or `./vue` must not pull
  // a framework into its graph, and one that does already has its own copy.
  external: ["react", "react-dom", "react/jsx-runtime", "vue"],
  unbundle: true,
  dts: true,
  clean: true,
  publint: true,
  exports: {
    customExports(exports) {
      const subpaths: Readonly<Record<string, string>> = {
        "./gamepad/gamepad": "./gamepad",
        "./spatial/spatial": "./spatial",
        "./focus-ring/focus-ring": "./focus-ring",
        "./auto/auto": "./auto",
        "./react/react": "./react",
        "./vue/vue": "./vue",
        "./keyboard/keyboard": "./keyboard",
        // `layouts/` is a directory, not a subpath: a consumer writes
        // `@standarx/nav/keyboard/qwerty`.
        "./keyboard/layouts/qwerty": "./keyboard/qwerty",
        "./keyboard/layouts/azerty": "./keyboard/azerty",
        "./keyboard/layouts/alphabetic": "./keyboard/alphabetic",
      };
      const renamed: Record<string, string> = {};
      for (const [subpath, target] of Object.entries(exports)) {
        renamed[subpaths[subpath] ?? subpath] = target;
      }
      return renamed;
    },
  },
});

export default config;
