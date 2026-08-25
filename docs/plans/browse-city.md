# Browse city (Search, Looking, Club, Chat)

Shipped. Compact city selector so users can search people and clubs in other cities without changing their profile city.

Looking product decisions in `player-invite-looking.md` stay locked. This is city scope on top.

---

## Jobs

1. **Find a known person who is not in my city** — “Jan moved to Brno”; “Maria is on holiday in Valencia.”
2. **Browse another city’s directory** — travelling next weekend, organizing an away game, checking who is looking there.
3. **Pick a club that is not in my profile city** — creating the game in that city; game city must follow the club.
4. **Metro spillover on a name search** — typed “Jan”, nobody in Prague, but Jan is in Kladno 25 km away. Do not make the user guess the suburb.

These are **directory** jobs. They are not “I live here now” (that stays Profile → change city) and not “show me Prague’s Find feed while I pretend to be in Brno.”

---

## What other multi-city apps get right (and what we steal)

Bandeja is closer to **Meetup + Playtomic + Tinder Passport** than to Uber or Nextdoor. Steal the patterns below; do not cargo-cult the rest.

### Tinder Passport — browse ≠ home

[Passport Mode](https://www.help.tinder.com/hc/en-us/articles/115004490423-Passport-Mode): you are virtually in **one** other city at a time; home location is unchanged; you can hop as often as you want; recent destinations are one tap.

**Steal**

- One browse city at a time, never mixed into the home city list.
- Home city stays on the profile. Browse is a lens.
- When browse ≠ home, the chrome must look *different* so you cannot forget you left home (Passport is an explicit mode, not a silent filter).
- Recent browse cities at the top of the picker (Tinder keeps prior destinations).

**Reject**

- Do not pretend the user *is* in Brno for Find, city group chat, weather, or play-intent lobby. Those stay on **profile city**. Passport is only for people/club directories.

### Craigslist / Resident Advisor / Dice — city is a site

The entire feed is one city. Switching city is a first-class, obvious control (header city name). Empty in that city is honest: this city has nothing, pick another.

**Steal**

- City name is always visible on directory surfaces. No buried “location settings.”
- Switching city **replaces** the list. Do not union Prague + Brno into one unsorted soup.

**Reject**

- Do not make browse city rewrite the whole app (Craigslist’s pain). Find / My / city channels stay home.

### Meetup — discrete city, not a radius (the Dallas lesson)

Meetup’s search is historically a **radius around a centroid**. In Dallas/Fort Worth (or NYC, Barcelona metro) that always leaks neighbouring cities into “Dallas.” Users who wanted *only* Dallas could not get it ([Meetup API thread](https://groups.google.com/g/meetup-api/c/SYsUgLCZeyM)).

**Steal**

- Default lists are **exactly one `City` row**. Our schema already is discrete (`User.currentCityId`, `PlayIntent.cityId`, `Game.cityId`). Keep that wall.
- Nearby is an **opt-in fallback after a failed name search**, not the default query shape.

**Reject**

- Do not switch people search to “everyone within 50 km.” That is how Fort Worth shows up in Dallas forever.

### LinkedIn Jobs / Google — “include nearby” vs auto-widen

LinkedIn’s “Include nearby cities” is an explicit toggle. Google says “Results from nearby” only after a miss, labeled, still in the original query’s context.

**Steal**

- Auto-expand **only when the current city returned 0 hits** for a typed query (Google miss → nearby).
- Label the extra block. Never merge it into the Prague list.
- Do not add an always-on “include nearby” toggle. Directory density here is small; a toggle is chrome we do not need.

**Reject**

- Do not auto-widen a list that already has hits (that is Meetup radius again).

### Airbnb — location lives in the search pill

Airbnb’s primary control is the location chip in the search field. Changing it is the main verb. Empty states ask you to widen, not dump you on a blank page.

**Steal**

- Chat Users search: city chip **inside** the field (`🔍 Search users    Prague ▾`). Same affordance, zero extra row.
- Club search with a query: find the venue even if it is not in the current city (Airbnb finds the listing, then you see where it is).

**Reject**

- Do not put dates/guests-style extra pills next to it. One chip.

### Playtomic / Matchi — club is the object, city is a map filter

Court apps treat **club** as the bookable object. City is how you narrow the map. Typing a club name finds it across the map; picking it sets where the booking lives.

**Steal**

- `ClubModal`: city chip in the header; typed search uses the existing **global club map cache** (`getForMap` / city-selector “search city or club”).
- Picking a club **is** choosing the game’s city (`club.cityId`). That is the booking-app contract.

**Reject**

- Playtomic has no people directory. Do not make ClubModal search users.

### Eventbrite vs Meetup empty states

Eventbrite rarely shows a dead blank page; Meetup often did. Golden rule: an empty directory still has a **control** (the city chip) and a **next step**.

**Steal**

- Contacts empty: “No users in Prague” + chip still tappable + hint to switch city or search a name.
- Looking empty: keep honest copy from Looking plan; add the city name in the sentence. Chip is the action.

### Nextdoor / Uber — wrong models

- **Nextdoor**: hard neighbourhood walls, browsing another city is not a job. Wrong for “message Jan in Brno.”
- **Uber**: city is GPS, no directory. Wrong for named search.

---

## Mental model (three cities)

| Name | What it is | Who owns it |
|---|---|---|
| **Home** | `user.currentCity` | Profile `switchCity` only |
| **Browse** | Session lens for people directories | Compact chip on Search / Looking / chat Users |
| **Venue** | Game/draft location | Club picker (`locationCityId` / `club.cityId`) |

```
Home ──profile──► Find, My, city group, play-intent lobby, weather
Browse ─chip───► Invite Search, Invite Looking, chat contacts, chat user-search
Venue ──club───► Create-game location, existing-game location editor, Looking *fit*
```

Looking **population** = Browse. Looking **fit** (clubs / time / level / dates) = Venue / game. A Brno-looking player scored against a Prague game will usually be dimmed. That is correct.

---

## Decisions

| Topic | Choice |
|---|---|
| Profile city | Never `switchCity` from these surfaces. `CityModal` **selector** mode only |
| One browse city | Never union two cities in the main list |
| Shared browse city | One session store across invite Search, invite Looking, chat contacts, chat user-search |
| Default | Home city. Home change snaps browse back |
| Persist | Session (`Zustand` + `sessionStorage`). Clear on logout. Last 3 browse cities in the picker |
| Away mode | When browse ≠ home, chip uses a distinct treatment (see Chrome) |
| Club pick | Relocates **Venue**: `club.cityId` → game/draft city; clear courts/bookings if the club left the old city |
| Browse ↛ Venue | Changing browse city does not move the game |
| Venue ↛ Browse | Changing club does not change browse city |
| Club chip default | Venue / home city, **not** browse city (do not open ClubModal on Brno because chat was browsing Brno) |
| Find / city channels | Unchanged. Still Home |
| Chip | Truncated translated name + chevron. Same visual language for browse and venue; different state |
| Nearby expand | Named search only (`≥ 2` chars) when the **server** browse-city list is empty (not self, not on this game, not busy). Invite gender/level/sport chips filter nearby rows; they do not trigger a second expand |
| Nearby mix | Never mix into the main list. Grouped **Nearby** sections |
| Nearby hop | Never silently change browse city. “View {city}” sets it |
| Nearby rank | Haversine from **browse city’s** lat/lon, not device GPS; same-metro / same-country first |
| Nearby cap | 3 cities, ~80 km, same country unless < 30 km (border towns) |
| Looking empty | Honest empty + chip. No auto-merge of another city’s pool |
| Chat message search | Unscoped. City chip only on Users tab |
| Following in contacts | Filtered to browse city. DMs stay unscoped. A follow with no DM who lives in another city is only reachable via Nearby (name miss) or an explicit hop |

---

## Chrome

### Shared `BrowseCityChip`

- Button, not text. `aria-label`: “Browsing {city}. Change city.”
- Truncate ~12 characters; full name in `title`.
- Home: muted pin, body colour.
- Away (browse ≠ home): primary tint + pin, so Prague users who hopped to Brno cannot miss it. One-tap path back: picker pins **Your city** first (existing `SuggestedCitiesBlock` `current`).
- **Chat Users** (page): `CityModal` drawer, selector mode — does **not** call `switchCity`.
- **Invite and Club** (Radix Dialog): in-dialog `CityPickerEmbed` covering the same dialog. Do not nest Dialog-on-Dialog / Drawer-on-Dialog (pointer-events). Back and Escape close the picker first, then the host dialog.

Picker order (reuse `buildSuggestedCityEntries` + recents):

1. Your city (**profile home**, always — even while the checkmark is on browse/venue)
2. Recent browse cities (session, max 3, skip if === home)
3. Nearest (GPS), already in city selector
4. Country → city list as today

### Placement (no extra rows)

| Surface | Where |
|---|---|
| Invite Search + Looking | Under Search \| Looking, **both** tabs. Looking has no search field; this is the shared slot |
| Chat Users tab | Inside the search field, trailing, before clear: `🔍 Search users    Prague ▾`. Contacts and search already share that bar |
| Chat bugs / market / channels | Hidden |
| ClubModal | Header next to title — this chip is **Venue**, not Browse |

Do not put a second club control in the invite header. Club stays on the location step + `ClubModal`.

Invite trainer / wallet / team / compare: still Search-only (Looking plan). Chip still shows — those lists are city directories too.

---

## Surfaces in detail

### Invite Search (`PlayerListModal`)

`GET /users/invitable-players` takes optional `cityId` = Browse. When `cityId` is explicit, do not require home === game city.

- Existing-game Search still invites to **this** game. Directory city is only who you can see.
- Create-game Search uses Browse as well (no `gameId`).

Busy-slot / already-playing filters stay game-scoped, not city-scoped.

Typed query `≥ 2` chars hits the server (`serverSearchQuery`). Nearby expand hangs off that same request (`expandNearby=1`).

Filters (gender, level, sport chips, games-together) apply to browse-city hits **and** nearby hits. Nearby is only populated when the **unfiltered server** city list is empty.

### Invite Looking

Population = Browse city + sport + entity. Fit = Venue/game.

`POST /play-intents/invite-pool` takes optional `cityId`.

- `{ gameId, cityId }` — score the game, populate from browse city.
- `{ draft }` — create-game omits `draft.cityId`; the hook sends browse as `draft.cityId`. Venue `clubId` / times stay on the draft for fit.

Live socket: subscribe `pool.cityId`. Changing browse city resubscribes.

Empty: `browseCity.lookingEmptyInCity` + chip. **No** nearby merge.

Vanished-selection / reserve / steal rules unchanged. A Brno OPEN intent reserved onto a Prague game is still a reserve in Brno’s lobby. Cross-city does not add a new steal path.

### Chat contacts

`loadGlobalInvitablePlayers(browseCityId)` on browse change. `playersStore` global cache is keyed by `cityId`. Inbox directory state is **not** taken from the unkeyed users filter cache.

Empty: `browseCity.noUsersInCity` + hint to switch city or search a name. Do **not** dump nearby directories into contacts.

Contacts toggle still requires a city. Browse defaults to Home.

### Chat user-search (Users tab, query typed)

Three layers, in order, not mixed:

1. **Chats** — local threads/DMs matching the query. Unscoped.
2. **Users in {browse city}** — city directory (fetched once per browse city, then client-filtered). Not refetched on every keystroke.
3. If layer 2 is empty and query `≥ 2`: **Nearby** from `expandNearby` (second request). Wait until the directory fetch has finished before expanding.

Message hits stay below, unscoped.

### ClubModal (Venue)

Header chip = `locationCityId` (create-game) or current game city (edit location). Independent of Browse.

No query: `GET /clubs/city/:cityId`.

Query: `getForMap` loads on the **first** non-empty search (kept for the rest of that open). Hits in the current venue city first; other cities grouped under **city name** headers (not “Nearby”). Picking a club in another city:

1. Set `selectedClub`
2. Set Venue city = `club.cityId`
3. Clear courts / bookings / re-resolve TZ

Existing **saved** games: do not PATCH location from invite. Edit-location has the same venue chip. Create payload sends `cityId` when there is no club yet.

---

## Nearby expand (named people search)

### When

- Query length `≥ 2`
- Primary city people count is **0** on the server (not self, not already on this game, not busy)
- Surface is Invite Search or Chat Users search
- `expandNearby=1` (client sends this only on those surfaces)

Invite gender/level chips and game gender lock filter the rows after fetch. They do not cause the server to expand if the city still had hits.

### When not

- Contacts with no query
- Looking
- Chat threads / messages / bugs / market / channels
- Club list with no query
- Primary city already has hits

### Algorithm (server)

Anchor = browse city’s `latitude`/`longitude`. If missing, skip expand (return empty nearby).

Candidate pool: active `isCorrect` cities with coords, exclude self.

Sort:

1. Same `administrativeArea` (or `subAdministrativeArea` if set) — metro cluster (Barcelona / Sant Cugat / Castelldefels; Prague / Kladno if tagged)
2. Same `country`
3. Haversine km

Keep if:

- Same country and `km ≤ 80`, or
- Different country and `km ≤ 30` (Geneva–Annemasse, Basel–Weil)

Take **3**. For each, run the same name search (same `take` cap is unnecessary; `take: 20` per nearby city is enough — this is a miss fallback, not a second directory).

Return:

```ts
{
  cityId: string;
  players: InvitablePlayer[];      // primary city, possibly []
  nearby: Array<{
    cityId: string;
    name: string;
    country: string;
    km: number;
    players: InvitablePlayer[];
  }>;
}
```

Do not run nearby queries if primary `players.length > 0`.

### UI

```
No one in Prague for “Jan”
Nearby
  View Kladno →
  Jan Novak · Kladno · 25 km
  View Brno →
  Jan Dvořák · Brno · 187 km     ← excluded by 80 km cap; would not show
```

If all nearby also empty: “No one nearby for “Jan”. Try another city.” Chip still there.

**View {city}** sets Browse and re-runs the query in that city (sticky). The nearby block then disappears because primary has hits (or is the new empty city).

Do not auto-switch Browse when nearby hits appear (Tinder does not teleport you because someone matched in the next town).

### Worked examples

**Prague → Kladno, typed “Jan”**  
Prague 0 hits, Kladno 25 km same country → Nearby section. User taps View Kladno → Browse = Kladno, further typing stays there.

**Prague → Brno, typed “Jan”**  
~185 km, over 80 km cap. No auto Brno. User must chip → Brno (the job “Jan moved to Brno”). Nearby is metro spillover, not a national people search.

**Barcelona → Sant Cugat, typed “Maria”**  
If both are tagged the same `administrativeArea`, Sant Cugat ranks before a farther same-country city even if km is similar to others. Discrete city lists stay clean until the miss.

**Madrid → Lisbon, typed “João”**  
Different country, ~500 km. No nearby. Chip to Lisbon.

**Basel → Weil am Rhein**  
~10 km, different country, under 30 km border exception. Nearby may include Weil.

**Empty Looking in Prague**  
No nearby. Chip is the move. (A teaser count is v2.)

---

## Cross-city invite semantics

Inviting a Brno user to a Prague game is allowed. That is the point of Browse.

- Search: unlinked or linked by existing invite rules (Looking reserve only when they have an OPEN intent **in the browse city** and not in a proposal).
- Do not rewrite their `currentCity`.
- Create-game: invited IDs stay on the draft regardless of later Browse hops; they may vanish from the new Looking list (same as today’s vanished-selection, minus toast unless they were a looking selection that disappeared from the **current** pool).

Timezone: Looking date keys are in **Venue/game TZ**, play intents in **intent city TZ**. Cross-city around midnight can dim the dates dot. Accept it; do not convert the game into the browse TZ.

---

## State, cache, API

### `useBrowseCityStore`

```
cityId: string | null          // null → treat as home
recents: string[]              // max 3, exclude home
snapshots: Record<id, { name, country }>
setCityId(id, snapshot?, homeCityId?)  // picking home stores cityId null and drops it from recents
resetToHome({ clearRecents? })         // profile switchCity keeps recents; logout clears them
```

`sessionStorage` key `bandeja.browseCity` (JSON). Same-tab family only. Do not sync via profile.

Home `switchCity` → `resetToHome()`. Logout → `resetToHome({ clearRecents: true })`.

### `playersStore.fetchPlayers`

Inflight/cache key includes `cityId` and `expandNearby`. Global no-game cache is per city. Chat directory is owned by `useChatInbox` fetch keyed to the resolved browse city — do not overlay unkeyed inbox filter-cache `cityUsers`.

### Endpoints

- `GET /users/invitable-players` — optional `cityId`, optional `expandNearby=1` (runs only when `search` is present **and** primary city returned 0 people)
- `POST /play-intents/invite-pool` — optional `cityId` on `{ gameId }`; draft uses `draft.cityId ?? viewer.currentCityId`
- `forGame`: score game; populate from override `cityId` when present; skip home===game guard when `cityId` set
- Clubs: `GET /clubs/city/:id` + client `getForMap` (lazy on first typed query)

Auth: any authenticated user may browse any active city. Blocked users still excluded.

---

## Files

**Frontend:** `store/browseCityStore.ts`, `hooks/useResolvedBrowseCity.ts`, `hooks/useNearbyPeopleSearch.ts`, `hooks/useClubVenuePicker.ts`, `components/browseCity/*`, `components/clubPicker/ClubVenueList.tsx`, `i18n/locales/*/browseCity.json`

**Backend:** `controllers/user/social.controller.ts` (`cityId`, `expandNearby`), `services/user/nearbyCities.ts`, `playIntentInvitePool.service.ts` (`browseCityId`)

---

## UI tests

Catalog: `docs/UI_TEST_PLAN.md` — `GD-153`–`GD-157`, `C-59a`–`C-59d`, `CH-07a`–`CH-07d`, `PR-19`.

Do not treat Find / city channel as covered — they stay Home.

---

## What not to do

- Do not call `switchCity` from invite, chat, or club pick
- Do not add a third invite tab
- Do not put the chip in the invite title row
- Do not nest Dialog-on-Dialog for city pick
- Do not make `ClubModal` a people search
- Do not auto-expand Looking or an empty contacts directory
- Do not silently change browse city when nearby hits appear
- Do not search every city for people (no global people scan)
- Do not drive Find, My, weather, or city group chat from Browse
- Do not default ClubModal to Browse city
- Do not use device GPS as the nearby anchor (use the city you are already browsing)
- Do not use a radius query as the default people list (Meetup Dallas problem)
