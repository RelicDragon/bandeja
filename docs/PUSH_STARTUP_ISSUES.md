# Push & native startup — remaining issues (P1–P3)

Audit after fixing cold-start crash: push init was removed from permission-at-install path and split into early (listeners) vs late (permission/register).

**Status:** P1–P3 follow-up fixes implemented. Reverified: early listeners await in `setupCapacitor`, single shell permission prompt, auth-gated token sync, logout preserves device token.

**Related files**

| Area | Path |
|------|------|
| Push service | `Frontend/src/services/pushNotificationService.ts` |
| Capacitor setup | `Frontend/src/utils/capacitorSetup.ts` |
| App bootstrap | `Frontend/src/App.tsx` |
| Login / register | `Frontend/src/pages/Login.tsx`, `Frontend/src/pages/Register.tsx` |
| Foreground sync | `Frontend/src/services/appLifecycle.service.ts` |
| iOS delegate | `Frontend/ios/App/App/BandejaPushNotificationDelegate.swift` |
| iOS action types | `Frontend/src/services/push/registerPushNotificationActionTypes.ts` |
| Logout | `Frontend/src/store/authStore.ts` |
| Entry | `Frontend/src/main.tsx` |

---

## P1 — Likely functional regressions

### P1-1. Push listeners registered too late

**Symptom**  
Logged-in user taps a notification while the app is killed or not yet running. Navigation to the target screen (game, chat, etc.) may not happen.

**Cause**  
`PushNotifications.addListener(...)` runs only inside `initialize()`, which runs only when `ensureTokenSentToBackend()` is called after auth bootstrap or login. Until then, no JS listeners exist for:

- `registration`
- `registrationError`
- `pushNotificationReceived`
- `pushNotificationActionPerformed`

There is no fallback such as Capacitor’s launch-notification APIs or a manual replay of the intent that opened the app.

**Call sites that trigger init (post-fix)**

- `App.tsx` — `settleStoredAuthBeforeBootstrap().finally()` when `isAuthenticated`
- `appLifecycle.service.ts` — foreground sync after auth settle
- `Login.tsx` / `Register.tsx` / `TelegramAutoLogin.tsx` — after successful auth

**Race window**  
On cold start from a notification:

1. Native delivers tap → Capacitor push plugin
2. WebView loads → `main.tsx` → React mounts → auth bootstrap runs
3. `ensureTokenSentToBackend()` → `initialize()` → listeners attached

If step 1 completes before step 3, the tap may be dropped.

**Mitigation direction**  
Split init:

- **Early (no permission):** `registerListeners()` + iOS `registerPushNotificationActionTypes()`
- **Late (post-auth):** `checkPermissions` / `requestPermissions` + `PushNotifications.register()`

Optionally handle cold-start tap via native → JS bridge or queued action until `navigationService` is ready (partial pattern already exists via `pendingNotificationTap` + `flushPendingNotificationTap()` in `App.tsx`, but only after listeners exist).

---

### P1-2. iOS notification action categories deferred until auth

**Symptom**  
On iOS, lock-screen / notification-shade actions may be missing or generic until the user has triggered push init (login or restored session bootstrap):

- Accept / Decline (game invite)
- Accept / Decline (team invite)
- Reply (chat)
- “I want to play too” (play intent)

**Cause**  
`registerPushNotificationActionTypes()` uses `@capacitor/local-notifications` `registerActionTypes()` and is called inside `initialize()`, which is deferred to post-auth.

Categories must be registered with `UNUserNotificationCenter` before notifications using those `categoryIdentifier` values are shown. Deferring until login means:

- Returning user cold-starting from a notification may see the push without custom actions until JS init completes
- Native inline reply path in `ChatReplyHandler` depends on categories being known to the system

**Relevant code**

- `Frontend/src/services/push/registerPushNotificationActionTypes.ts`
- `Frontend/ios/App/App/ChatReplyHandler.swift`
- `Frontend/ios/App/App/BandejaPushNotificationDelegate.swift`

**Mitigation direction**  
Call `registerPushNotificationActionTypes()` during early Capacitor setup (no permission required). Keep permission + FCM/APNs `register()` post-auth.

---

### P1-3. No init mutex — duplicate listener registration

**Symptom**  
Duplicate handling of the same push (double navigation, double badge refresh, duplicate token POSTs). In worst cases, unstable native/plugin state.

**Cause**  
`initialize()` guards with `isInitialized`, but that flag is set only at the **end** of a successful init. Multiple overlapping calls to `ensureTokenSentToBackend()` can all pass the guard before any completes.

**Concurrent callers**

| Source | When |
|--------|------|
| `App.tsx` bootstrap | After `settleStoredAuthBeforeBootstrap()` |
| `appLifecycle.service.ts` | App returns to foreground |
| `Login.tsx` | Multiple login paths (email, Google, Apple, etc.) |
| `Register.tsx` | After registration |
| `TelegramAutoLogin.tsx` | After auto-login |

Example timeline:

```
T0  bootstrap: ensureTokenSentToBackend() → initialize() starts
T1  foreground: ensureTokenSentToBackend() → initialize() starts (isInitialized still false)
T2  both call registerListeners() → duplicate addListener calls
```

**Mitigation direction**  
Add `initInFlight: Promise<void> | null` (same pattern as `logoutInFlight` in `authStore.ts` or `initPromise` in `socialLoginInit.service.ts`). Coalesce concurrent `initialize()` into one promise.

---

### P1-4. Partial init failure + retry stacks listeners

**Symptom**  
Push silently broken after a transient error; or duplicate handlers after recovery.

**Cause**  
`initialize()` structure:

```typescript
try {
  // registerActionTypes (iOS)
  this.notificationsAllowed = await this.resolvePushPermission();
  await this.registerListeners();   // side effect: listeners attached
  if (this.notificationsAllowed) await this.register();
  this.isInitialized = true;        // only set here
} catch (error) {
  console.error(...);               // isInitialized stays false
}
```

If `registerListeners()` succeeds and a later step throws, or if the process is interrupted:

- `isInitialized` remains `false`
- Next `ensureTokenSentToBackend()` calls `initialize()` again
- `registerListeners()` runs again → **duplicate listeners**

**Related:** `removeToken()` calls `PushNotifications.removeAllListeners()` but is **never invoked** anywhere in the codebase. Logout does not reset listener state.

**Mitigation direction**

- Track `listenersRegistered` separately; skip re-registration if already done
- On failure after listeners: set `isInitialized = true` with a degraded flag, or always `removeAllListeners()` before retry
- Wire `removeToken()` (or equivalent reset) into logout and reset `isInitialized`, `lastReceivedToken`, `lastTokenSentToBackend`, `notificationsAllowed`

---

## P2 — UX and timing

### P2-1. Permission prompt during auth bootstrap (returning users)

**Symptom**  
User with a saved session opens the app. OS notification permission dialog may appear over the loading splash before the main UI is visible.

**Cause**  
`App.tsx` calls `ensureTokenSentToBackend()` inside `settleStoredAuthBeforeBootstrap().finally()`, which runs as soon as auth state is settled — often while `holdShellForBootstrap` is still true (loading screen).

That path calls `initialize()` → `resolvePushPermission()` → `requestPermissions()` when status is `prompt`.

**Less severe than pre-fix**  
New installs no longer prompt on first cold start (fixed). This affects only users who have a stored session and have not yet answered the notification prompt.

**Mitigation direction**  
Defer permission request until after `notifyShellPainted()` / `markAppReady()`, or until user reaches home/login success screen. Still call early listener registration without prompting.

---

### P2-2. Login and register block on permission dialog

**Symptom**  
After submitting login/register, UI stays in loading state until the user responds to the system notification permission dialog.

**Cause**  
Multiple auth completion paths `await pushNotificationService.ensureTokenSentToBackend()` before calling `finishLogin()` or navigating away, e.g.:

- `Login.tsx` — `completeGoogleSession`, email login, Apple sign-in paths
- `Register.tsx` — post-registration

`ensureTokenSentToBackend()` → `initialize()` → `requestPermissions()` can await user interaction.

**Impact**  
Perceived hang; user may think login failed. Not a crash, but poor first-session UX especially combined with P2-1.

**Mitigation direction**  
Fire-and-forget push init after navigation: `void pushNotificationService.ensureTokenSentToBackend()` without blocking login completion. Ensure token sync retries on foreground (already partially done in `appLifecycle.service.ts`).

---

### P2-3. Logout does not reset in-memory push service state

**Symptom**  
After logout, push layer retains previous session assumptions. Usually masked because device token is unchanged and backend tokens are cleared server-side.

**Cause**  
`authStore.logout()`:

- Calls `pushApi.removeAllTokens()` (backend DELETE `/push/tokens`)
- Does **not** call `pushNotificationService.removeToken()`
- Does **not** reset: `isInitialized`, `notificationsAllowed`, `lastReceivedToken`, `lastTokenSentToBackend`

`removeToken()` in `pushNotificationService.ts` only removes native listeners; it is dead code (no callers).

**Scenarios**

| Scenario | Risk |
|----------|------|
| User B logs in on same device after User A | Same FCM/APNs token re-POSTed; usually OK via `POST /push/tokens` |
| User A’s notification arrives after logout, before OS clears | Handlers still active; may attempt API calls without auth |
| User denies permission, logs out, different account | `notificationsAllowed` may be stale false without re-check |

**Mitigation direction**  
Add `reset()` on logout: clear in-memory fields, optionally `removeAllListeners()` + re-run early listener setup on next login, or keep listeners and gate handlers on `isAuthenticated`.

---

## P3 — Lower risk / hygiene

### P3-1. Missing `NSUserNotificationsUsageDescription` in Info.plist

**Location**  
`Frontend/ios/App/App/Info.plist`

**Observation**  
Plist includes camera, location, calendar, microphone, etc., but no explicit notification usage string.

**Risk**  
Apple does not require a usage description for standard remote push authorization in all cases; remote push uses system dialog text. Low crash risk.

**When it matters**  
If `@capacitor/local-notifications` ever requests its own authorization separately, or App Store review tightens, adding a string avoids rejection:

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>Bandeja sends alerts for game invites, chat messages, and match updates.</string>
```

---

### P3-2. Early native badge sync before bridge ready

**Location**  
`Frontend/src/main.tsx` → `installUnreadNativeBadgeSync()` (line ~46, before `setupCapacitor()` and React render)

**Behavior**  
Immediately calls `syncAppIconBadgeFromStore()` → `setAppIconBadgeCountNative()` → Capacitor `AuthBridge` plugin.

**Risk**  
Low. `authBridge.ts` wraps the call in try/catch and logs a warning if the bridge is not ready. Unlikely to cause install crash; may noop on first tick.

**Note**  
Runs on every native launch regardless of auth; badge count comes from unread store (typically 0 for new users).

---

### P3-3. Native notification delegate layering (iOS)

**Components**

1. `AppDelegate` — `BandejaPushNotificationDelegate.shared.installEarly()` in `didFinishLaunching`
2. `BandejaPushDelegatePlugin.load()` — `attachToBridge(bridge)`
3. Capacitor `@capacitor/push-notifications` — own `notificationRouter` as `UNUserNotificationCenterDelegate`

**Behavior**  
Custom delegate forwards `willPresent` / `didReceive` to Capacitor’s router when possible; handles native chat reply when `pushReplyJsReady === false`.

**Risk**  
No direct crash evidence in current reports. Complexity increases if:

- Delegate order changes across Capacitor upgrades
- `forwardDidReceive` falls through without calling `completionHandler` in edge paths (current code calls `completionHandler()` in fallback branches)

**Watch**  
If crashes persist after P0 hotfix, capture Xcode crash logs around `UNUserNotificationCenter` / delegate callbacks.

---

### P3-4. `initializeSocialLogin()` at cold start

**Location**  
`Frontend/src/main.tsx` → `initializeSocialLogin()` (non-blocking, no await)

**Behavior**  
Initializes `@capgo/capacitor-social-login` for Google on native when `googleWebClientId` is configured.

**Risk**  
Unrelated to push crash reports. Failures are caught and logged. No change recommended unless Google login regressions appear on fresh install.

---

### P3-5. Android FCM service replacement

**Location**  
`Frontend/android/app/src/main/AndroidManifest.xml`

```xml
<service android:name="com.capacitorjs.plugins.pushnotifications.MessagingService" tools:node="remove" />
<service android:name=".push.ChatReplyMessagingService" ... />
```

**Behavior**  
Custom `ChatReplyMessagingService` extends `FirebaseMessagingService`, forwards to `PushNotificationsPlugin` when not handled natively.

**Risk**  
Low if `google-services.json` is present in release builds (gitignored; applied in CI). Without it, push registration fails gracefully (`registrationError` listener) rather than typical install crash.

---

## Summary matrix

| ID | Severity | User-visible | Fixed by cold-start patch? |
|----|----------|--------------|----------------------------|
| P1-1 | P1 | Missed notification tap on cold start | No |
| P1-2 | P1 | Missing iOS notification actions early | No |
| P1-3 | P1 | Duplicate handlers / flaky push | No |
| P1-4 | P1 | Broken or duplicated push after error | No |
| P2-1 | P2 | Prompt over splash (returning users) | Partially |
| P2-2 | P2 | Login appears stuck on permission | No |
| P2-3 | P2 | Stale state after logout | No |
| P3-1 | P3 | App Store / future local notif | N/A |
| P3-2 | P3 | None expected | N/A |
| P3-3 | P3 | Unknown without crash logs | N/A |
| P3-4 | P3 | Unrelated | N/A |
| P3-5 | P3 | Push broken in misconfigured builds | N/A |

---

## Auth flow integration (verified)

### Cold start — guest (fresh install)

1. `authStore` hydrates: no token/user → `isAuthenticated: false`, `isInitializing: true`
2. `setupCapacitor` → `await initializeEarly()` (listeners, no prompt)
3. `settleStoredAuthBeforeBootstrap` → `anonymous`
4. `finishInitializing()` → routes available (login/register)
5. No push permission, no token POST

### Cold start — returning session (valid JWT)

1. Hydrate token/user from localStorage → `isAuthenticated: true`
2. `settleStoredAuthBeforeBootstrap` → `valid`, schedule proactive refresh
3. `finishInitializing()` → `ensureTokenSentToBackend({ requestPermission: false })` (sync if OS already granted)
4. Leave loading shell → on non-auth route, one permission prompt if OS status is `prompt`
5. Foreground resume → `ensureTokenSentToBackend({ requestPermission: false })` (re-sync if enabled in Settings)

### Cold start — returning session (expired JWT, refresh OK)

1. `recoverPersistedSession` → refresh → `setToken` / `setAuth` path
2. Same push path as valid session once `finishInitializing()` completes

### Cold start — session cleared (refresh rejected / explicit logout marker)

1. `clearLocalAuth` or logout marker → local wipe + `resetForLogout()` (device token kept, backend sync state cleared)
2. Guest flow; no stale push POST for previous user

### Login / register / Telegram

1. `setAuth` → persist refresh bundle, native token sync, `isAuthenticated: true`
2. `finishLogin` / navigate (non-blocking)
3. Optional early `ensureTokenSentToBackend({ requestPermission: false })` on auth pages (sync only if already granted)
4. After navigation off `/login`, `/register`, telegram auto-login → shell effect may show **one** OS permission dialog

### Logout

1. `pushApi.removeAllTokens()` (backend)
2. `resetForLogout()` (in-memory push state; **keeps** FCM/APNs device token)
3. Revoke refresh / clear chat / native logout
4. `pushPermissionRequestedRef` reset → next login can prompt again if OS still `prompt`

### Push token POST gates

`canSyncPushTokenToBackend()` requires: authenticated, non-expired access JWT, `!isInitializing`.

### Auth ↔ push call sites

| Trigger | `requestPermission` | Prompt? |
|---------|---------------------|---------|
| `initializeEarly` (setup) | — | Never |
| Bootstrap `.finally` | `false` | Never |
| Shell ready (non-auth route) | `true` once/session | If OS `prompt` |
| Login / register / telegram | `false` | Never |
| Foreground sync | `false` | Never |

---

1. ~~**Split init**~~ — `initializeEarly()` in `setupCapacitor`; permission/register in `ensureTokenSentToBackend()`
2. ~~**`initInFlight` mutex**~~ — `earlyInitInFlight` + `registrationInFlight`
3. ~~**Idempotent listener registration + logout reset**~~ — `listenersRegistered` guard; `resetForLogout()` in `authStore.logout()`
4. ~~**Non-blocking push init after login**~~ — Login/Register fire-and-forget; App defers permission prompt until shell ready
5. ~~**Add `NSUserNotificationsUsageDescription`**~~ — `Info.plist`

---

## UI test plan

Updated row **X-37** in `docs/UI_TEST_PLAN.md`: permission prompt expected after auth, not on cold start.

Additional manual cases to add when follow-up fixes land:

| ID | Test | Expected |
|----|------|----------|
| X-37a | Cold start from push (logged in) | Tap routes correctly even if app was killed |
| X-37b | iOS actions before home paints | Invite push shows Accept/Decline on lock screen after cold start |
| X-37c | Logout → login as different user | New user receives pushes; no duplicate navigation on one tap |
