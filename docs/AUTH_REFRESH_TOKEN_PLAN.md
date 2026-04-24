# Refresh token + short-lived access JWT — plan & implementation status

Plan for **short-lived access JWT + refresh token** on the current stack (Express, Prisma, `jsonwebtoken`, shared Axios `api`, Zustand `authStore`, Capacitor `authBridge`), with **backward compatibility** for older app builds until a **dated minimum-version cutoff**.

Design aligns with common OAuth 2.0 security practice (e.g. **RFC 6749** refresh semantics, **RFC 9700** BCP: rotation, transport hygiene). **Implementation is largely complete** for Phases 0–3 and **Phase 5** (issuance + **verify-time** legacy JWT rejection using the same `LEGACY_JWT_ISSUANCE_END_AT` instant); web httpOnly refresh is **done** for login/refresh/single logout, **logout-all**, and **delete session when the request’s refresh matches that row** (`clearRefreshTokenCookie` + `data.revokedCurrentWebRefresh` for client logout). Remaining gaps: see *Known gaps* and **Next steps** (e.g. metrics, step-up, password-change revoke, cross-site CSRF per §9). Sections below mark **done**, **partial**, and **next steps**.

---

## Implementation status (at a glance)


| Area                                                                                                                | Status                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma `UserRefreshSession` + migrations                                                                            | **Done**                                                                                                                                                                                                                                                                                                                                                        |
| Backend issuance, refresh, logout, sessions API                                                                     | **Done**                                                                                                                                                                                                                                                                                                                                                        |
| Frontend refresh client, 401 handling, proactive timer, multi-tab                                                   | **Done**                                                                                                                                                                                                                                                                                                                                                        |
| BroadcastChannel cross-tab sync (signal-only, no JWT on wire)                                                       | **Done** (`padelpulse-auth-v2` / `padelpulse-auth-sync-v2` in `authRefresh.ts`)                                                                                                                                                                                                                                                                                 |
| Capacitor Keychain refresh bridge                                                                                   | **Done**                                                                                                                                                                                                                                                                                                                                                        |
| Web httpOnly refresh cookie                                                                                         | **Done** (`Set-Cookie` for `X-Client-Platform: web`; body+cookie accepted on `POST /auth/refresh`; JSON omits `refreshToken` on web; `withCredentials` on web Axios; kill-switch `REFRESH_WEB_HTTPONLY_COOKIE=false` / `VITE_WEB_REFRESH_HTTPONLY_COOKIE=false`). **Cross-site SPA↔API:** tune `REFRESH_COOKIE_*` + CSRF per §9 if cookies are not first-party. |
| Metrics / alerts (§10)                                                                                              | **Not done**                                                                                                                                                                                                                                                                                                                                                    |
| Hard sunset legacy long JWT (Phase 5)                                                                               | **Done** — **Issuance:** same env + min version block new long JWTs when `REFRESH_TOKEN_ENABLED` (403 `auth.clientUpgradeRequired` on login/register). **Verify-time:** after the same calendar instant, `verifyToken` rejects bearer tokens without `typ: 'access'` when refresh is enabled (401 `auth.clientUpgradeRequired`); Socket.IO uses `verifyToken`. `AUTH_CODES_SKIP_REFRESH` includes `auth.clientUpgradeRequired` on the client.                                                                                                                          |
| Step-up on `logout-all`                                                                                             | **Not done**                                                                                                                                                                                                                                                                                                                                                    |
| End-user password change → revoke all sessions                                                                      | **Not done** (admin reset does revoke)                                                                                                                                                                                                                                                                                                                          |
| Core middleware `401` + `code`; client skip-refresh set; broadcast refresh signal; proactive near-exp               | **Done**                                                                                                                                                                                                                                                                                                                                                        |
| Chat + game read + workout `401` + `code`; phone login / link-auth codes; worker `401` w/o body only if Bearer sent | **Done**                                                                                                                                                                                                                                                                                                                                                        |
| Web httpOnly **cookie lifecycle** on full / targeted revoke                                                         | **Done** — `POST /auth/logout` and `**POST /auth/logout-all`** append `Set-Cookie` to clear the refresh cookie when `shouldUseWebRefreshHttpOnlyCookie`; `**DELETE /auth/sessions/:id**` clears the cookie when the cookie/body refresh matches the revoked row; `**SessionsPage**` calls `logout` + `/login` when `data.revokedCurrentWebRefresh` is true.     |


---

## Known gaps (current codebase)

- `**X-Client-Platform**`: server cookie path requires `web` (`Backend/src/utils/clientVersion.ts`); missing/`unknown` falls back to JSON `refreshToken` + optional `localStorage` on web if `VITE_WEB_REFRESH_HTTPONLY_COOKIE=false` or if the client persists body refresh — callers of `/auth/refresh` must send the same platform header as the main app.
- **Flags in sync**: pair `**REFRESH_WEB_HTTPONLY_COOKIE`** (backend) with `**VITE_WEB_REFRESH_HTTPONLY_COOKIE**` (frontend) on deploy; mismatch yields confusing refresh failures.
- **BroadcastChannel (residual)**: Cross-tab messages carry **no** access or refresh token; peers run `refreshAccessTokenSingleFlight` after `persistRefreshBundle` / cookie rotation on the leader tab. Same-origin code could still **spam refresh signals** (extra `/auth/refresh` traffic); mitigated with a per-tab cooldown and existing `auth.refreshInvalid` retry. Optional later: asymmetric JWT verify-on-listen, or server round-trip, if stricter attestation is required.
- **Cross-site SPA ↔ API**: if the refresh cookie is sent cross-site, validate cookie attributes and add a **CSRF-safe** refresh pattern (§9); not closed generically in code — depends on hosting.
- **Legacy issuance + verify sunset (defaults)**: `MIN_CLIENT_VERSION_FOR_REFRESH` defaults to **`0.94.1`**; `LEGACY_JWT_ISSUANCE_END_AT` defaults to **`2026-05-15T00:00:00.000Z`** when unset (override with ISO env) and gates **both** issuance (sub-min clients) **and** verify-time rejection of legacy bearer JWTs. Set `LEGACY_JWT_ISSUANCE_END_AT=off` (or `false` / `none` / `disabled`) to disable the calendar for both; `REFRESH_TOKEN_ENABLED=false` disables verify-time rejection and issuance sunset block. Invalid ISO → no sunset (verify + issuance calendar off).

---

## Next steps (prioritized)

1. **Observability** — Metrics for refresh success/failure, p95 refresh latency, optional `auth.refreshReused` if reintroduced for true compromise paths (§10).
2. **Product** — User-editable `deviceLabel` API; optional max sessions; **logout-all** step-up; in-app copy for forced logout reasons; end-user password change revoking all refresh sessions.
3. **Coverage** — Optional further `401` + `code` on remaining controllers; Socket.IO still returns generic auth error on failure (no structured `code` on handshake).
4. **Cross-site cookie polish** — If the SPA and API are not same-site, validate `REFRESH_COOKIE_DOMAIN` / `SameSite=None` + `Secure` and add a CSRF-safe refresh flow (double-submit or BFF) per hosting layout (§9).

---

## Fully implemented (mapped to plan)

### Objectives (§1)

- **Proactive refresh** + **refresh-on-401** with a **single shared promise** and **retry original request once** (`Frontend/src/api/authRefresh.ts`; shared Axios instance + `withCredentials` in `Frontend/src/api/httpClient.ts`; interceptors in `Frontend/src/api/axios.ts`).
- **Shorter access JWT** for opted-in clients via `JWT_ACCESS_EXPIRES_IN` / `jwtAccessExpiresIn`; refresh lifetime via `REFRESH_TOKEN_EXPIRES_IN` (`Backend/src/config/env.ts`, `Backend/src/utils/jwt.ts`). Refresh TTL is effectively **renewed on each successful refresh** (new row + new `expiresAt`).
- **Legacy compatibility**: same `data.token`; additive `refreshToken`, `currentSessionId`; version + flag gating (`Backend/src/services/auth/authIssuance.service.ts`, `Backend/src/utils/clientVersion.ts`).
- **Revocation / multi-device**: one row per session; list + per-session delete + logout-all (`Backend/src/services/auth/userRefreshSession.service.ts`, `Backend/src/controllers/authRefresh.controller.ts`, `Frontend/src/pages/SessionsPage.tsx`).
- **Capacitor**: refresh in Keychain via `AuthBridge` (`Frontend/src/services/authBridge.ts`, `Frontend/ios/App/App/AuthBridgePlugin.swift`).
- **Sessions UI**: devices / last active (`SessionsPage.tsx` + i18n profile keys).

### Data model (§2)

- `**UserRefreshSession`** in Prisma with `tokenHash` (unique SHA-256), `expiresAt`, `createdAt`, `lastUsedAt`, `deviceLabel`, `platform`, `userAgent`, `deviceId`, `ip`, `revokedAt`, `replacedBySessionId`, `**rotationFamilyId**` (`Backend/prisma/schema.prisma`).
- **Only hashes** stored; opaque refresh **32 bytes base64url** (`Backend/src/utils/refreshTokenCrypto.ts`).
- **Rotation**: successful refresh creates a new row, revokes old with `replacedBySessionId`.
- **Reuse policy (implemented, UX-oriented):** reuse of an **already-rotated** refresh returns `**auth.refreshInvalid`** and does **not** revoke the entire rotation family (avoids multi-tab “logout everyone”). Stricter “reuse = revoke family” is **not** the current server policy.

### Backend — issuance (§3)

- `**generateShortAccessToken`**: `typ: 'access'`, `iss`, `aud`, `ver`, `jti`; `**generateLegacyAccessToken**` for legacy path (`Backend/src/utils/jwt.ts`).
- `**verifyToken**`: enforces `aud`/`iss` only when `typ === 'access'`; when `REFRESH_TOKEN_ENABLED` and `now >= legacyJwtIssuanceEndAt`, throws `**LegacyJwtVerifyRejectedError**` for tokens without `typ: 'access'` (same instant as issuance sunset; `off` / invalid ISO disables) (`Backend/src/utils/jwt.ts`).
- `**issueLoginTokens**`: short access + refresh when `REFRESH_TOKEN_ENABLED` and client version ≥ min; else long-lived JWT **unless** issuance sunset blocks it (`Backend/src/services/auth/authIssuance.service.ts`).
- **Phase 5 (issuance)**: `**assertLoginIssuanceAllowed**` + `**legacyJwtIssuanceEndAt**` — when refresh is enabled, sunset instant has passed, and `X-Client-Version` is below min (or missing), login/register **does not** return a long JWT; responds **403** with `message` / `code` `**auth.clientUpgradeRequired**`, `minClientVersion`, optional `legacyJwtIssuanceEndedAt`. **Register** paths call assert **before** `user.create` (phone, Telegram, OAuth after ID-token verify); Telegram OTP completion asserts at start of `completeTelegramAuth`.
- **Login surfaces** pass through issuance (phone, OAuth, Telegram controllers / services as wired in repo).

### Backend — endpoints (§4)

- `**POST /auth/refresh`** — body `refreshToken` **or** httpOnly cookie (web); returns `token`, `user`, `currentSessionId`; `**refreshToken` omitted from JSON on web** when httpOnly cookie is used; sets rotated refresh via `Set-Cookie` (`authRefresh.controller.ts`, `refreshWebCookie.ts`, `auth.routes.ts`).
- `**POST /auth/logout`** — optional body refresh **or** cookie → revoke; clears refresh cookie (`revokeByRawToken`, `clearRefreshTokenCookie`).
- `**POST /auth/logout-all`** — authenticated, revokes all sessions in DB (no step-up); on web httpOnly mode appends `**Set-Cookie**` to clear the refresh cookie (`clearRefreshTokenCookie`).
- `**GET /auth/sessions**`, `**DELETE /auth/sessions/:id**` — implemented under `/auth` routes; **delete** clears the refresh cookie when the request’s refresh (cookie or body) matches the revoked row; response `**data.revokedCurrentWebRefresh`** is always a **boolean** (`SessionsPage` runs `logout` + `/login` when `true`).
- **Stable codes**: refresh path `auth.refreshInvalid`, `auth.refreshExpired`, `auth.refreshReused` (client still handles reuse; server mainly emits invalid/expired on refresh); JWT middleware `auth.accessExpired`, `auth.invalidToken`; core auth `auth.noToken`, `auth.userNotFound`, `auth.userInactive`, `auth.notAuthenticated`; high-volume handlers `auth.notAuthenticated` (ex-`Unauthorized`); phone/link `auth.invalidCredentials`, `auth.phoneLoginRequiresOAuth`, `auth.userNotFound` where applicable; `**auth.clientUpgradeRequired**` on **403** login/register (issuance sunset) and on **401** bearer when verify-time legacy rejection applies (same payload fields: `minClientVersion`, optional `legacyJwtIssuanceEndedAt`).
- **Rate limit**: dedicated limiter on `**POST /auth/refresh`** (`auth.routes.ts`). **Stricter per-route limits on login** are not implemented beyond global `/api/` limiter.

### Backend — middleware (§5)

- **Bearer-only** access; legacy tokens without `typ` skip `aud`/`iss` strict check until verify-time sunset; `**LegacyJwtVerifyRejectedError**` → **401** `auth.clientUpgradeRequired` (`Backend/src/middleware/auth.ts`).
- `**authenticate` / `requireAdmin` / `requireCanModifyResults` / `requireGamePermission`**: `401` responses include `**code**`: `auth.noToken`, `auth.userNotFound`, `auth.userInactive`, `auth.notAuthenticated` where applicable (alongside existing JWT codes).
- **High-volume APIs**: `chat.controller.ts`, `game/read.service.ts`, `workoutSessions.controller.ts` use `auth.notAuthenticated` on prior `Unauthorized` paths; `auth.controller.ts` adds `code` on phone login / link flows (`auth.invalidCredentials`, `auth.phoneLoginRequiresOAuth`, `auth.userNotFound`, `auth.notAuthenticated`).

### Frontend — storage & transport (§6)

- `**X-Client-Version`** and `**X-Client-Platform**` on main `api` and refresh axios (`Frontend/src/api/axios.ts`, `Frontend/src/api/authRefresh.ts`).
- **Refresh persistence**: native Keychain on iOS/Android; **web**: httpOnly cookie (no `refreshToken` in JSON); legacy body + `localStorage` only if `VITE_WEB_REFRESH_HTTPONLY_COOKIE=false` (`refreshTokenPersistence.ts`, `httpClient.ts`, `authRefresh.ts`).
- **Access token**: still read from `**localStorage`** in Axios interceptor (acceptable legacy path per plan; not in-memory-only).
- **Multi-tab**: `**BroadcastChannel`** `padelpulse-auth-v2` after successful refresh posts `**padelpulse-auth-sync-v2**` (`sourceId` per tab + optional `currentSessionId`); **no** access or refresh token on the wire. Other tabs call `**refreshAccessTokenSingleFlight`** (shared cookie / already-updated `localStorage` refresh from the leader) and reschedule proactive refresh on success. Sender ignores its own `sourceId` (channel also delivers to the posting context). `**ensureAuthBroadcastListener**` from `App.tsx` (`authRefresh.ts`).

### Frontend — Axios & timers (§7)

- **Proactive**: `scheduleProactiveAccessRefresh` / `clearProactiveAccessRefresh`; leeway from `VITE_ACCESS_REFRESH_LEEWAY_MS` (default 120s); timer uses `**refreshAccessTokenSingleFlight`** (no parallel `runRefresh` from timer alone).
- **401 interceptor**: refresh before `handleApiUnauthorizedIfNeeded` when a refresh path exists (stored refresh **or** web cookie mode) and response is auth-like; `**auth.refreshInvalid`**: reset single-flight, short delay, retry refresh; **internal second attempt** inside `runRefresh` after invalid; **one retry** of failed request via `WeakSet` on config (`authRefresh.ts`). `**AUTH_CODES_SKIP_REFRESH`** → clear + logout **without** refresh: `auth.noToken`, `auth.userNotFound`, `auth.userInactive`, `auth.notAuthenticated`, `auth.invalidCredentials`, `auth.phoneLoginRequiresOAuth`. `**code === undefined`** on Axios: refresh only if the failed request sent `**Bearer**` (`requestHadBearer`).
- **Broadcast listener**: handles **signal-only** sync — optional `persistSessionIdOnly` when `currentSessionId` is present, then `**refreshAccessTokenSingleFlight`** + proactive schedule; per-tab cooldown limits signal spam (`authRefresh.ts`, `refreshTokenPersistence.ts`).
- **Proactive timer**: if access expires within **leeway + 3s**, refresh **immediately**; else delay `max(2s, exp − now − leeway)` (no fixed **10s** floor that could fire after `exp`).
- **Non-Axios**: `**fetchChatSyncEventsPackOffMainThread`** — respects `**AUTH_CODES_SKIP_REFRESH**` on worker 401 JSON; for `**code === undefined**`, refresh only if the **first** worker request had `**Authorization: Bearer`** (`hadBearerOnRequest`); auth-like codes (incl. `auth.refreshInvalid`) → `refreshAccessTokenSingleFlight` + one retry with rebuilt headers (`Frontend/src/services/chat/chatSyncFetchWorkerClient.ts`).

### Logout & lifecycle (§8)

- **Logout**: server revoke + client clear + push cleanup (`Frontend/src/store/authStore.ts`).
- **Admin password reset**: revokes all refresh sessions for user (`Backend/src/services/admin/users.service.ts`).
- `**isActive: false`**: DB check on authenticate.

### Architecture fixes (not in original plan table)

- `**authAccessSink**`: breaks `authRefresh` ↔ `authStore` circular import (`Frontend/src/store/authAccessSink.ts`).
- `**authStore**`: dynamic `import()` of `chatSyncBatchWarm` to break `authStore` → `playersStore` init cycle.

### Environment (§13)

- Wired: `JWT_ACCESS_EXPIRES_IN`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `MIN_CLIENT_VERSION_FOR_REFRESH`, `LEGACY_JWT_ISSUANCE_END_AT`, `REFRESH_TOKEN_ENABLED`, `ACCESS_REFRESH_LEEWAY_SECONDS`, `JWT_ISS` / `JWT_AUD` (`Backend/src/config/env.ts`).
- Web refresh cookie: `REFRESH_WEB_HTTPONLY_COOKIE`, `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_PATH`, `REFRESH_COOKIE_DOMAIN`, `REFRESH_COOKIE_SAME_SITE`, `REFRESH_COOKIE_SECURE` (backend); frontend opt-out `VITE_WEB_REFRESH_HTTPONLY_COOKIE=false`.

---

## 1. Objectives


| Goal                                            | Approach                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users rarely kicked out when access JWT expires | **Proactive refresh** before `exp` (quiet window) + **refresh-on-401** (single shared promise, retry original request) so most calls never see expiry 401s                                                                                     |
| Shorter access token for security               | e.g. **15m–1h** access; **7–90d** refresh (product choice); define **sliding vs absolute** refresh expiry                                                                                                                                      |
| Old frontends keep working (time-boxed)         | Same `**data.token`** contract; **additive** fields; **versioned login** or long token for unknown clients; **hard sunset** (max app age + server cutoff), not only analytics                                                                  |
| Revocation / multi-device                       | **One DB row = one session**; list/revoke one session or all; optional rotation **family** vs global revoke on reuse (policy)                                                                                                                  |
| Web + Capacitor                                 | **Preferred:** refresh **httpOnly** (web) / Keychain (native); access in **memory** where feasible, else **secure storage** / existing bridge — `**localStorage` only if explicitly accepted** as residual XSS tradeoff with CSP and short TTL |
| Users feel “secure”, not “randomly logged out”  | Settings **Sessions** UI (devices, last active); **specific copy** on forced logout (reuse, revoke-all, password change); optional **idle prompt** separate from JWT expiry                                                                    |


---

## 2. Data model (Prisma)

Add a model such as `**UserRefreshSession`** (name illustrative):

- `id` (cuid)
- `userId` (FK → `User`)
- `tokenHash` — SHA-256 of opaque refresh token (**unique**)
- `expiresAt` (and policy: **absolute** max lifetime vs **sliding** extension on use)
- `createdAt`, `lastUsedAt`
- **Session identity (product-facing):** `deviceLabel` (user-editable), `platform` (`web` / `ios` / `android` / …), optional `userAgent`, `deviceId`, `ip` (approx; for “last seen from …”)
- **Lifecycle:** `revokedAt`, `replacedBySessionId` (rotation chain / family)

**Rules**

- Store **only hashes** of refresh tokens (never raw tokens in DB).
- **Rotation:** each successful refresh invalidates the old row (or marks replaced) and issues a new refresh; **reuse** of an already-replaced refresh → `**auth.refreshInvalid`** (current product policy: **do not** revoke entire rotation family — favors multi-tab UX over strict global reuse revocation).
- **Concurrent refresh race:** one tab wins rotation; others may get `auth.refreshInvalid`; client **resets single-flight**, **waits**, **re-reads** refresh (updated cookie / `localStorage` after peer signal or retry), **retries** (`runRefresh` second attempt + `handleAxios401MaybeRefresh`).

---

## 3. Backend — token issuance

### 3.1 Access JWT

- New env: `JWT_ACCESS_EXPIRES_IN` (e.g. `15m`).
- Claims: at least `**sub`** (= `userId`), `**exp**`, `**iat**`; add `**iss**`, `**aud**`, `**typ: 'access'**`, `**ver**`, optional `**jti**` for traceability / future revocation lists on sensitive surfaces.
- All login/register responses that today return `**data.token**` should return the **access** JWT in `**data.token`** for clients that opt into the new flow.

### 3.2 Refresh token

- Opaque random string (32+ bytes), base64url.
- Persist **hash** + `expiresAt` + `userId` + session metadata fields.
- Return the raw refresh token **once** in the login/refresh response **and/or** `**Set-Cookie`** on web (`X-Client-Platform: web`, `refreshWebCookie.ts`). Do not put refresh material inside the access JWT.

### 3.3 Backward compatibility (time-boxed)

Pick one or combine:

**A — Client version header (recommended)**  

- App sends e.g. `X-Client-Version: <semver or build>` on login (Capacitor: `getAppInfo()`; web: build constant from CI).
- **Version ≥ cutoff** → short access JWT in `data.token` + `data.refreshToken` (and optional cookie).
- **Missing or version < cutoff** → long-lived JWT in `data.token`, **omit** `refreshToken`, **only if** issuance sunset is not active (calendar not yet reached, disabled via env `off` / invalid ISO / null, or `REFRESH_TOKEN_ENABLED=false`). After sunset with refresh enabled → **403** `auth.clientUpgradeRequired` (no token).

**B — Feature flag**  

- e.g. `REFRESH_TOKEN_ENABLED=true` combined with version check for staged rollout.

**C — Deprecation timeline**  

1. New clients: short access + refresh.
2. Old clients: long `token` only until **minimum supported version** + agreed calendar date.
3. **Implemented (issuance + verify):** After the configured end instant (default **2026-05-15** UTC; override with env), with `REFRESH_TOKEN_ENABLED`, clients below the min version (default **0.94.1**; or missing `X-Client-Version`) receive **403** `auth.clientUpgradeRequired` instead of a long JWT. **Verify-time:** any bearer JWT without `typ: 'access'` is rejected with **401** `auth.clientUpgradeRequired` after the same instant (until `LEGACY_JWT_ISSUANCE_END_AT` disabled or `REFRESH_TOKEN_ENABLED=false`).

---

## 4. Backend — endpoints


| Endpoint                                             | Role                                                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/refresh`                                 | Body `{ refreshToken }` and/or **httpOnly** cookie; returns `{ token, user? }` (+ `currentSessionId`). On **web** cookie mode: rotated refresh via `**Set-Cookie`** only (omit `refreshToken` from JSON). |
| `POST /auth/logout`                                  | Revoke **current** refresh session (body or cookie); `**Set-Cookie`** clears the refresh cookie on web.                                                                                                   |
| `POST /auth/logout-all`                              | Revoke **all** refresh sessions in DB (prefer **step-up** / re-auth). Clears this browser’s httpOnly refresh cookie when web cookie mode applies.                                                         |
| `GET /auth/sessions` (or under `/users/me/sessions`) | List active sessions (metadata only; never return refresh).                                                                                                                                               |
| `DELETE /auth/sessions/:id`                          | Revoke a single session; clears httpOnly refresh cookie when the request refresh matches that session; JSON `**data.revokedCurrentWebRefresh`** (`boolean`, always present).                              |


**Refresh handler (outline)**

1. Resolve refresh from body or cookie; if cookie-based on cross-site or non-`SameSite=Strict` setups, enforce **CSRF** (e.g. double-submit cookie or custom header) on `POST /auth/refresh` per your hosting layout.
2. Hash → lookup row; validate `expiresAt`, not revoked.
3. Load user; require `isActive`.
4. Mint new **access** JWT; if rotating, mint new refresh, persist new hash, mark old session revoked/replaced.
5. Response shape matches login: `{ success, data: { token, user?, refreshToken?, currentSessionId? } }` — on web cookie mode, `refreshToken` is omitted and rotation is `**Set-Cookie`** only.

**Cookie contract (web)**  
When using `Set-Cookie` for refresh: specify `**Path`**, `**Domain**`, `**HttpOnly**`, `**Secure**`, `**SameSite**` explicitly for your SPA origin ↔ API origin layout. Same-site SPAs often use `Lax` or `Strict` + correct path; cross-site may need **token refresh via BFF** or body + tightened CSP instead of naive third-party cookies.

**Stable error codes** (for client): e.g. `auth.refreshInvalid`, `auth.refreshExpired`, `auth.refreshReused`.

**Rate limiting**  
Stricter limits on `/auth/refresh` and `/auth/login` than generic APIs; optional backoff on repeated failures (abuse / buggy clients).

---

## 5. Backend — middleware

- `**authenticate` / `requireAdmin`**: unchanged — `**Authorization: Bearer <access_jwt>**` only.
- Validate `**aud` / `iss**` (and optionally `typ`) for new tokens; accept legacy long-lived tokens without those claims until the **same** `LEGACY_JWT_ISSUANCE_END_AT` verify cutoff (with `REFRESH_TOKEN_ENABLED`) ends acceptance at `verifyToken`.
- **401 semantics:** distinguish **invalid/expired credential** (code in body or `WWW-Authenticate: Bearer error="invalid_token"`) from **authenticated but forbidden** on a resource, so clients do not mis-trigger refresh for non-auth 401s if you use 401 for both today — prefer **403** for authorization failures where possible.

---

## 6. Frontend — storage & transport

### 6.1 Access token

- **Preferred:** keep access **in memory** (module singleton) + hydrate after navigation if needed via one silent refresh; Capacitor: supply bearer via **Keychain** through `authBridge` if you extend it for access reads.
- **Acceptable legacy:** `localStorage` + Axios `Authorization: Bearer` where bridge and bundle still require it — pair with **short access TTL**, **strict CSP**, and **no refresh token in JS** on web when using httpOnly cookie.

### 6.2 Refresh token

**Web**  

- Prefer **httpOnly, Secure, SameSite** cookie set by login/refresh responses, scoped to API cookie path/host.  
- If API is on another origin and cookies are impractical: **BFF** that holds refresh server-side, or refresh in **memory** + body to `/auth/refresh` (weaker to XSS than httpOnly; mitigate with CSP and short access TTL).

**Capacitor**  

- Extend `**authBridge`**: `setRefreshToken` / `getRefreshToken` / `clearRefreshToken` using Keychain / encrypted prefs.  
- On login: if `refreshToken` present, persist natively.

### 6.3 Client version header

- Axios **request** interceptor: set `X-Client-Version` from native `getAppInfo()` or web build id so backend can branch issuance.

### 6.4 Multi-tab sync (required on web)

- After a successful refresh, **broadcast** a **“session refreshed”** signal (implemented: no JWT on the channel) via `**BroadcastChannel`** so other tabs call `**/auth/refresh**` with the **already-rotated** cookie / persisted refresh material from the leader tab—avoiding trust in cross-tab access-token strings.
- **Single-flight** refresh is **per browsing context**; cross-tab races may still produce parallel refresh requests briefly; client **retry after `auth.refreshInvalid`** aligns tabs with server rotation.

---

## 7. Frontend — Axios and timers (single place; no per-feature refactors)

### 7.1 Proactive refresh

- Parse access `**exp**` (JWT payload) after login/refresh; schedule a **timer** to call `/auth/refresh` in a **quiet window** before expiry (e.g. 1–5 minutes, tunable), with small **clock-skew** leeway.
- Cancel/reschedule on each successful login or refresh.
- Goal: **most API traffic never hits 401** due to expiry.

### 7.2 Reactive refresh (401)

1. **Response interceptor** on **401**:
  - If the failed request URL is `**/auth/refresh`** → do not retry; logout path (unless tab sync provides a new refresh — see §6.4).
  - If **no refresh** stored (old client or server omitted refresh) → existing `handleApiUnauthorizedIfNeeded()` behavior.
  - Else: **single shared promise** — all concurrent 401s **await the same** refresh; queue retries after it settles.
  - Success: update access token (`authStore.setToken` / `setAuth` + chosen storage), **retry** the failed request with new `Authorization`.
  - Failure: clear refresh, logout, user-visible reason where possible (`auth.refreshReused` vs expired).
2. **Order with `handleApiUnauthorizedIfNeeded`**
  Run global logout **only after** refresh fails (or when there is no refresh path). “401 → immediate logout” must not run before the refresh attempt for new clients.
3. **401 vs permission**
  Only enter refresh flow when the response indicates **invalid/expired session**, not generic “not allowed” if those share status codes.
4. **Login / `setAuth`**
  If response includes `refreshToken`, persist per platform; on web with httpOnly cookie, `refreshToken` may be absent — persist `currentSessionId` only (`authStore` + `refreshTokenPersistence`); set access `token` per storage strategy in §6.1.
5. **Non-Axios HTTP**
  Grep for raw `fetch`, WebSocket auth, workers; route through shared client or inject token after the same refresh promise completes.

---

## 8. Logout & account lifecycle

- **Logout** (`POST /auth/logout`): revoke current refresh session server-side; clear httpOnly cookie on web; clear access + refresh client-side; keep existing push token cleanup.
- **Logout-all** (`POST /auth/logout-all`): revokes all DB rows and clears this browser’s httpOnly refresh cookie when web cookie mode applies; the app currently calls this only from `**SessionsPage`**, which then clears local auth and navigates to `**/login**` — any future caller should do the same after a successful response.
- **Password change (end-user)**: **not implemented** yet (admin password reset does revoke sessions). When added: revoke all `UserRefreshSession` rows for `userId`, clear **web** refresh cookie for this browser, surface clear **in-app copy**.
- `**isActive: false`**: refresh and access paths should both fail; `authenticate` already reloads user from DB.
- **Optional max sessions:** on new login, drop **oldest** or **deny** new session — product choice; document in API errors.

---

## 9. Security checklist

- HTTPS only; **Secure** cookies; **SameSite** / **Domain** / **Path** chosen for your deployment.
- **CSRF** on cookie-authenticated `POST /auth/refresh` when cookies could be sent in unsafe cross-site scenarios.
- Hash refresh tokens at rest; never log raw refresh or access tokens.
- Short access TTL; monitor **reuse** of rotated refresh tokens (alert on spikes).
- Rate-limit refresh and login; optional bind session to **device id** from the app.
- **CSP** and minimal inline script if access ever touches web storage.

**Optional later hardening**  
Sender-constrained tokens (**DPoP**, **mTLS**) where platform and infra allow; **step-up re-auth** for high-risk actions instead of shortening access alone.

---

## 10. Observability

- Metrics: refresh success/failure rate, `auth.refreshReused` count, sessions per user, p95 refresh latency, 401 rate **before** vs **after** proactive refresh.
- Logs: never include token values; correlate by `userId` / `sessionId` / `jti` only.
- Alerts: sudden reuse spikes (possible theft or client bug).

---

## 11. Rollout phases


| Phase | Deliverable                                                                                                                                                 | Status                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Prisma model + migration; crypto hash helper; sign-off on TTLs, cookie domain, rotation/reuse policy, CSRF approach.                                        | **Done** (rotation without family revoke on reused rotated token; **web** uses httpOnly cookie + no refresh in JSON; cross-site CSRF left to ops) |
| **1** | Backend: versioned login issuance; `POST /auth/refresh`; logout revokes session; session list/revoke endpoints.                                             | **Done**                                                                                                                                          |
| **2** | Frontend: version header + refresh persistence + **proactive** timer + **single shared refresh promise** + **multi-tab** sync + fix 401 vs logout ordering. | **Done**                                                                                                                                          |
| **3** | Capacitor bridge for refresh; ship app version that sends `X-Client-Version`.                                                                               | **Done** (bridge + headers)                                                                                                                       |
| **4** | Monitor metrics in §10; tune `JWT_ACCESS_EXPIRES_IN` and proactive window.                                                                                  | **Partial** (tuning via env possible; metrics pipeline **not** wired)                                                                             |
| **5** | Enforce minimum client version + calendar; remove long-only **issuance** branch for sub-min clients after sunset; verify-time legacy JWT rejection.     | **Done** (issuance + verify; `jwt.ts`, `auth.ts`, sockets, `AUTH_CODES_SKIP_REFRESH`)                                                                |


---

## 12. Edge cases & split clients

- **Admin app:** separate bundle — same refresh API + version header preferred; avoid long-lived admin-only tokens long term.
- **WebView / SSO:** document cookie behavior for embedded browsers if applicable.

---

## 13. Environment variables (suggested)


| Variable                                                                                                                   | Purpose                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `JWT_ACCESS_EXPIRES_IN`                                                                                                    | Access JWT TTL for new clients                                             |
| `JWT_EXPIRES_IN` (existing)                                                                                                | Long JWT for legacy clients when version below cutoff                      |
| `REFRESH_TOKEN_EXPIRES_IN`                                                                                                 | Refresh session lifetime                                                   |
| `MIN_CLIENT_VERSION_FOR_REFRESH` (or derive from header)                                                                   | Server branch for issuance; **default `0.94.1`** in code if unset          |
| `LEGACY_JWT_ISSUANCE_END_AT`                                                                                               | ISO 8601 instant; **default `2026-05-15T00:00:00.000Z`** if unset. `off` / `false` / `none` / `disabled` disables calendar. After cutoff + refresh on: sub-min / missing `X-Client-Version` → **403** `auth.clientUpgradeRequired` on login/register; **any** legacy bearer (no `typ: 'access'`) → **401** `auth.clientUpgradeRequired` via `verifyToken` |
| `REFRESH_TOKEN_ENABLED`                                                                                                    | Kill-switch for rollout; when `false`, issuance sunset and **verify-time** legacy rejection are disabled (legacy JWT issuance and bearer acceptance allowed) |
| `ACCESS_REFRESH_LEEWAY_SECONDS` (optional)                                                                                 | Proactive refresh window + clock skew                                      |
| `JWT_ISS` / `JWT_AUD`                                                                                                      | Issuer / audience for short access JWTs                                    |
| `VITE_ACCESS_REFRESH_LEEWAY_MS`                                                                                            | Frontend proactive window (ms)                                             |
| `REFRESH_WEB_HTTPONLY_COOKIE`                                                                                              | Backend: `false` disables web httpOnly cookie + JSON omission (default on) |
| `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_PATH`, `REFRESH_COOKIE_DOMAIN`, `REFRESH_COOKIE_SAME_SITE`, `REFRESH_COOKIE_SECURE` | Cookie attributes for web refresh                                          |
| `VITE_WEB_REFRESH_HTTPONLY_COOKIE`                                                                                         | Frontend: `false` forces legacy body + `localStorage` refresh on web       |


---

## 14. Code map (implementation)


| Concern                                                                | Location                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh session CRUD, rotation, list, “refresh matches session” helper | `Backend/src/services/auth/userRefreshSession.service.ts` (`activeUserRefreshMatchesSessionId`)                                                         |
| Issuance gate + Phase 5 sunset assert                                  | `Backend/src/services/auth/authIssuance.service.ts` (`issueLoginTokens`, `assertLoginIssuanceAllowed`; used from `auth.controller`, `oauthLogin.service`, `telegramAuth.controller`) |
| Login/register upgrade-required UX (i18n `{{minVersion}}`)               | `Frontend/src/utils/extractApiErrorMessage.ts`; `Frontend/src/i18n/locales/*/auth.json` (`auth.clientUpgradeRequired`)                                   |
| Refresh / logout / sessions HTTP                                       | `Backend/src/controllers/authRefresh.controller.ts`, `Backend/src/routes/auth.routes.ts`                                                                |
| JWT sign/verify + Phase 5 verify-time legacy reject                     | `Backend/src/utils/jwt.ts` (`LegacyJwtVerifyRejectedError`, `verifyToken`); `Backend/src/middleware/auth.ts`; `Backend/src/services/socket.service.ts` |
| Client version / platform                                              | `Backend/src/utils/clientVersion.ts`                                                                                                                    |
| Env defaults                                                           | `Backend/src/config/env.ts`                                                                                                                             |
| Auth middleware                                                        | `Backend/src/middleware/auth.ts`                                                                                                                        |
| Chat / game / workout `401` + `code`                                   | `Backend/src/controllers/chat.controller.ts`, `Backend/src/services/game/read.service.ts`, `Backend/src/controllers/user/workoutSessions.controller.ts` |
| Phone / link auth `401` + `code`                                       | `Backend/src/controllers/auth.controller.ts`                                                                                                            |
| Refresh + proactive + 401 + Broadcast (signal-only v2)                 | `Frontend/src/api/authRefresh.ts`                                                                                                                       |
| Axios + 401 hook + `withCredentials` (web)                             | `Frontend/src/api/axios.ts`, `Frontend/src/api/httpClient.ts`                                                                                           |
| Web refresh `Set-Cookie` / read cookie                                 | `Backend/src/utils/refreshWebCookie.ts`                                                                                                                 |
| Logout routing                                                         | `Frontend/src/api/handleApiUnauthorized.ts`                                                                                                             |
| Auth store + dynamic warm import                                       | `Frontend/src/store/authStore.ts`                                                                                                                       |
| Avoid `authRefresh` ↔ `authStore` cycle                                | `Frontend/src/store/authAccessSink.ts`                                                                                                                  |
| Refresh persistence; optional `persistSessionIdOnly` on broadcast      | `Frontend/src/services/refreshTokenPersistence.ts`                                                                                                      |
| Native bridge                                                          | `Frontend/src/services/authBridge.ts`, `Frontend/ios/App/App/AuthBridgePlugin.swift`                                                                    |
| Worker fetch + refresh retry                                           | `Frontend/src/services/chat/chatSyncFetchWorkerClient.ts`                                                                                               |
| Sessions API client (list / revoke / logout-all)                       | `Frontend/src/api/auth.ts`                                                                                                                              |
| Sessions UI                                                            | `Frontend/src/pages/SessionsPage.tsx`                                                                                                                   |
| Client semver for header                                               | `Frontend/src/utils/clientAppVersion.ts`                                                                                                                |


