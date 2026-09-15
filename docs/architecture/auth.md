# Auth

Code: `Backend/src/config/jwtAuthConfig.ts`, `Backend/src/utils/jwt.ts`, `Backend/src/middleware/auth.ts`, `Backend/src/middleware/authToken.ts`, `Backend/src/routes/auth.routes.ts`, `Backend/src/routes/telegramAuth.routes.ts`, `Backend/src/services/auth/`, `Frontend/src/api/authRefresh.ts`, `Frontend/src/services/refreshTokenPersistence.ts`.

Env: `Backend/env.sample` Auth section. Production boot calls `assertProductionJwtAuthConfig` from `Backend/src/config/env.ts`.

## Sign-in methods

| Method | Route | Notes |
|--------|-------|-------|
| Phone + password | `POST /api/auth/register/phone`, `POST /api/auth/login/phone` | Password min 6. Phone login fails `auth.phoneLoginRequiresOAuth` if the user has no `passwordHash`. Rate: 20/15m login, 20/1h register (skipped for E2E header in non-prod). |
| Apple | `POST /api/auth/login/apple` | `identityToken` + `nonce`. Link/unlink: `POST /api/auth/link/apple`, `/unlink/apple`. Merge: `confirmMerge` → `409 auth.oauthLinkMergeRequired`. |
| Google native | `POST /api/auth/login/google` | `idToken`. Link/unlink: `/link/google`, `/unlink/google`. |
| Google web (Safari / PKCE) | `GET /api/auth/google/redirect`, `GET /api/auth/google/callback`, `POST /api/auth/google/exchange` | One-time `code` exchange. |
| Telegram OTP | Bot start `/auth` (or Login “Telegram”) → `POST /api/telegram/verify-otp` | Body `code` = 6 digits. Rate 60/5m. |
| Telegram deep-link | FE `/login/:telegramKey` → `POST /api/telegram/verify-link-key` | Key length ≥ 20. `optionalAuth`; merge with `confirmMerge`. Replay via `linkKeyReplay.service`. |

Unlink of Apple/Google refuses if it would remove the last auth method (`phone` / `telegramId` / the other OAuth id). Telegram unlink: `POST /api/users/profile/unlink-telegram`.

OAuth rate: 40/15m. All login/register paths call `ensureUserCityAssigned` then `applyAuthAttributionSafely` (`register` vs `login`).

## Access JWT

`generateShortAccessToken` (`Backend/src/utils/jwt.ts`):

- `typ=access`, `ver=1`, `jti` UUID, `alg=HS256`
- `iss` = `JWT_ISS` default `padelpulse`
- `aud` = `JWT_AUD` default `padelpulse-app`
- TTL `JWT_ACCESS_EXPIRES_IN` default **30m** (`DEFAULT_JWT_ACCESS_EXPIRES_IN`)
- Payload may include `userId`, `phone`, `telegramId`, `appleSub`, `googleId`, `isAdmin`

`verifyToken` **rejects** any JWT with `typ !== 'access'` (`LegacyJwtVerifyRejectedError` → `401 auth.clientUpgradeRequired`). Audience/issuer must match.

Production secret (`jwtAuthConfig.ts`):

- Refuse empty / default / denylist (`your-secret-key`, `bandeja`, `secret`, …)
- `JWT_SECRET` length ≥ 32
- Access TTL **1m–30m** inclusive
- Non-prod: unset secret → `your-secret-key`

## Refresh sessions

Opaque token (not a JWT). Stored hashed on `user_refresh_sessions`. Default TTL **60d** (`REFRESH_TOKEN_EXPIRES_IN`). Production: **1d–90d**. Sliding: each successful rotation writes a new `expiresAt`.

Cap: `AUTH_MAX_ACTIVE_SESSIONS_PER_USER` default **20** (bounded 2–100). Creating a session revokes oldest excess.

`POST /api/auth/refresh` (`authRefresh.controller.ts`):

- Header **`X-Refresh-Request-Id` REQUIRED**. Pattern `^[A-Za-z0-9._:-]{16,128}$`. Missing → `400 auth.refreshRequestIdRequired`. Invalid → `400 auth.refreshRequestIdInvalid`.
- Candidates: web cookie `pp_rt` (`REFRESH_COOKIE_NAME`) and/or JSON `refreshToken`.
- Cookie-only requests must pass `requireTrustedRefreshOrigin` (CORS allowlist or same-site fetch). Body token skips origin check.
- Rate: 800/15m. Global `/api/` limiter skips `/auth/refresh`.

Rotation (`userRefreshSession.service.ts`):

1. Lock row by token hash.
2. Live session: create successor, revoke predecessor, store `rotationRequestId` + encrypted replacement token (`replacementTokenCiphertext`).
3. **Idempotent same request id:** presenting the successor with the predecessor’s `rotationRequestId` touches the live session (lost-response replay of the same refresh).
4. **Replay of rotated predecessor:** decrypt successor token and return it while successor is still live.
5. If successor is itself revoked *and* has `replacedBySessionId` → **`auth.refreshReused`** (theft / reuse after further rotation).
6. Concurrent same or different request ids converge on one live successor (serialization retries, then `503 auth.refreshBusy`).

Logout:

- `POST /api/auth/logout` — revoke presented tokens, clear cookie. Trusted origin.
- `POST /api/auth/logout-all` — `authenticate`, revoke all sessions for user.
- `GET /api/auth/sessions` / `DELETE /api/auth/sessions/:id` — FE `/profile/sessions`.

Web vs native (`REFRESH_WEB_HTTPONLY_COOKIE`, production **must** be true; `REFRESH_WEB_HTTPONLY_JSON_BODY` **must** be false):

- **Web:** HttpOnly cookie only (`withCredentials` on FE). JSON body must not contain `refreshToken`. Cookie: `HttpOnly`, `Path=/api` (`REFRESH_COOKIE_PATH`), `SameSite=lax` default, `Secure` in production.
- **Native (Capacitor):** JSON `refreshToken` persisted in Keychain/Keystore (`refreshTokenPersistence.ts` / `authBridge`). Web localStorage refresh is not used when cookie mode is on.

FE always sends `X-Refresh-Request-Id` (`getOrCreateRefreshRequestId`). Native derives a deterministic id from the refresh token (`native-v1-` + SHA-256).

`REFRESH_TOKEN_ENABLED=false` is **refused in production**.

## Onboarding gates

After login (`Frontend/src/App.tsx`, Home/Find):

| Gate | Trigger | Code |
|------|---------|------|
| Profile name | `nameIsSet !== true` | `runWithProfileName` — blocks join/create/invite/chat send |
| Primary sport | `nameIsSet` and `primarySportIsSet !== true` | `PrimarySportGateHost` modal. Clearing sports later does **not** re-open (legacy backfill). |
| No enabled sports | `hasEnabledSports(user) === false` | Home/Find redirect to `/profile` (`MainPage.tsx`) |
| City | After sport: no `currentCity` | `CityPickerRedirectHost` → `/select-city`. Auto-city failed. Banner: `CityPromptBanner` when `cityIsSet !== true`. |
| Gender | `genderIsSet !== true` after city | `GenderPromptBanner` on Find (`AvailableGamesSection`). Join/create mixed-gender: `genderJoinGate` |
| Sport questionnaire | 0 games, not completed/skipped | `SportQuestionnairePrompt` on My tab; per-sport calibration |

City assignment: `ensureUserCityAssigned` uses IP geo then `FALLBACK_CITY_ID`. Registration **requires** a City row + `FALLBACK_CITY_ID`.

## Middleware (`Backend/src/middleware/auth.ts`)

| Export | Behavior |
|--------|----------|
| `authenticate` | Bearer (or `?token=`) access JWT; load active user; IP location side-effect |
| `optionalAuth` | Header only; invalid token → continue anonymous |
| `requireAdmin` | `user.isAdmin` |
| `requireCanModifyResults` | After `authenticate`; `canModifyResults` |
| `requireGamePermission(roles)` | Game id from `params.gameId`/`id`/`leagueSeasonId` or `body.gameId`. Default blocks `ARCHIVED`. |
| `canEditGame` | OWNER or ADMIN |
| `canEditGameIncludingArchived` | Same + archived |
| `canAccessGame` | OWNER, ADMIN, PARTICIPANT |
| `canAccessGameIncludingArchived` | Same + archived |
| `requireClubAdmin` | Club admin for `params.clubId` |

Admin panel login: `POST /api/admin/login` (phone+password of `isAdmin` user) — same access+refresh issuance.

## Link-to-app attribution

On auth, FE axios injects stored `attribution` on login/register/OTP/link-key/exchange (`Frontend/src/utils/appAttribution.ts`, `isAuthAttributionRequestUrl`). Backend `readAttributionFromRequest` merges body, nested `attribution`, query, cookie `bandeja_aid`. First-touch: User gets `attributionId` + UTM fields only if unset. `POST /api/auth/attribution` (`authenticate`) is attach-only if already marked.

See [domains/ads-and-attribution.md](../domains/ads-and-attribution.md).

## Force-update

- Client (native): `GET /api/app/version-check?platform=ios|android&buildNumber=N` (`Backend/src/services/appVersion.service.ts`)
- Status: `ok` | `optional_update` | `blocking_update` (from `AppVersionRequirement.isBlocking` when build < `minBuildNumber`)
- Admin: App Versions — `minBuildNumber`, semver `minVersion`, `isBlocking`, optional `message`. FE `App.tsx` blocks on `blocking_update`.

## Other JWTs (not `typ=access`)

- `typ=live_spectator` — 48h, `gameId`+`matchId`, live scoring share (`results.controller.ts`). `verifyToken` will **not** accept these as session auth.
- `typ=push_invite_action` — Android invite actions (`pushInviteActionToken.service.ts`).
