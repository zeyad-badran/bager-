/**
 * PostCSS pipeline: Tailwind CSS v4 only.
 *
 * Module:   app shell (apps/web)
 * Serves:   ADR-0001 (Tailwind + shadcn/ui) · slice 01b
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
