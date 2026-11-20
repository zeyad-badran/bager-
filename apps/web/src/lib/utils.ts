/**
 * `cn`: merge Tailwind class names, letting later classes win over earlier conflicting ones.
 *
 * Module:   app shell (apps/web/src/lib)
 * Serves:   ADR-0001 (shadcn/ui): the helper every shadcn/ui component imports from `@/lib/utils`.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names (clsx) and resolve Tailwind conflicts (`p-2 p-4` becomes `p-4`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
