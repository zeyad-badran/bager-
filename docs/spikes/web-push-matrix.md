# Web Push test on real phones: instructions and matrix

- Spec: [`docs/prompts/spike-web-push.md`](../prompts/spike-web-push.md) · report: [`web-push.md`](web-push.md)
- Serves: FR-12, AT-07, AT-08 · blueprint §10.3 (real-device validation matrix)
- Who fills it in: the product owner, on real phones. Nothing here uses real orders or personal data.

The test page is a throwaway tool. It runs on your Windows PC and reaches your phone through a free Cloudflare
"quick tunnel" (no account, no login, no payment). Each test sends a fake "Order N is ready" notification.

---

## Part A — One-time setup on the Windows PC (about 5 minutes)

Open VS Code on the project, then **Terminal → New Terminal**. Type each line and press Enter.

1. Install the test page's one library (only inside `spikes/web-push`):
   ```
   pnpm install --dir spikes/web-push --ignore-workspace
   ```
2. Create the test keys. They are saved in `spikes/web-push/.env.local`, which Git ignores. Never send this file to anyone.
   ```
   pnpm exec tsx spikes/web-push/generate-keys.ts
   ```
   It should say `Wrote new VAPID keys ...`. If you run it again, it keeps the old keys. That is fine.
3. Install Cloudflare's tunnel program (free, no account):
   ```
   winget install --id Cloudflare.cloudflared
   ```
   Accept the prompts. Then **close the terminal and open a new one** (so Windows finds the program), and check it:
   ```
   cloudflared --version
   ```
   It should print a version number. If `winget` is missing, download `cloudflared-windows-amd64.msi` from
   Cloudflare's official "Downloads" page for cloudflared and install it. Do **not** sign up or log in anywhere.

## Part B — Every test session

You need **two terminals** (in VS Code: the `+` button in the terminal panel).

**Terminal 1 — start the test page:**
```
pnpm exec tsx spikes/web-push/server.ts
```
Wait for `Web Push spike sender on http://localhost:8787`. Leave it running.

**Terminal 2 — open the tunnel:**
```
cloudflared tunnel --url http://127.0.0.1:8787
```
After a few seconds it prints a box with a link like `https://some-random-words.trycloudflare.com`. That is your test link.
Send it to your phone (for example, email it to yourself), or type it in.

**How to stop:** click into each terminal and press **Ctrl + C** (Terminal 2 first, then Terminal 1). Closing VS Code
also stops both. Nothing keeps running afterwards.

Important things to know:
- **The link changes every time** you start the tunnel. On iPhone, delete the old "Push test" icon and add the new
  one (step I-3) each session.
- While the tunnel runs, anyone who has the link could open the test page. It contains no data. Stop the tunnel when
  you finish.
- If you stop Terminal 1 and start it again, the results list is empty again (it is kept in memory only). The
  phone reconnects by itself when you reopen the page.
- If you want to remove cloudflared later: `winget uninstall --id Cloudflare.cloudflared`.

**Why the tunnel:** phones only allow notifications on pages served over **HTTPS** (a secure link). Your PC serves
plain `http://localhost`, which only the PC itself treats as secure. The tunnel gives it a temporary HTTPS link.

---

## Part C — iPhone (Safari), tap by tap

You need iOS **16.4 or newer** (Settings → General → About → iOS Version). On iPhone, web notifications work **only**
after the page is added to the Home Screen.

**I-1. Safari tab (expected: not possible)**
1. Open the test link in **Safari**.
2. Look at "1. This phone". It should say **Notifications: Add to Home Screen first**.
3. Write row "Safari tab" in the matrix: permission result = `needs Home Screen`.

**I-2. Check the sound settings first**
1. Turn off Silent mode (switch or Action button) and turn off any Focus / Do Not Disturb.
2. Write down whether these were on or off. They change what you hear.

**I-3. Add to the Home Screen**
1. In Safari, tap the **Share** button (square with an arrow pointing up; at the bottom, or in the ⋯ menu on newer iOS).
2. Scroll down and tap **Add to Home Screen**. If you see **Open as Web App**, leave it switched **on**.
3. Tap **Add** (top right).
4. Go to the Home Screen and tap the new **Push test** icon. Do not use the Safari tab any more.
5. "Opened from Home Screen" should now say **yes** and Notifications **Not asked yet**.

**I-4. Allow notifications**
1. Tap **Turn on notifications**.
2. iPhone asks *"Push test" Would Like to Send You Notifications*. Tap **Allow**.
3. The page shows **Allowed**, and "Push service" shows **Apple Web Push**. Write the permission result: `allowed`.

**I-5. Test 1, page open (foreground)**
1. In "3. Send a test" choose **Plain notification** and **Now (page stays open)**.
2. Tap **Send test notification**. Keep looking at the screen.
3. Write: did a notification banner appear? Did you hear a sound? Look at "5. Results" for the time to arrival.

**I-6. Test 2, screen locked**
1. Choose **Plain notification** and **In 15 seconds**. Tap **Send test notification**.
2. **Immediately** press the side button to lock the phone. Put it down and wait 30 seconds.
3. Write: did it appear on the lock screen? Sound? Vibration?
4. **Tap the notification** on the lock screen and unlock. The page should open with a green bar saying
   *Opened from the notification*. Write `tap opens page: yes/no`.

**I-7. Test 3, app in the background**
1. **In 15 seconds**, tap Send, then swipe up to go to the Home Screen (the app stays in the background).
2. Wait. Write whether it appeared.

**I-8. Test 4, app fully closed**
1. **In 30 seconds**, tap Send. Then swipe up from the bottom and hold to see all apps, and swipe **Push test** away.
2. Wait. Write whether it appeared, and whether tapping it opens the page.

**I-9. Vibration**
1. Choose **With vibration**, **In 15 seconds**, tap Send, lock the phone. Did it buzz? Three short pulses or one normal buzz?
2. Open the app. In "4. Vibration with the page open", tap **Vibrate this phone now**. On iPhone the expected answer
   is *no vibration API*. Write what it says.

**I-10. "Stays until tapped"**
1. Choose **Stays until tapped**, **Now**. When it appears, do nothing for 30 seconds. Did it stay, or disappear into
   Notification Centre like a normal one?

**I-11. Retry test (push service fails first)**
1. Choose **Plain**, **Now**, tick **Push service fails twice first**. Tap Send.
2. It should arrive a few seconds later than usual. In Results, "Tries" should show `3: HTTP 503, HTTP 503, HTTP 201`.

**I-12. Duplicate test**
1. Untick the retry box. Tick **Send the same READY twice**. Choose **Now**, tap Send.
2. Count the notifications: **one** is correct, two is a problem. The result says *sent twice, kept once*.

**I-13. Say "Don't Allow" (AT-08)**
1. Long-press the Push test icon → **Remove App** → **Delete App**.
2. Add it again (I-3), open it from the icon, tap **Turn on notifications**, and tap **Don't Allow**.
3. The page should say **Blocked** and explain how to turn it on again. Write what you saw. The page must still work.

**I-14. Turn off after allowing (revoked)**
1. Re-add the app and allow notifications (I-3 and I-4). Send one test to confirm it works.
2. Open **Settings → Notifications → Push test** and switch **Allow Notifications** off.
3. Open the app and send a **Now** test. Write what the page shows and what Results says (this can take a while;
   check again after a few minutes).

**I-15. Copy the results**
Tap **Copy results** and paste them into an email or note to yourself. Attach them to the matrix.

---

## Part D — Android (Chrome), tap by tap

Find the Android version under Settings → About phone (→ Software information). Find the Chrome version under
Chrome ⋮ → Settings → About Chrome.

**A-1. Check sound settings first**: turn off Do Not Disturb and silent/vibrate-only mode, and write down what they were.

**A-2. Open the page**
1. Open the test link in **Chrome**.
2. "1. This phone" should say **Not asked yet**, and "Opened from Home Screen" **no**.

**A-3. Allow notifications**
1. Tap **Turn on notifications**.
2. Chrome asks *... wants to show notifications*. Tap **Allow**. (Android 13+ may first ask whether **Chrome** may
   send notifications: tap **Allow** there too.)
3. The page shows **Allowed**, and "Push service" shows **Google FCM**.

**A-4 to A-10**: do the same tests as iPhone I-5 to I-12, with these Android ways to lock, close and background:
- **Lock:** press the power button.
- **Background:** press Home (or swipe up), so Chrome is in the background.
- **Tab closed:** after tapping Send, tap the tabs button (square with a number) and close this tab with **X**.
- **Chrome fully closed:** after tapping Send, open recent apps and swipe Chrome away.
- **Vibration:** "With vibration" asks for three pulses. Android may use its own default buzz. Write what you felt.
  Then also try "Vibrate this phone now" with the page open.

**A-11. Battery saving (optional, 15 minutes)**
1. Choose **In 60 seconds**, tap Send, lock the phone and leave it untouched on a table for 15 minutes before
   doing this test again (deep sleep). Write the time to arrival.

**A-12. Installed to the Home Screen (optional)**
1. Chrome ⋮ → **Add to Home screen** (or **Install app**) → **Install**. Open it from the new icon and repeat A-4 and A-5.
   This is a separate row in the matrix (installed = yes).

**A-13. Block (AT-08)**
1. Tap the icon left of the web address → **Permissions** (or **Site settings**) → **Notifications** → **Block** (or
   **Reset permission**, then reload and tap **Don't allow**).
2. Reload the page. It should say **Blocked** with instructions. Write what you saw.

**A-14. Turn off after allowing (revoked)**: allow again, send one test, then do A-13 and send another test.
Write what Results shows now and after a few minutes.

**A-15. Copy the results** as in I-15.

Optional extra rows if you have them: Samsung Internet, Firefox for Android, Chrome on iPhone (expected: like Safari, needs Home Screen),
an in-app browser (open the link from WhatsApp/Instagram: expected "Not supported here").

---

## Part E — The matrix (one row per phone + browser + installed/not)

Use: `yes` / `no` / `n/a` (not possible) / `?` (not tested). "Shown" means **you saw it with your own eyes**. "Time to arrival" is the
**Time to arrival** value from Results (the sender's clock, from "due to send" until the phone's background code
reported back).

| # | Device | OS version | Browser + version | Installed to Home Screen | Permission result | Shown: foreground | Shown: background | Shown: locked | Shown: app/tab closed | Vibration | Sound | Tap opens the page | Time to arrival (s) | Push service shown | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | e.g. iPhone 13 | iOS 18.1 | Safari | no | needs Home Screen | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | |
| 2 | | | Safari | yes | | | | | | | | | | | |
| 3 | | | Chrome | no | | | | | | | | | | | |
| 4 | | | Chrome | yes | | | | | | | | | | | |
| 5 | | | | | | | | | | | | | | | |

**Special tests** (one line per phone):

| # | Device + browser | Retry test (I-11/A-9): arrived? tries shown | Duplicate (I-12/A-10): how many notifications | "Stays until tapped": stayed? | Don't Allow / Block: page message clear? page still usable? | Revoked: what Results showed (now / after minutes) | Battery saving (A-11): arrival time | Silent / Focus / DND state during tests |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |

When you're done, send the filled matrix and the copied results to Claude chat. Don't send the `.env.local` file or the tunnel link.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| The link shows a Cloudflare error page | Terminal 1 is not running, or it is on another port. Start Terminal 1 first, then Terminal 2. |
| `cloudflared` is "not recognized" | Close and reopen the terminal after installing, or restart VS Code. |
| iPhone: no "Turn on" button works | You are in a Safari tab. Open the page from the Home Screen icon (I-3). |
| iPhone icon opens an old, broken page | The tunnel link changed. Delete the icon and add the new link (I-3). |
| "Send" button is grey | Do step "Turn on notifications" first. |
| Results show `failed (permanent error (HTTP 403))` on iPhone | Apple refused the test key's contact address. In `spikes/web-push/.env.local`, change `VAPID_SUBJECT=` to a `mailto:` address you own, restart Terminal 1 and turn notifications on again. Write it in Notes. |
| Results show "Subscription disabled by the sender" | The push service said this phone's subscription is gone. Tap **Turn on notifications** again. |
| Nothing arrives, Results say "accepted by push service" | Write exactly that: it is an important result (accepted is not the same as shown). Check Focus / DND and notification settings. |
