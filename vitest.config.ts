import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, type ViteUserConfig } from "vitest/config";

// One browser locally, the full matrix in CI (`SNAV_BROWSER=firefox bun run test:browser`).
// Browser tests are named `*.browser.test.ts`: anything that touches the DOM runs against
// a real engine, because focus order, composed paths and computed visibility are exactly
// where jsdom and the browsers disagree. Pure modules stay in the node project.
type PlaywrightBrowser = "chromium" | "firefox" | "webkit";
const browser = (process.env.SNAV_BROWSER ?? "chromium") as PlaywrightBrowser;

const config: ViteUserConfig = defineConfig({
  test: {
    // `passWithNoTests` was set here while `src/` did not exist, so the scaffold did
    // not ship a gate that was already red. Both projects match files now, and an
    // empty project means the globs below stopped matching — a discovery breakage
    // that must be as red as a failing assertion, not a green run of nothing.
    projects: [
      {
        // Compiles the Svelte adapter's test components, and only those: the adapter itself is
        // plain TypeScript. `unit` needs it too, for the server render in `src/svelte/svelte.test.ts`.
        plugins: [svelte({ configFile: false })],
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts", "**/*.browser.test.tsx"],
        },
      },
      {
        plugins: [svelte({ configFile: false })],
        // The esm-bundler build of Vue expects its bundler to define these, and says so
        // on every run when none does. The values are Vue's own defaults, and only the
        // Vue adapter's tests load that build; `unit` gets Vue's CommonJS build from Node.
        define: {
          __VUE_OPTIONS_API__: "true",
          __VUE_PROD_DEVTOOLS__: "false",
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
        },
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser }],
          },
        },
      },
    ],
  },
});

export default config;
