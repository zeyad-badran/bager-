/**
 * Browser-side helpers for the push test page: which permission state to show, and which push service an
 * endpoint belongs to. Plain JavaScript so the browser loads it as is; the Node tests import the same file.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-08 · blueprint §10.2 (clear state when unsupported, blocked or revoked) · spike scope item 1
 */

/**
 * @typedef {object} PushEnvironment
 * @property {boolean} hasServiceWorker  `"serviceWorker" in navigator`
 * @property {boolean} hasPushManager    `"PushManager" in window`
 * @property {boolean} hasNotification   `"Notification" in window`
 * @property {string}  permission        `Notification.permission` ("default" | "granted" | "denied"), or "" if missing
 * @property {boolean} isIOS             iPhone or iPad (iPadOS reports itself as a Mac with touch)
 * @property {boolean} isStandalone      opened from the Home Screen icon (display-mode: standalone)
 */

/**
 * The state the tester sees.
 * On iPhone, Web Push exists only for a site added to the Home Screen and opened from its icon (iOS 16.4+);
 * in a Safari tab the push APIs are simply missing, so "missing + iOS + not installed" means "Add to Home Screen".
 *
 * @param {PushEnvironment} env
 * @returns {"granted" | "denied" | "not-asked" | "unsupported" | "needs-home-screen"}
 */
export function permissionState(env) {
  const hasPush = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (!hasPush) return env.isIOS && !env.isStandalone ? "needs-home-screen" : "unsupported";
  if (env.permission === "granted") return "granted";
  if (env.permission === "denied") return "denied";
  return "not-asked";
}

/** Push service host suffix → name shown to the tester. */
const PUSH_SERVICES = [
  ["fcm.googleapis.com", "Google FCM (Chrome, Edge on Android, Samsung)"],
  ["push.apple.com", "Apple Web Push (Safari, iOS Home Screen apps)"],
  ["push.services.mozilla.com", "Mozilla autopush (Firefox)"],
  ["notify.windows.com", "Microsoft WNS (Edge on Windows)"],
];

/**
 * @param {string} endpoint the subscription endpoint URL
 * @returns {string} the push service that will carry our messages
 */
export function endpointKind(endpoint) {
  let host;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return "invalid endpoint";
  }
  const match = PUSH_SERVICES.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`));
  return match ? match[1] : `other (${host})`;
}
