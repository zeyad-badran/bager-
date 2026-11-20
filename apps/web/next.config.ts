/**
 * Next.js configuration.
 *
 * Module:   app shell (apps/web)
 * Serves:   ADR-0001 (Next.js App Router) · slice 01b
 * Note:     deliberately empty. Hosting (ADR-0003) and headers/CSP are decided in later slices.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The x-powered-by header advertises the framework and version; it serves no user.
  poweredByHeader: false,
};

export default nextConfig;
