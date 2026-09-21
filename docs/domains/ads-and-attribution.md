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
- URL/deep-link query parameters; attribution never reads or writes the clipboard
- Auth requests attach `attribution` JSON (aid + UTM + choice)
- `POST /api/auth/attribution` attach-only if User already marked

Native startup and deep links capture URL/stored attribution without a paste prompt. The landing page does not overwrite the clipboard on store choice or automatic redirect. A new store install has no automatic clipboard attribution handoff; a subsequent attributed deep link can still supply `aid`/UTM/`ref`.

User mark (first time only): `attributionId`, `utmSource`…`utmTerm`, `attributedAt`, `attributionChoice`, `attributionAuthKind` (`register`|`login`). Models: `LinkToAppAttribution`, `LinkToAppEvent` in `schema.prisma`.

Admin: **App QR** (`Admin/link-to-app.js`) — funnel totals, by campaign, attributed users, recent events. Optional `LinkToAppCampaignLabel` maps opaque `utm_campaign` codes (UUID) to an Admin-only visual name; QR URLs still use the code. Users table can show QR/UTM.

## Referrals ride the attribution row

There is no parallel referral pipeline. A referral is one more thing the link-to-app snapshot carries, and it inherits that pipeline's first-touch rule verbatim.

```
https://bandeja.me/link-to-app/?ref=BNDJ-7K2Q     personal link
https://bandeja.me/games/<id>?ref=BNDJ-7K2Q       "come play Tuesday"
```

| Stage | What happens | Where |
|-------|--------------|-------|
| Landing | `ref` is normalized into `localStorage['bandeja.attribution'].ref`, next to `aid`, and re-appended to the `/go/<choice>` URLs | `Frontend/public/link-to-app/index.html` |
| SPA / deep link | `parseAttributionFromSearch` picks `ref` out of any URL; `mergeAttributionFirstTouch` stores it | `Frontend/src/utils/appAttribution.ts` |
| Auth request | the axios interceptor already attaches the whole snapshot to every auth call, so `ref` rides along untouched | `Frontend/src/api/axios.ts` |
| Server parse | `parseLinkToAppAttributionInput` normalizes `merged.ref`; `attributionHasSignal` counts a bare `ref` as signal | `Backend/src/services/linkToApp/linkToApp.attributionParse.ts` |
| Conversion | `applyAuthAttribution` → `attachReferrerFromAttribution` → `attachReferrer` | `Backend/src/services/linkToApp/linkToApp.service.ts` |

**The referrer is written once.** `attachReferrer` writes `User.referredByUserId` through `updateMany({ where: { id, referredByUserId: null } })` and `LinkToAppAttribution.referrerUserId` through the same `null`-guarded `updateMany`. Two concurrent attaches cannot both win, and a later link carrying a different code is a no-op — the same rule `mergeAttributionFirstTouch` enforces for UTMs, for the same reason.

The attach also enforces the **7-day window**, not just the manual code field. Without it, an account created three years ago could open a fresh referral link and become somebody's referral.

`ref` is dropped, never repaired, when it is not a valid code. The alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` excludes `0`, `O`, `1` and `I`, so a code containing one of them is a typo rather than a near-miss — "fixing" it would credit a different, real account.

`GET /api/public/referral/:code` is the only unauthenticated referral endpoint. It returns **`firstName` and `avatar` and nothing else**, rate-limited with `rateLimitKeyFromRequest`. An 8-character code is short enough that any wider projection turns it into a people-search endpoint.

Payouts, the cap and the abuse rules: [economy.md](./economy.md). Admin reporting sits next to the campaign tables: [admin.md](./admin.md).

## Nspadel

Not ads. Live **club booking** for NS Padel Centar: `Backend/src/routes/nspadel.routes.ts` (`/api/nspadel/availability`, `/bookings`, `/my-clubs`, upstream proxy). Env `NS_PADEL_SUPABASE_URL` / `NS_PADEL_SUPABASE_ANON_KEY` (backend-only). FE: `Frontend/src/integrations/nspadel/`. Missing URL → `nspadelSupabaseUrlRequired`. Not an Admin nav section.
