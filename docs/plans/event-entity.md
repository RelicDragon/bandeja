# Event entity type

Plan for a new `Game.entityType`: **Event** — a plain community listing for camps and **external** tournaments/leagues Bandeja does not run.

In progress.

## Why

1. Let Bandeja people find a partner (by Bandeja level) to join an off-platform camp/tournament/league together.
2. Let organizers advertise that gathering to the city community.

Bandeja is the bulletin board and the trusted-level partner market. Play happens elsewhere.

## What it is (and is not)

| | Bandeja `TOURNAMENT` | Event |
|---|---|---|
| Who runs play | Us (brackets, scores) | Them (off-platform) |
| Roster | Official slots | Who from Bandeja is going / needs a partner |
| Rating / results | Yes | Never |
| Join meaning | Play here | RSVP / looking |

Reuse `TOURNAMENT`, `LEAGUE`, or `BAR`? **No.** `TOURNAMENT` / `LEAGUE` imply Bandeja-run play. `BAR` is a simplified social session still hosted here (hall, occupancy-ish, bar results). Event has no score, no court booking, no rating.

**Model:** new `EntityType` on `Game`, not a parallel listings table. Find, Home, chat, invites, share, stories, calendar already key off `Game`.

**Glossary:** `APP_FUNCTIONALITY.md` §2.1 uses “event” for any `Game` row. Product name **Event**; enum **`EVENT`**. Kind is a required field on that row, not more `EntityType`s.

## Event kinds

One entity (`EVENT`). Required `eventKind` — closed set, no `OTHER`:

| `eventKind` | UI | What it is |
|---|---|---|
| `TOURNAMENT` | Tournament | External tournament (not Bandeja brackets/scores) |
| `LEAGUE` | League | External league / season (not a Bandeja `LEAGUE_SEASON`) |
| `CAMP` | Camp | Camp / clinic / training week off-platform |

Create: kind chips are required (first control after the organizer vs looking intent). Card, details, Find strip, and calendar show that chip. Copy always “external” where it could collide with Bandeja Tournament / League (`External tournament`, `External league`).

Same listing + Going / Need partner for all three. Partner board matters most for tournament/league doubles; keep it on camp too (travel buddy / hitting partner).

Do not add `EntityType.CAMP` or extra types per kind.

## Decisions

| Topic | Choice |
|---|---|
| Storage | `Game` + `EntityType.EVENT` |
| Kind | Required `eventKind`: `TOURNAMENT` \| `LEAGUE` \| `CAMP` |
| Who creates | Any logged-in user (you need not be the official organizer) |
| Visibility | Public after admin `APPROVED`. Create is `ON_APPROVE` (owner + `isAdmin` only). No public/private toggle |
| Join | Always `allowDirectJoin`. Owner is not a registrar |
| Chat | Always on for Going + Looking |
| Rating / results | Never. No `resultsByAnyone`, live scoring, bets, photos-after-FINAL |
| Booking / courts | None required. Optional club **or** free-text venue |
| Format / templates | None. Do not add league/playoff template tiers (§2.2) |
| Sport | Required. Sport picker when the user has multiple sports enabled (same as create-game); single-sport users skip the picker |
| Level band | Keep the GAME player-level control (`minLevel` / `maxLevel`) on create and edit. Shown on card/details. Find suitable-rating / level filters apply (unlike BAR). Not a hard join lock |
| Occupancy | Unbounded Bandeja roster (BAR-style cap, not official tournament size) |
| Find river | Events **out** of the game list by default |
| Find distribution | Compact **Events** poster rail below the calendar when the city has upcoming Events; filter chip **Events**, off by default |
| Play intent / radar | Skip like `TRAINING`. Do not `GAME_MATCHES_INTENT` |
| Archive | Time-based after `endTime` (BAR-like). Never results-`FINAL` |
| Partner v1 | Board + DM. No matching algorithm, no pair graph |
| Create UI | Dedicated `/create-event`. Do **not** extend `CreateGame.tsx` |
| Engineering | Shared **capability registry** so EVENT/BAR are not another 100-way `if` |

## Listing fields

- Avatar, name, description
- Sport (required; picker if multiple sports enabled)
- Player level range (`minLevel` / `maxLevel` — same setting as GAME create, not omitted)
- City
- Dates: `startTime` / `endTime` (multi-day)
- Price: reuse `priceTotal` / `priceType` / `priceCurrency`
- Venue: optional club (playing club, not `isBar`) **or** free-text (`venueText`)
- Optional registration URL (`externalUrl`)
- Required `eventKind` (`TOURNAMENT` / `LEAGUE` / `CAMP`)

Create defaults: `isPublic=true`, `allowDirectJoin=true`, `affectsRating=false`, `resultsByAnyone=false`, `timeIsSet=true`, huge `maxParticipants`, no courts, city required.

## Participation

Do not fake looking with `IN_QUEUE` (that is owner approval).

| State | Persistence | Meaning |
|---|---|---|
| Going | `PLAYING` | I’ll be there |
| Need partner | `GameParticipant.lookingForPartner` | I want this; not a pair yet |

Looking XOR Going. After they find someone, they switch to Going (v1: manually).

## Creator intents (create step 1)

1. **I’m organizing** — ad only; owner is not auto-Going. The listing still appears on My/calendar because they own it.
2. **I want to go / need a partner** — same listing; owner lands on the partner board (opt-in).

Helper copy: *You don’t need to be the organizer.* That is how goal 1 works when nobody from the club has posted yet.

## UX

### Create menu

New row **Event/Ad** (e.g. `CalendarDays`, violet/indigo — not tournament red / league blue / training green / bar yellow). Same label-only row as Tournament; no subtitle.

### Create (`/create-event`)

Short poster form, not the game wizard: required kind chips (Tournament / League / Camp) → sport (picker only if the user has multiple enabled sports) → player level range (same control as GAME) → avatar+name → description → city → venue (club or text) → date range → price → optional link.

No public / results / rating / court / template / gender-occupancy blocks. Do not drop sport or level the way BAR drops level.

### Find

Do not dump ads into the game river. Compact **Events** poster rail (2–3 upcoming city cards) **below the calendar** when upcoming `EVENT`s exist. Chip **Events**, off by default. **See all** turns that chip on.

### Card

Poster, not a match card: large avatar, kind chip (`Camp` / `External tournament` / `League`), sport, level band, name, date range, venue, price, `12 going · 3 need partner`. No `3/4` slots, no format tag, no “Join to play.” Date tile may stay for calendar rhythm; avatar replaces the type glyph.

### Details (`/games/:id`)

Landing page, not a match hub. Hero cover/avatar, kind, sport, level band, name, organizer, dates, venue, price, description, **Register** if URL. Sticky CTAs: **I’m going** / **Need a partner** / Share.

Partner board **above** Going:

- Empty: “Need a partner for this? Post here. People will see your Bandeja level.”
- Row: avatar, name, level, optional note, **Message**.
- Composer on Need partner: optional one-liner (side / level wish).

Going = compact avatar row + levels. Owner edits the listing (same fields as create), cancel/delete. Hide Game Settings, results, live, bets, courts, trainer.

### My / calendar / reminders

Show if the user is OWNER, Going, or Looking. Organizing is not auto-Going. Reminders 24h/2h while `ANNOUNCED` + `timeIsSet` for Going/Looking. After `endTime`, time-archive.

### Share / stories

Listing link + avatar OG. Reuse promo story for organizers.

### Chat

Auto thread for Going + Looking. DMs for pairing.

## Data / engineering

1. Enum migration for `EntityType.EVENT` (own migration; Postgres `ALTER TYPE … ADD VALUE` must not share a transaction with first use).
2. Columns: required `eventKind` (`TOURNAMENT` \| `LEAGUE` \| `CAMP`, filterable); `venueText`, `externalUrl` (prefer columns if Find will filter).
3. `GameParticipant.lookingForPartner`.
4. Shared `entityCapabilities`: `hasResults`, `hasRating`, `hasBooking`, `hasLevelGate`, `hasOccupancy`, `hasPlayIntentRadar`, `hasPartnerBoard`, `archiveByTime`, … Wire EVENT and BAR through it.
5. Dedicated `CreateEvent` + Event sections in the existing game-details shell.
6. Exclude from games-played, rating activity, organize trophies, play-streak, `gamesTogetherCount` (same family as BAR / `LEAGUE_SEASON`).
7. Blast radius: every `EntityType` switch (Find chips, calendar dots, Telegram cards, subscriptions, create menu, i18n). Budget as explicit work.

## Do not build in v1

Official registration, payments, waitlists, owner approve/reject, Bandeja brackets/scores, play-intent matching, “pair with” graph, UserTeam auto-attach, `OTHER` kind, extra `EntityType`s per kind, stuffing Event into `CreateGame.tsx`.

## Ship order

1. Enum + capabilities + create defaults + exclude from rating/results/radar.
2. Create Event + listing details (no partner board yet) + Find strip/chip + card theme.
3. Going RSVP + chat + calendar + reminders.
4. Partner board + Message (goal 1).
5. Share / OG / stories.
6. `docs/UI_TEST_PLAN.md` rows: create, Find strip, going, looking, no-results, tournament-vs-event copy.

Highest-risk UX failure: people create a Bandeja **Tournament** when they meant an ad, or tap Event thinking they will play on Bandeja. Create-menu subtitle and the poster card (no slots, “need partner”) prevent that more than the schema.
