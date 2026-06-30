# Auth startup 401 fix plan

## Context

Production investigation on 2026-06-30 showed repeated 401 bursts during app startup/resume.

The backend, frontend host, nginx, PM2 process, and `/api/health` were healthy. The noisy pattern was:

1. Client starts with a saved access token from storage.
2. Several protected bootstrap requests fire immediately.
3. Those requests return 401 because the saved access token is expired or otherwise stale.
4. `/api/auth/refresh` returns 200.
5. The same requests retry and then return 200.

This means most observed 401s are recoverable stale-token startup noise, not a full auth outage. The app is doing protected work before the stored auth state has been proven usable.

## Core invariant

A token loaded from storage is not authenticated state yet. It is only a candidate credential.

Before the app lets protected bootstrap hooks, prefetches, push registration, socket work, or protected routes run, it must settle the stored credential:

- If there is no stored token, continue unauthenticated.
- If the stored token is valid for long enough, continue authenticated.
- If the stored token is expired or close to expiry, refresh it first.
- If refresh succeeds, continue authenticated with the fresh token.
- If refresh is rejected because the session is invalid, clear auth and continue unauthenticated.
- If refresh cannot complete due to temporary network failure, avoid an infinite splash and enter a bounded offline/retry state.

## Current problem shape

The frontend currently restores auth from localStorage synchronously and marks the user authenticated before the token has been checked.

Relevant areas:

- `Frontend/src/store/authStore.ts`
  - Loads saved `token` and `user`.
  - Sets `isAuthenticated: !!savedToken`.
- `Frontend/src/App.tsx`
  - Calls `restoreAuthIfNeeded()`.
  - Calls `finishInitializing()` immediately.
  - Mounts or enables bootstrap hooks after initialization.
- `Frontend/src/api/authRefresh.ts`
  - Refresh-on-401 works.
  - Proactive refresh scheduling does not refresh an already-expired token; it returns if `msUntilExp <= 0`.
- `Frontend/src/hooks/useMyTabPrefetch.ts`
  - Prefetches when `user` exists, without waiting for auth initialization to settle.
- `ReactionEmojiUsageBootstrap` and `AdPlacementsBootstrap`
  - Can start protected requests as soon as the app believes it is authenticated.

The interceptor recovers many requests, but the first wave still produces avoidable 401s and can race with loading UI, native boot splash dismissal, query retries, and route initialization.

## Target startup contract

Add one auth boot gate that runs before `finishInitializing()`.

Proposed flow:

1. Restore/preserve candidate auth from storage.
2. Read the current access token from the auth store/localStorage.
3. Classify the token:
   - `missing`
   - `valid`
   - `near_expiry`
   - `expired`
   - `invalid_shape`
4. If `valid`, schedule proactive refresh and finish initialization.
5. If `near_expiry` or `expired`, call `refreshAccessTokenSingleFlight()` before finishing initialization.
6. If refresh returns a fresh token, store it, schedule proactive refresh, and finish initialization.
7. If refresh is hard-rejected with an auth code like `auth.refreshInvalid`, `auth.refreshExpired`, `auth.userInactive`, or `auth.clientUpgradeRequired`, clear local auth and finish initialization unauthenticated.
8. If refresh times out or network is offline, finish initialization through an explicit degraded path instead of showing splash forever.

The boot gate should be bounded. It should check the token before protected work begins, but it must not block the app forever. A 4-8 second cap is reasonable because the refresh client currently has a 20 second timeout, which is too long for the startup splash.

## Implementation plan

### Phase 1: Auth boot verifier

Create a small frontend helper, for example:

- `Frontend/src/api/authStartup.ts`

Responsibilities:

- Decode access-token expiry using the existing `decodeJwtExpMs`.
- Use the same refresh singleflight as normal requests.
- Return a structured result:
  - `anonymous`
  - `valid`
  - `refreshed`
  - `cleared`
  - `degraded`
- Never throw into React startup.
- Apply a startup-specific timeout so app initialization cannot hang forever.

Important behavior:

- A malformed/undecodable token should be treated as invalid local auth and cleared.
- An expired token with no refresh credential should be cleared.
- An expired token with refresh credentials should attempt refresh before any protected fetch.
- A near-expiry token should refresh immediately rather than waiting for the first API 401.

### Phase 2: Move app initialization behind the verifier

Update `Frontend/src/App.tsx` initialization:

1. Run storage recovery helpers.
2. Initialize platform/network/lifecycle basics that do not make protected API calls.
3. Await the auth boot verifier.
4. Only then call `finishInitializing()`.
5. Only then allow bootstrap hooks and protected route trees to run.

Be careful with React effects:

- Avoid making `useEffect` itself async directly; define and call an inner async function.
- Track cancellation so late refresh results do not mutate unmounted startup state.
- Keep native/html splash dismissal bounded so this fix does not create a new "splash forever" path.

### Phase 3: Guard protected bootstrap work

Add `isInitializing`/auth-settled guards to startup fetchers.

Expected changes:

- `Frontend/src/hooks/useMyTabPrefetch.ts`
  - Do not prefetch while auth is initializing.
  - Prefer `isAuthenticated && user` over `user` alone.
- `Frontend/src/components/ReactionEmojiUsageBootstrap.tsx`
  - Do not request usage while auth is initializing.
- `Frontend/src/components/sponsorSlots/AdPlacementsBootstrap.tsx`
  - Ensure protected ad placement requests wait for auth initialization.
- Any push-token registration effect
  - Do not post `/api/push/tokens` until auth is settled.
- Any unread/chat/bootstrap query
  - Keep the existing `isInitializing || !isAuthenticated` guards.

This should reduce the initial 401 wave even if refresh is slow.

### Phase 4: Fix proactive refresh scheduling for expired tokens

Update `scheduleProactiveAccessRefresh` in `Frontend/src/api/authRefresh.ts`.

Current behavior:

- If `msUntilExp <= 0`, it returns and does nothing.

Target behavior:

- If the token is already expired or inside the refresh leeway, start `refreshAccessTokenSingleFlight()` immediately.
- If refresh succeeds, schedule the next proactive refresh for the new token.
- Respect the existing global cooldown and singleflight behavior to avoid loops.

This is a secondary safety net. The startup boot verifier is still the main fix.

### Phase 5: Hard logout and degraded startup copy

If startup refresh is hard-rejected:

- Clear token/user/refresh bundle.
- Continue to login.
- Prefer a specific reason when available:
  - session expired
  - app version too old
  - account inactive

If startup refresh cannot complete due to network:

- Do not show splash forever.
- Continue to an offline/degraded authenticated shell only if the app already has enough local state to render safely.
- Otherwise continue to login/no-internet state with retry.

The key product rule: "checking stored token first" must not become "blocking forever while checking stored token."

### Phase 6: Observability

Add lightweight logging/metrics around auth startup:

- startup token state: valid, near expiry, expired, invalid shape
- startup refresh result: success, hard reject, timeout, network error
- count of protected 401s before auth initialization completed
- refresh latency

Backend already returns structured auth codes for most relevant paths. Frontend should preserve those codes in startup logs where available.

## Test plan

### Unit tests

Add tests for the auth startup verifier:

- No token: returns anonymous and does not refresh.
- Valid token beyond leeway: returns valid and does not refresh.
- Near-expiry token: refreshes before returning.
- Expired token with valid refresh: refreshes and returns refreshed.
- Expired token with invalid refresh: clears auth and returns cleared.
- Malformed token: clears auth and returns cleared.
- Refresh promise hangs: returns degraded after startup timeout.

### Frontend integration tests

Add or update tests around app boot:

- With expired stored access token and valid refresh, no protected bootstrap request is sent before `/auth/refresh` completes.
- With expired stored access token and invalid refresh, app lands unauthenticated without protected request spam.
- `useMyTabPrefetch` does not run while `isInitializing` is true.
- Reaction emoji/ad bootstrap does not run while `isInitializing` is true.
- App does not keep `AppLoadingScreen` forever when refresh times out.

### Manual production verification

After deploy:

1. Open the app with an intentionally expired stored access token and a valid refresh session.
2. Confirm first protected request happens after successful `/api/auth/refresh`.
3. Confirm nginx no longer shows the same startup fanout of 401s for:
   - `/api/push/tokens`
   - `/api/users/profile`
   - `/api/chat/user-chats`
   - `/api/chat/unread-objects`
   - `/api/users/me/reaction-emoji-usage`
4. Confirm normal login, logout, refresh, and app resume still work.
5. Confirm invalid refresh sessions go to login without an infinite splash.

## Acceptance criteria

- A stored token is checked/refreshed before protected bootstrap work starts.
- Expired stored access tokens do not cause a fanout of startup 401s.
- Refresh-on-401 remains as a fallback, not the primary startup path.
- App startup is bounded; no auth check can hold the splash forever.
- Invalid local auth is cleared deterministically.
- Native and web refresh behavior both keep working.
- Nginx 401s for bootstrap endpoints drop significantly after deploy.

## Implementation notes

- Reuse `refreshAccessTokenSingleFlight()`; do not add a second refresh mechanism.
- Reuse `decodeJwtExpMs()`; do not decode JWTs in multiple incompatible ways.
- Keep refresh credential handling in `refreshTokenPersistence`.
- Keep access-token application through existing auth store/auth sink paths.
- Avoid firing query invalidations or push registration from inside the verifier. The verifier should only settle auth.
- Prefer an explicit `authStartupSettled` concept if `isInitializing` becomes overloaded.

## Suggested commit slices

1. Add auth startup verifier and tests.
2. Wire verifier before `finishInitializing()`.
3. Guard bootstrap/prefetch hooks.
4. Update proactive refresh to immediately handle expired/near-expiry tokens.
5. Add startup auth observability.

