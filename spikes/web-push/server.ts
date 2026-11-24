/**
 * Local sender for the Web Push spike: serves the test page and service worker, stores subscriptions, and runs
 * the outbox worker that sends through `web-push`.
 * Run: pnpm exec tsx spikes/web-push/server.ts   then open it on a phone through the HTTPS tunnel (see the matrix doc).
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07, AT-08 · spike scope items 1–4
 * Protects: listens on 127.0.0.1 only (the tunnel is the one way in); serves a fixed list of files (no path
 *           traversal); bounded, validated JSON bodies; never logs endpoints or keys.
 */
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { loadVapidConfig } from "./env";
import { Harness } from "./harness";
import { parseSendRequest, parseSubscription } from "./validate";
import { WebPushProvider } from "./web-push-provider";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 16 * 1024;
const WORKER_INTERVAL_MS = 500;
const PUBLIC_DIR = fileURLToPath(new URL("public/", import.meta.url));

/** The only files served. Everything else is 404. */
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/push-env.js": { file: "push-env.js", type: "text/javascript; charset=utf-8" },
  "/sw.js": { file: "sw.js", type: "text/javascript; charset=utf-8" },
  "/manifest.webmanifest": { file: "manifest.webmanifest", type: "application/manifest+json" },
  "/icon.svg": { file: "icon.svg", type: "image/svg+xml" },
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  // Always fresh: an old service worker or page would make results from different runs look alike.
  "Cache-Control": "no-store",
};

const vapid = loadVapidConfig();
const harness = new Harness(new WebPushProvider(vapid));

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** `{ eventId }` posted by the service worker or the page. */
function eventIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("eventId" in body)) return null;
  const { eventId } = body;
  return typeof eventId === "string" && eventId.length <= 64 ? eventId : null;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (req.method === "GET" && url.pathname === "/api/vapid-public-key") return sendJson(res, 200, { key: vapid.publicKey });
  if (req.method === "GET" && url.pathname === "/api/status") {
    const status = harness.status(url.searchParams.get("subscriptionId") ?? "");
    return status ? sendJson(res, 200, status) : sendJson(res, 404, { error: "unknown subscription" });
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });

  const body = await readJson(req);
  if (url.pathname === "/api/subscribe") {
    const parsed = parseSubscription(body);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
    const result = harness.subscribe(parsed.value);
    if ("id" in result) console.log(`subscribed ${result.id} via ${result.endpointKind}`);
    return sendJson(res, "id" in result ? 200 : 429, result);
  }
  if (url.pathname === "/api/send") {
    const parsed = parseSendRequest(body);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
    const result = harness.send(parsed.value);
    if ("eventId" in result) console.log(`enqueued ${result.eventId} (${parsed.value.kind}, delay ${parsed.value.delaySeconds}s)`);
    return sendJson(res, "eventId" in result ? 200 : 404, result);
  }
  const eventId = eventIdOf(body);
  if (eventId && url.pathname === "/api/received") return sendJson(res, 200, { ok: harness.markReceived(eventId) });
  if (eventId && url.pathname === "/api/clicked") return sendJson(res, 200, { ok: harness.markClicked(eventId) });
  return sendJson(res, 404, { error: "not found" });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const respond = async () => {
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    const entry = STATIC_FILES[url.pathname];
    if (!entry || req.method !== "GET") return sendJson(res, 404, { error: "not found" });
    const content = await readFile(`${PUBLIC_DIR}${entry.file}`);
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": entry.type });
    res.end(content);
  };
  respond().catch((error: unknown) => {
    console.error(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    if (!res.headersSent) sendJson(res, 400, { error: "bad request" });
  });
});

const port = Number(process.env.PORT) || DEFAULT_PORT;
const timer = setInterval(() => {
  harness.worker.tick().then(
    (count) => {
      if (count > 0) console.log(`worker: attempted ${count} event(s)`);
    },
    (error: unknown) => console.error(`worker tick failed: ${error instanceof Error ? error.message : String(error)}`),
  );
}, WORKER_INTERVAL_MS);

server.listen(port, HOST, () => {
  console.log(`Web Push spike sender on http://localhost:${port}  (stop with Ctrl+C)`);
  // 127.0.0.1, not "localhost": on Windows "localhost" may resolve to ::1, where nothing listens.
  console.log(`Phones need HTTPS: in a second window run  cloudflared tunnel --url http://127.0.0.1:${port}`);
});

process.on("SIGINT", () => {
  clearInterval(timer);
  server.close(() => process.exit(0));
});
