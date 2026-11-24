/**
 * Generates a VAPID key pair locally and writes it to the git-ignored `spikes/web-push/.env.local`.
 * Run once: pnpm exec tsx spikes/web-push/generate-keys.ts   (add --force to replace existing keys)
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12 · spike scope item 2 ("VAPID keys generated locally into an ignored .env.local, never committed")
 * Protects: refuses to overwrite existing keys unless asked (new keys make every phone subscribe again), and
 *           never prints the private key.
 */
import { writeFileSync } from "node:fs";
import webpush from "web-push";
import { DEFAULT_VAPID_SUBJECT, ENV_FILE } from "./env";

const force = process.argv.includes("--force");
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const content = [
  "# Web Push spike VAPID keys. Generated locally by generate-keys.ts. NEVER commit this file.",
  "# Test-only keys for the throwaway harness; not used by the product.",
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${privateKey}`,
  `VAPID_SUBJECT=${DEFAULT_VAPID_SUBJECT}`,
  "",
].join("\n");

try {
  // "wx" fails if the file exists, so keys are never replaced by accident.
  writeFileSync(ENV_FILE, content, { flag: force ? "w" : "wx", mode: 0o600 });
  console.log(`Wrote new VAPID keys to ${ENV_FILE} (git-ignored). The private key is not printed.`);
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.log(`Keys already exist in ${ENV_FILE}; keeping them. Use --force to replace them.`);
  } else {
    throw error;
  }
}
