# Testing

Catalog of **manual/E2E cases:** [UI_TEST_PLAN.md](../UI_TEST_PLAN.md) (do not copy it here). Two-user: [UI_TEST_PLAN_TWO_USER.md](../UI_TEST_PLAN_TWO_USER.md).

Heavy tests go through serialized npm scripts / `scripts/run-heavy`. Same lane never concurrent. See [development.md](./development.md).

## Playwright (Frontend)

Config: `Frontend/playwright.config.ts`. Starts Backend `:3000` + Frontend `:3001` unless already up. Header `X-E2E-Test: 1`.

**Projects:** `guest`, `login`, `authenticated` (storageState `e2e/.auth/user.json`), `desktop` (`@desktop`), `games-guest`, `two-user` (`@two-user`).

```
cd Frontend
npm run test:e2e              # all projects
npm run test:e2e:guest
npm run test:e2e:auth         # --project=authenticated
npm run test:e2e:two-user
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:report
```

**Prod host refuse** (`Frontend/e2e/env-guard.ts`): `E2E_BASE_URL` / `E2E_API_URL` must be localhost/127.0.0.1. Rejects URL markers `bandeja.com`, `back.bandeja.com`, `front.bandeja.com`, `thepadel`. Health `/api/health/details`: `NODE_ENV` must not be `production`; DB name must be **`padelpulse_dev`** and `e2eSafe=true`.

**Seed:** users A/B in `Frontend/e2e/test-user.ts` (`+79672825552` / `+79672820000`, override `E2E_PHONE` / `E2E_PHONE_B`). City + `FALLBACK_CITY_ID` required for register paths.

## Vitest (Frontend)

Targeted scripts (not a full-repo vitest): `test:auth`, `test:theme`, `test:premium-navigation`, `test:premium-header-scroll` (Chrome scroll rasterization and animation continuity), `test:deep-link-catalog`, `test:next-game`, `test:play-intent`, `test:live-scoring`, `test:game-invite`, `test:invites`, `test:find`, `test:home-render`, `test:queries`, `test:group-channel`, `test:chat-inbox-feed`, `test:chat-drafts`, `test:chat-open`, `test:chat-outbox`, `test:chat-stickers`, `test:unread`, `test:stories`, `test:achievements`, `test:keyboard-layout`, `test:gender-join`, `test:user-team`, `test:bugs`, `test:avatar-crop`, `test:game-slot-overlap`, `test:training-attendance`, `test:leaderboard`, `test:game-results-share`, `test:ios-shared-packages`.

## Backend

```
cd Backend
npm run test:automated        # scripts/tests/run-all.ts — several suites need seeded data (e.g. 4+ users for live scoring)
npm run test:auth-refresh
npm run test:auth-refresh-integration
npm run test:security
npm run test:link-to-app
npm run test:bracket-structure
npm run test:game-results-artifacts
npm run test:play-intent
npm run test:available-games
# plus other test:* in Backend/package.json (invite, achievements, stickers, …)
```

`test:security` uses a dummy `DB_URL` (route import only). `test:cors-http-e2e` is optional / not in CI security job.

## Contracts

Root:

```
npm run build:contract / test:contract          # @bandeja/chat-contract
npm run build:unread-contract / test:unread-contract
```

CI builds both contracts before Backend generate/migrate.

## CI

`.github/workflows/ci.yml` — Node 24.

| Job | What |
|-----|------|
| `backend` | Postgres 16 service `padelpulse_ci`; `prisma generate` + `migrate deploy`; lint; targeted tests including `test:auth-refresh`, `test:auth-refresh-integration`, `test:security`; `npm run build` |
| `frontend` | contracts; lint; targeted Vitest; Playwright Chromium install + `test:game-results-share`; `npm run build` |
| `ios-shared-packages` | macOS, `test:ios-shared-packages` |
| `deploy` | push to `master`/`main` after the three jobs — `./upd.sh` (see [PRODUCTION.md](../PRODUCTION.md)) |

Prisma deploy workflow: `.github/workflows/prisma-migrate-deploy.yml`.
