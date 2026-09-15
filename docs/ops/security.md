# Security notes (local + runtime)

Code: `Backend/src/app.ts`, `Backend/src/config/corsOrigins.ts`, `Backend/src/config/jwtAuthConfig.ts`, `Backend/src/config/apiRateLimit.ts`, `Backend/src/utils/dbEnvironment.ts`, `Backend/src/middleware/refreshOrigin.ts`, `Backend/src/services/social-graph/socialGraph.block.ts`.

## CORS

Allowlist only — never reflect arbitrary Origin or `null`.

- Always: `https://bandeja.me`, `www` / `travel` / `arena` / `montenegro2026.bandeja.me`, Capacitor `https://localhost`, `capacitor://localhost`.
- Non-production adds `http://localhost:3001`, `:5173`, Admin `:9010` (and 127.0.0.1).
- Plus `FRONTEND_URL` and comma-separated `CORS_ALLOWED_ORIGINS`.
- Credentials: true. Allowed headers include `X-Refresh-Request-Id`, `X-Client-Version`, `X-Client-Platform`, `X-E2E-Test`.

## Trust proxy

`app.set('trust proxy', config.trustProxy)`. Default `TRUST_PROXY=1` (one hop). `false`/`0` = off. Rate-limit keys use `rateLimitKeyFromRequest` (TCP peer when proxy untrusted). Do not prefer raw `X-Forwarded-For` for client IP.

## Rate limits

Global `/api/`: 15m window; max **3000** prod / **10000** dev (`API_RATE_LIMIT_*`). Skip prefixes (path only, no query poison): `/logs/stream`, `/auth/refresh`, `/chat/sync/`, `/chat/unread-objects`.

Dedicated: phone login 20/15m, register 20/1h, OAuth 40/15m, refresh 800/15m, Telegram verify 60/5m, link-to-app 120/15m. E2E header skips phone limiters when `NODE_ENV !== production`.

## JWT fail-closed (production)

Boot throws if:

- Weak/short/default `JWT_SECRET`
- `JWT_ACCESS_EXPIRES_IN` outside 1m–30m
- `REFRESH_TOKEN_EXPIRES_IN` outside 1d–90d
- `REFRESH_TOKEN_ENABLED=false`
- `REFRESH_WEB_HTTPONLY_COOKIE=false`
- `REFRESH_WEB_HTTPONLY_JSON_BODY=true`

Legacy (non-`typ=access`) JWTs are rejected as session auth.

## Refresh replay

Rotated predecessor can replay the **current** successor (lost response). Presenting a predecessor after the successor has **also** rotated → `auth.refreshReused`. Missing `X-Refresh-Request-Id` → 400. Cookie refresh without trusted Origin → `auth.refreshOriginRejected`. Metrics/alerts: `AUTH_REFRESH_ALERT_*`.

## Spectator tokens

`typ=live_spectator`, 48h, bound to `gameId`+`matchId` (`signLiveSpectatorToken` / `verifyLiveSpectatorToken`). Query token size capped. Not valid for `authenticate`.

## Block graph

`BlockedUser` is bidirectional for `isBlocked`. `assertCanInteract` on stories, user-teams, marketplace chat. Also filtered in play-intent pools, follower audience, player-level evaluation. API: `/api/blocked-users`.

## Production-like DB URL markers

`Backend/src/utils/dbEnvironment.ts` `PROD_DB_URL_MARKERS`: `bandeja.com`, `back.bandeja.com`, `thepadel`, `rds.amazonaws`, `hetzner`, `.prod.`, `/prod`. `isProdLikeDatabase` if URL matches **or** DB name is not `padelpulse_dev` / `padelpulse_shadow`. Used by health `e2eSafe`, notification dispatch guard. E2E env-guard uses a similar host refuse list.

Helmet + compression are on. Health public payload is minimal; details endpoint is what E2E uses.
