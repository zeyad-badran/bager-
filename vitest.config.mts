/**
 * Vitest configuration for `pnpm test:unit`.
 *
 * Module:   tooling (repo root)
 * Serves:   ADR-0001 (Vitest) · slice 01b item 4 (unit tests moved from node:test to Vitest,
 *           product-owner decision 2026-11-20)
 *
 * Lives at the repo root because it also runs the tests of the root `scripts/` folder (the
 * boundary checker), not only the app's module tests. Playwright specs (`apps/web/e2e`) are
 * excluded: they run with `pnpm e2e` against a real browser.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/.next/**", "apps/web/e2e/**"],
    environment: "node",
  },
});
