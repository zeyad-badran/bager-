/**
 * Loads the VAPID keys from `spikes/web-push/.env.local` (git-ignored by the root `.gitignore` rule `.env.*`).
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12 · CLAUDE.md hard rule 2 (secrets never in the repo)
 * Protects: the private key is read from the ignored file only and is never printed.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { VapidConfig } from "./web-push-provider";

/** Absolute path of the ignored key file, next to this source file. */
export const ENV_FILE = fileURLToPath(new URL(".env.local", import.meta.url));

/** Shown in the JWT "sub" claim to push services; a placeholder is fine for a local test. */
export const DEFAULT_VAPID_SUBJECT = "mailto:web-push-spike@example.com";

export function loadVapidConfig(): VapidConfig {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`No VAPID keys yet. Run: pnpm exec tsx spikes/web-push/generate-keys.ts`);
  }
  process.loadEnvFile(ENV_FILE);
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error(`${ENV_FILE} must contain VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY`);
  return { subject: process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT, publicKey, privateKey };
}
