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
    // An empty run is a pass, and it has to be set here: vitest treats this as a
    // non-project option, so a per-project copy is a type error. Without it the suite
    // exits 1 before `src/` exists, and the first ported modules would be un-breaking a
    // gate the scaffold broke rather than keeping a green one green.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts", "**/*.browser.test.tsx"],
        },
      },
      {
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
