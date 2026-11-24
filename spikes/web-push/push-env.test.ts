/**
 * Tests for the browser-side helpers that decide which permission state the harness page shows and which push
 * service an endpoint belongs to.
 *
 * Module:   spikes/web-push (THROWAWAY)
 * Serves:   FR-12, AT-08 · blueprint §10.2 (clear state when unsupported, blocked or revoked) · spike scope item 1
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endpointKind, permissionState } from "./public/push-env.js";

const fullSupport = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  isIOS: false,
  isStandalone: false,
};

describe("AT-08 permission state shown to the tester", () => {
  it("granted / denied / not asked yet", () => {
    assert.equal(permissionState({ ...fullSupport, permission: "granted" }), "granted");
    assert.equal(permissionState({ ...fullSupport, permission: "denied" }), "denied");
    assert.equal(permissionState(fullSupport), "not-asked");
  });

  it("iPhone Safari tab (not installed): push APIs are missing, so the answer is 'Add to Home Screen'", () => {
    const iosTab = { ...fullSupport, isIOS: true, hasPushManager: false, hasNotification: false };
    assert.equal(permissionState(iosTab), "needs-home-screen");
  });

  it("iPhone installed to the Home Screen with push available behaves like any supported browser", () => {
    assert.equal(permissionState({ ...fullSupport, isIOS: true, isStandalone: true }), "not-asked");
  });

  it("installed on iOS but still no push (iOS older than 16.4) is unsupported, not 'Add to Home Screen'", () => {
    const oldIos = { ...fullSupport, isIOS: true, isStandalone: true, hasPushManager: false, hasNotification: false };
    assert.equal(permissionState(oldIos), "unsupported");
  });

  it("missing service worker or push (private mode, old browser, in-app browser) is unsupported", () => {
    assert.equal(permissionState({ ...fullSupport, hasServiceWorker: false }), "unsupported");
    assert.equal(permissionState({ ...fullSupport, hasPushManager: false }), "unsupported");
    assert.equal(permissionState({ ...fullSupport, hasNotification: false }), "unsupported");
  });
});

describe("FR-12 endpoint type", () => {
  it("names the push service from the endpoint host", () => {
    assert.equal(endpointKind("https://fcm.googleapis.com/fcm/send/abc"), "Google FCM (Chrome, Edge on Android, Samsung)");
    assert.equal(endpointKind("https://web.push.apple.com/QK1"), "Apple Web Push (Safari, iOS Home Screen apps)");
    assert.equal(endpointKind("https://updates.push.services.mozilla.com/wpush/v2/x"), "Mozilla autopush (Firefox)");
    assert.equal(endpointKind("https://wns2-db5p.notify.windows.com/w/?token=x"), "Microsoft WNS (Edge on Windows)");
  });

  it("unknown hosts and garbage are reported, not guessed", () => {
    assert.equal(endpointKind("https://push.example.test/x"), "other (push.example.test)");
    assert.equal(endpointKind("not a url"), "invalid endpoint");
  });
});
