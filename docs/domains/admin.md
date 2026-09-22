# Admin panel

Plain JS, no build. **Do not open `file://`.** Same-origin UI:

```
./Admin/run-ssh.sh          # prod API tunnel :9000 (and DB :15432)
./Admin/serve.sh            # http://127.0.0.1:9010/  proxy → :9000
./Admin/serve.sh --dev      # proxy → local Backend :3000
```

Login: phone+password of a user with `isAdmin`. `POST /api/admin/login` (`Admin/app.js`, `Backend/src/services/admin/auth.service.ts`). Subsequent calls: `Authorization: Bearer` + `requireAdmin`. API target is chosen on the login form (must match the serve proxy).

Code: `Admin/index.html` nav, `Admin/app.js`, `Admin/link-to-app.js`. API: `Backend/src/routes/admin.routes.ts` mounted at `/api/admin`. Services: `Backend/src/services/admin/`. Logs SSE is `/api/logs/stream` (`Backend/src/routes/logs.routes.ts`), not under `/admin`.

## Sections (nav)

| Nav | Page id | Capabilities |
|-----|---------|--------------|
| Overview | `overviewPage` | Stats: users, games, cities, clubs, active games, invites (`GET /admin/stats`) |
| Users | `usersPage` | List/CRUD, toggle active, reset password, **Coins** (`POST /admin/users/:id/emit-coins`), **Drop Coins**, **Merge users** (`POST /admin/users/merge`), sport **questionnaire reset** (`POST /admin/users/:id/sports/:sport/questionnaire/reset`) |
| Online Users | `onlineUsersPage` | Presence (`GET /admin/online-users`) |
| Games | `gamesPage` | Browse; per-game reset results |
| Invites | `invitesPage` | List; admin accept/decline |
| Cities | `citiesPage` | CRUD; recalculate center(s) |
| Clubs | `clubsPage` | Club/court CRUD, club admins, **court import**: Booktime / Padeloo / Klikteren (`POST /admin/clubs/:id/{booktime\|padeloo\|klikteren}/import-courts`). Court webcam URL. No Nspadel import in this UI. |
| Reports | `reportsPage` | Message reports + story comment reports; status patch |
| App Versions | `appVersionsPage` | Force-update: `platform` ios/android, `minBuildNumber`, `minVersion`, `isBlocking`, `message` |
| Platform Settings | `platformSettingsPage` | Results-artifact Replicate photo model (`GET/PATCH /admin/results-artifacts/photo-model`); **Cost Split** `COINS_PER_CURRENCY_UNIT` (deliberately unset — while null the coins settle option is hidden on both ends); `REFERRAL_REWARD_REFERRER` / `REFERRAL_REWARD_REFERRED`; **Organizer Next Steps** `GAME_ORGANIZER_NEXT_ACTIONS_ENABLED` (PRD 364 rollout switch, off unless the row is literally `true`; published read-only with **Find: Looking-to-play Count** `FIND_LOOKING_COUNT_ENABLED` (PRD 363, same On/Off card; off unless literally `true`) through the unauthenticated `GET /api/public/platform-flags`, allow-listed in `Backend/src/services/platformFlags.service.ts`) |
| Market Categories | `marketCategoriesPage` | Marketplace category CRUD |
| Mass Notifications | `massNotificationsPage` | Broadcast push (`POST /admin/mass-notification`) |
| Sponsor Ads | `sponsorAdsPage` | Sponsors, campaigns, targeting presets, creatives, stats, export, preview (`/admin/ads/*`) |
| Goods | `Admin/goods.js` | Cosmetics catalogue CRUD, preview art upload, **Withdraw** (deactivate + refund every owner exactly once). API `/api/goods`, every route `requireAdmin` |
| Referrals | `Admin/referrals.js` | Referrer, code, invited, joined, played, rewarded, coins, last join. `GET /api/admin/referrals`, `GET /api/admin/referrals/export` (CSV), `POST /api/admin/referrals/rewards/:rewardId/revoke`. Date filters narrow by **invite** date, not payout date |
| Translation Queue | `translationQueuePage` | Queue stats + recent failures (`GET /admin/translation-queue/stats`). Results-artifact queue stats exist on API (`/admin/game-results-artifacts-queue/stats`). |
| App QR | `linkToAppPage` | Funnel: views / iOS / Android / Web / register / login; by campaign; attributed users; recent events. `Admin/link-to-app.js` → `GET /admin/link-to-app/stats?days=` |
| Logs | `logsPage` | Historical + SSE stream (`GET /api/logs/stream?token=`), clear |

Global city filter in the header scopes several lists.

**`/api/goods` is admin-only.** It previously carried `authenticate` alone on `POST`/`PUT`/`DELETE`, so any signed-in player could create, reprice or delete catalogue items, and the unfiltered `GET` leaked unreleased ones. Every route on that router is now `requireAdmin`, and `Backend/src/routes/goodsAdminGuard.integration.test.ts` fails if that regresses. Player-facing reads live on `/api/shop` — nothing on `/api/goods` is for players.

## Related APIs not in nav

- Media cleanup / storage stats: `POST /admin/media/cleanup`, `GET /admin/media/stats`
- Nspadel is a **club booking** integration (`/api/nspadel/*`, `NS_PADEL_SUPABASE_*` in `env.sample`), not an Admin section. Seed: `Backend/scripts/seed-nspadel-centar.ts`.

Prod tunnels and safety: [PRODUCTION.md](../PRODUCTION.md).
