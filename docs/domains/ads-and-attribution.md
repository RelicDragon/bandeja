# Ads and attribution

Constraints: [product/constraints.md](../product/constraints.md) (link-to-app first-touch). Admin UI: [admin.md](./admin.md).

## In-app ads

Placements (`Frontend/src/shared/adPlacements.ts`):

| Key | Surface |
|-----|---------|
| `home_hero` | My tab (`MyTab.tsx`) |
| `find_top` | Find tab |
| `leaderboard_banner` | Rating + achievement leaderboards |

`AdSlot` + `useAdPlacements`. Calendar cell tags (short label, color, date range, per-locale selected-day message) for viewers eligible for a deliverable campaign — dismissal/frequency-cap does **not** hide the tag. Campaign activate/end every 10 min; analytics rollup daily 03:00.

Admin: Sponsor Ads (`/admin/ads/sponsors|campaigns|targeting-presets`, creatives, stats, export, preview). Optional Redis cache: `ADS_REDIS_CACHE` when `REDIS_URL` set. `AD_CLICK_TOKEN_SECRET` optional (defaults to `JWT_SECRET`).

## Link-to-app (App QR funnel)

Landing is static `Frontend/public/link-to-app/index.html` at **`/link-to-app/`** (trailing slash). SPA `/link-to-app` in `App.tsx` only redirects to `/` or `/login` — do not treat it as the QR UI. Records UTM + `aid`.

Public API (`Backend/src/routes/linkToApp.routes.ts` at `/api/public/link-to-app`):

- `GET /hit?kind=view|ios|android|web|…` — 1×1 GIF, sets `bandeja_aid` cookie
- `GET /go/:choice` — `choice` = `ios` | `android` | `web`; 302 to App Store / Play / web app. Optional `APP_STORE_CAMPAIGN_PROVIDER_TOKEN` (`pt`) on iOS URLs.

First-touch UTM: `utm_source|medium|campaign|content|term` (sanitized). Existing attribution **keeps** first UTM; later values fill blanks only (`coalesceUtm`).

Client carry (`Frontend/src/utils/appAttribution.ts`, `appAttributionBootstrap.ts`):

- Cookie `bandeja_aid`, localStorage `bandeja.attribution`
- Native clipboard prefix `bandeja-aid:`
- Auth requests attach `attribution` JSON (aid + UTM + choice)
- `POST /api/auth/attribution` attach-only if User already marked

User mark (first time only): `attributionId`, `utmSource`…`utmTerm`, `attributedAt`, `attributionChoice`, `attributionAuthKind` (`register`|`login`). Models: `LinkToAppAttribution`, `LinkToAppEvent` in `schema.prisma`.

Admin: **App QR** (`Admin/link-to-app.js`) — funnel totals, by campaign, attributed users, recent events. Optional `LinkToAppCampaignLabel` maps opaque `utm_campaign` codes (UUID) to an Admin-only visual name; QR URLs still use the code. Users table can show QR/UTM.

## Nspadel

Not ads. Live **club booking** for NS Padel Centar: `Backend/src/routes/nspadel.routes.ts` (`/api/nspadel/availability`, `/bookings`, `/my-clubs`, upstream proxy). Env `NS_PADEL_SUPABASE_URL` / `NS_PADEL_SUPABASE_ANON_KEY` (backend-only). FE: `Frontend/src/integrations/nspadel/`. Missing URL → `nspadelSupabaseUrlRequired`. Not an Admin nav section.
