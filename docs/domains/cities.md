# Cities

Three roles. Never collapse. Never drive Find/My/weather/city groups/play-intent lobby from Browse.

| Role | Source | Drives |
|------|--------|--------|
| **Home** | `user.currentCity` / `currentCityId` via Profile or Find header `CityModal` → `usersApi.switchCity` | Find, My, weather, city group chats, play-intent lobby |
| **Browse** | `useBrowseCityStore`, `sessionStorage` key `bandeja.browseCity` | Invite Search/Looking, chat contacts, chat Users search |
| **Venue** | Club pick (`locationCityId` / `club.cityId`) | Create-game / edit-location club list; Looking **fit** (clubs/time/level/dates) |

```
Home  ──switchCity──► Find, My, city group, play-intent lobby, weather
Browse ─chip───────► Invite Search, Invite Looking, chat contacts, chat user-search
Venue ──club───────► Create/edit location, Looking fit
```

Looking **population** = Browse. Looking **fit** = Venue/game.

## Home

- Searchable city list + map (`CityMap`); clubs tab in picker (selecting a club’s city is still Home if this is `CityModal` switch mode).
- Auto-city + confirm/change via Home `CityPromptBanner`.
- Profile city change snaps Browse to Home (`resetToHome()`, recents kept). Logout: `resetToHome({ clearRecents: true })`.
- Find header city is Home, not Browse.

## Browse

`Frontend/src/store/browseCityStore.ts`. `cityId: null` means Home. Recents max 3, exclude Home. Snapshots `{ name, country }`. Picking Home stores `cityId: null`. Same-tab only; not profile-synced.

Browse **never** calls `switchCity`. Chat Users: `CityModal` selector mode. Invite/Club: in-dialog `CityPickerEmbed` (no Dialog-on-Dialog).

Nearby people expand: named search ≥2 chars, primary city 0 hits, Invite Search or Chat Users only (`expandNearby=1`). Anchor = browse city lat/lon, not GPS. Cap 3 cities, ~80 km same country / 30 km border. Labelled Nearby block; “View {city}” sets Browse. Not on Looking, empty contacts, or clubs.

Detail: `docs/plans/browse-city.md`.

## Venue

`ClubModal` header chip = venue city, **not** Browse. No query: `GET /clubs/city/:cityId`. Typed query: `getForMap` (lazy). Pick club → game/draft city = `club.cityId`; clear courts/bookings. Browse ↛ Venue; Venue ↛ Browse.

## Club detail (city picker / Find / create)

Address, mini map, Maps link. Availability grid for BOOKTIME/PADELOO/KLIKTEREN (NSPADELSUPABASE via its adapter). Connect OTP. Browse slot → create-game prefill. Club reviews (visit game, stars, photos).
