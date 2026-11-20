/**
 * ESLint flat config: Next.js recommended + Core Web Vitals + TypeScript rules, plus an import
 * restriction that mirrors the module boundary rule.
 *
 * Module:   app shell (apps/web)
 * Serves:   ADR-0001 (modular monolith), CLAUDE.md "other modules import only through index.ts",
 *           slice 01b items 1 and 8
 *
 * The restriction here is the SIMPLE half of `scripts/check-module-boundaries.mjs`: it catches deep
 * imports through the `@/modules/...` alias and any import from `spikes/` while you type. Relative
 * deep imports (`../orders/state-machine`) cannot be expressed as an ESLint path pattern without
 * also blocking legal same-module imports, so the script stays the authoritative CI check.
 */
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*"],
              message: "Import another module through its index only, e.g. \"@/modules/shared\" (CLAUDE.md).",
            },
            {
              group: ["**/spikes", "**/spikes/**"],
              message: "Product code must never import from spikes/ (spikes are throwaway).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
