# Browse city (Search, Looking, Club, Chat)

Shipped. Session lens so people/club directories can hop city without `switchCity`. Looking product rules stay in `player-invite-looking.md`.

## Three cities

| Name | Source | Drives |
|------|--------|--------|
| **Home** | `user.currentCity` | Profile / Find header `switchCity` only → Find, My, city groups, play-intent lobby, weather |
| **Browse** | `useBrowseCityStore` + `sessionStorage` `bandeja.browseCity` | Invite Search, Invite Looking, chat contacts, chat Users search |
| **Venue** | Club pick `locationCityId` / `club.cityId` | Create/edit location; Looking **fit** |

Looking **population** = Browse. Looking **fit** = Venue/game.

Browse never calls `switchCity`. Default = Home (`cityId: null`). Profile `switchCity` → `resetToHome()` (recents kept). Logout → `resetToHome({ clearRecents: true })`. One browse city at a time. Club pick relocates Venue only (clear courts/bookings). Browse ↛ Venue; Venue ↛ Browse. ClubModal chip defaults to Venue/home, not Browse.

## Store

```
cityId: string | null
recents: string[]              // max 3, exclude home
snapshots: Record<id, { name, country }>
setCityId(id, snapshot?, homeCityId?)  // home → cityId null, drop from recents
resetToHome({ clearRecents? })
```

`Frontend/src/store/browseCityStore.ts`, `hooks/useResolvedBrowseCity.ts`.

## Chrome

Shared `BrowseCityChip`. Away (browse ≠ home): distinct tint. Picker: Your city (Home), recents (max 3), nearest GPS, country list. Chat Users: chip inside search field; `CityModal` selector (no `switchCity`). Invite/Club: in-dialog `CityPickerEmbed`. Hidden on chat bugs/market/channels. ClubModal header chip is Venue.

## Surfaces

**Invite Search** — `GET /users/invitable-players?cityId=` Browse. Explicit `cityId` skips home===game guard. `expandNearby=1` when typed ≥2 and primary city 0 people.

**Invite Looking** — `POST /play-intents/invite-pool` optional `cityId`. `{ gameId, cityId }` scores the game, populates from browse. Draft: hook sends browse as `draft.cityId`; venue clubs/times stay on draft for fit. Socket subscribe `pool.cityId`. Empty: no nearby merge.

**Chat contacts** — `loadGlobalInvitablePlayers(browseCityId)`. Cache keyed by city. Following filtered to browse city; DMs unscoped.

**Chat user-search** — (1) local chats unscoped (2) users in browse city (3) Nearby if layer 2 empty and query ≥2.

**ClubModal** — Venue. Typed search uses `getForMap`. Other cities grouped by city name.

## Nearby (named people only)

When: query ≥2, primary city 0 hits, Invite Search or Chat Users, `expandNearby=1`.

Anchor = browse city lat/lon (skip if missing). Rank: same administrativeArea, same country, Haversine. Keep same-country ≤80 km or other-country ≤30 km. Take 3. Never mix into the main list. “View {city}” sets Browse. Do not auto-switch.

Not on: contacts with no query, Looking, messages/bugs/market/channels, clubs, lists that already have hits.

BE: `services/user/nearbyCities.ts`, `controllers/user/social.controller.ts`.

## Cross-city invite

Allowed. Do not rewrite `currentCity`. Looking dates in Venue TZ; intents in intent-city TZ.

## Do not

- `switchCity` from invite, chat, or club pick
- Drive Find / My / weather / city groups / play-intent lobby from Browse
- Default ClubModal to Browse
- Auto-expand Looking or empty contacts
- GPS as nearby anchor
- Radius people list as default
