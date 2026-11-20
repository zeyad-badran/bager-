/**
 * Playwright configuration for `pnpm e2e` (browser smoke tests).
 *
 * Module:   app shell (apps/web)
 * Serves:   ADR-0001 (Playwright) · FR-18 (LTR/RTL proven in a real browser) · slice 01b items 1 and 3
 *
 * Runs against a production build (`next build` + `next start`) so the test sees what users would
 * get, not the dev server. Chromium only for now; Safari/Firefox are added when customer pages exist
 * (Web Push on iOS is a separate spike).
 */
import { defineConfig, devices } from "@playwright/test";

/** Port for the test server; not 3000, so a running `pnpm dev` does not collide with the tests. */
const E2E_PORT = 3100;
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
/** `next build` on a cold CI runner can take a couple of minutes. */
const SERVER_START_TIMEOUT_MS = 180_000;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: SERVER_START_TIMEOUT_MS,
  },
});
