/**
 * Script for the Web Push test page: detects support and permission, subscribes after a tap, sends test
 * notifications through the local sender, and shows the results.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07, AT-08 · spike scope items 1 and 3 · blueprint §10.2 (never prompt on page load;
 *           continue if declined; clear state when unsupported or blocked)
 */
import { endpointKind, permissionState } from "./push-env.js";

const STORAGE_KEY = "bager-push-spike-subscription-id";
const POLL_MS = 2000;
const MS_PER_SECOND = 1000;
const $ = (id) => document.getElementById(id);

const STATE_TEXT = {
  granted: ["Allowed", "Good. Go to step 3 and send a test."],
  "not-asked": ["Not asked yet", "Tap “Turn on notifications”. The phone asks once."],
  denied: [
    "Blocked",
    "Notifications are blocked for this site. iPhone: Settings → Notifications → Push test → Allow Notifications. " +
      "Android Chrome: tap the icon left of the web address → Permissions → Notifications → Allow. Then reload.",
  ],
  unsupported: [
    "Not supported here",
    "This browser cannot receive web push here (private mode, an app's built-in browser, or too old). " +
      "Write “unsupported” in the matrix. The order page would still work while it is open.",
  ],
  "needs-home-screen": [
    "Add to Home Screen first",
    "On iPhone, notifications only work from the Home Screen: tap Share (square with an arrow) → " +
      "“Add to Home Screen” → Add. Close Safari, then open “Push test” from the new icon.",
  ],
};

function environment() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return {
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "",
    isIOS,
    isStandalone,
  };
}

function render() {
  const env = environment();
  const state = permissionState(env);
  const [label, help] = STATE_TEXT[state];
  $("state").textContent = label;
  $("state").className = `state ${state}`;
  $("state-help").textContent = help;
  $("installed").textContent = env.isStandalone ? "yes" : "no";
  $("ua").textContent = navigator.userAgent;
  $("enable").disabled = state === "unsupported" || state === "needs-home-screen" || state === "denied";
  $("send").disabled = !localStorage.getItem(STORAGE_KEY);
  return state;
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
  return json;
}

function keyBytes(base64url) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Sends the browser subscription to the sender and remembers the id it gives back. */
async function register(subscription) {
  const { id, endpointKind: kind } = await api("/api/subscribe", subscription.toJSON());
  localStorage.setItem(STORAGE_KEY, id);
  $("endpoint").textContent = kind;
  render();
}

async function enable() {
  const note = $("enable-note");
  note.textContent = "Asking…";
  try {
    // Only from this tap (blueprint §10.2: never on page load). iOS requires a user gesture.
    const permission = await Notification.requestPermission();
    render();
    if (permission !== "granted") {
      note.textContent = `Answer: ${permission}. That is fine: write it in the matrix. The page still works while open.`;
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const { key } = await api("/api/vapid-public-key");
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await register(subscription);
    note.textContent = `Subscribed via ${endpointKind(subscription.endpoint)}. Go to step 3.`;
  } catch (error) {
    note.textContent = `Could not subscribe: ${error.message}. Write this message in the matrix.`;
  }
}

let countdownTimer;
async function send() {
  const note = $("send-note");
  const delaySeconds = Number($("delay").value);
  const body = {
    subscriptionId: localStorage.getItem(STORAGE_KEY),
    kind: document.querySelector("input[name=kind]:checked").value,
    delaySeconds,
    failFirst: $("fail").checked ? 2 : 0,
    duplicate: $("duplicate").checked,
  };
  try {
    const result = await api("/api/send", body);
    clearInterval(countdownTimer);
    if (delaySeconds === 0) {
      note.textContent = `Test ${result.ticket} sent. Keep the page open and watch for it.`;
      return;
    }
    let left = delaySeconds;
    const tick = () => {
      note.innerHTML = "";
      const big = document.createElement("div");
      big.className = "big";
      big.textContent = left > 0 ? `${left} s — lock the phone now` : "Sent — wait for the notification";
      const hint = document.createElement("div");
      hint.textContent = `Test ${result.ticket}: press the side button to lock, or close this tab / switch app. Then wait.`;
      note.append(big, hint);
      left -= 1;
      if (left < -1) clearInterval(countdownTimer);
    };
    tick();
    countdownTimer = setInterval(tick, MS_PER_SECOND);
  } catch (error) {
    note.textContent = `Send failed: ${error.message}`;
  }
}

function vibrateNow() {
  const ok = typeof navigator.vibrate === "function" && navigator.vibrate([300, 100, 300]);
  $("vibrate-note").textContent = ok
    ? "Vibration requested. Did the phone buzz? Write yes/no in the matrix."
    : "This browser has no vibration API (expected on iPhone). Write “no API” in the matrix.";
}

const OUTCOME = { pending: "waiting / retrying", "in-flight": "sending", sent: "accepted by push service", dead: "failed" };
const seconds = (ms) => (ms === null ? "—" : `${(ms / MS_PER_SECOND).toFixed(1)} s`);
const clock = (at) => (at === null ? "—" : new Date(at).toLocaleTimeString());
let lastResults = [];

function renderResults(status) {
  const container = $("results");
  lastResults = status.events;
  container.innerHTML = "";
  if (status.subscription.disabledAt !== null) {
    const p = document.createElement("p");
    p.className = "state denied";
    p.textContent = `Subscription disabled by the sender: ${status.subscription.disabledReason}. Tap “Turn on” again.`;
    container.append(p);
  }
  if (status.events.length === 0) container.insertAdjacentHTML("beforeend", "<p class='muted'>No tests yet.</p>");
  for (const e of status.events) {
    const row = document.createElement("div");
    row.className = "result";
    const tries = e.history.map((h) => h.detail).join(", ") || "—";
    row.innerHTML = "<strong></strong><dl></dl>";
    row.querySelector("strong").textContent = `Test ${e.ticket} · ${e.kind}${e.duplicateIgnored ? " · sent twice, kept once" : ""}`;
    const fields = [
      ["Status", OUTCOME[e.status] + (e.lastError && e.status === "dead" ? ` (${e.lastError})` : "")],
      ["Tries", `${e.attempts}: ${tries}`],
      ["Phone received", e.receivedAt === null ? "not yet" : clock(e.receivedAt)],
      ["Time to arrival", seconds(e.arrivalMs)],
      ["Opened by tap", e.clickedAt === null ? "not yet" : clock(e.clickedAt)],
    ];
    const dl = row.querySelector("dl");
    for (const [name, value] of fields) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = name;
      dd.textContent = value;
      dl.append(dt, dd);
    }
    container.append(row);
  }
}

async function poll() {
  const id = localStorage.getItem(STORAGE_KEY);
  if (!id) return;
  try {
    const response = await fetch(`/api/status?subscriptionId=${encodeURIComponent(id)}`);
    if (response.status === 404) {
      // The sender restarted (memory only): re-register this browser's subscription.
      localStorage.removeItem(STORAGE_KEY);
      await restore();
      return;
    }
    renderResults(await response.json());
  } catch {
    // Offline or sender stopped; try again on the next poll.
  }
}

async function copyResults() {
  const env = environment();
  const lines = [
    `browser: ${navigator.userAgent}`,
    `home screen: ${env.isStandalone ? "yes" : "no"}; permission: ${env.permission || "n/a"}; push service: ${$("endpoint").textContent}`,
    ...lastResults.map(
      (e) => `test ${e.ticket} ${e.kind}: ${OUTCOME[e.status]}; tries ${e.attempts}; received ${e.receivedAt === null ? "no" : "yes"}; ` +
        `arrival ${seconds(e.arrivalMs)}; opened by tap ${e.clickedAt === null ? "no" : "yes"}`,
    ),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    $("copy-note").textContent = "Copied. Paste it into the matrix notes.";
  } catch {
    $("copy-note").textContent = lines.join("\n");
  }
}

/** On load: re-register an existing subscription silently (no prompt; the permission was given earlier). */
async function restore() {
  if (render() !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await register(subscription);
}

function showOpenedBanner() {
  const opened = new URLSearchParams(location.search).get("opened");
  if (opened !== null) $("banner").textContent = `Opened from the notification for test ${opened}. Write “tap opens page: yes”.`;
}

async function start() {
  showOpenedBanner();
  render();
  $("enable").addEventListener("click", enable);
  $("send").addEventListener("click", send);
  $("vibrate").addEventListener("click", vibrateNow);
  $("copy").addEventListener("click", copyResults);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "push-received") {
        $("banner").textContent = `Push for test ${event.data.ticket} arrived while this page was open.`;
      }
    });
    await navigator.serviceWorker.register("/sw.js");
    await restore().catch(() => undefined);
  }
  setInterval(poll, POLL_MS);
  poll();
}

start();
