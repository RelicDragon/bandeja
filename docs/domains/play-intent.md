# Play intent

A city/sport (or BAR) wish to play. One OPEN/MATCHED intent per user+city (partial unique index). Home city only for lobby; Browse city for invite Looking population.

## Lifecycle

`PlayIntentStatus`: `OPEN` → `MATCHED` (proposal member or reserved by linked invite) → `CONSUMED` / `EXPIRED` / `CANCELLED`.

Only a **PLAYING** join consumes a reachable looking intent (`playIntentPlayingJoin.ts`). `IN_QUEUE` does not. Consume detaches from a PENDING/ACCEPTED proposal. Ask-to-join / overlap-cancel keep looking.

Compose: sport GAME intent or BAR intent from Find/My strip (`PlayIntentFindBar` / `PlayHeroButton`). Hidden for spectators and while a real PENDING/ACCEPTED proposal is open. Direct-match editor (no proposal) still shows games.

## Court lobby radar ≠ PoolMember

`GET /play-intents/pool` returns people (`PoolMember` physics) **and** `matchingGames[]` (circular nodes, not stuffed into members). Missing array → `[]`. Cap 4 (`MATCHING_GAMES_VISIBLE_CAP`).

`listMatchingGamesForIntent` / `playIntentMatchingGames.ts`:

| Intent | Radar entity types |
|--------|-------------------|
| Sport (not BAR, not EVENT) | `GAME` + `TOURNAMENT` |
| BAR | `BAR` only |
| EVENT | none |

Skip: TRAINING, leagues, EVENT, private, no `timeIsSet`, full (no PLAYING slot), owner, already PLAYING / INVITED / IN_QUEUE. MIX_PAIRS: viewer gender seat must be free.

Rank: direct join first, soonest start, more open slots, `gameMatchScore`, `id`.

`allowDirectJoin` is chrome + CTA only (`Join` / `Ask to join`). A free PLAYING slot is required either way. Queue-only games stay on radar when a slot is free.

## Notify ≠ radar

`GAME_MATCHES_INTENT` (`matchIntentToGames`) is **GAME/BAR only** (not TOURNAMENT/TRAINING/EVENT). A fitting tournament can appear on the radar without a game-fit push. Delivery is transactional per event+user+channel, revalidated, backoff, deduped — not fire-and-forget.

## Live

Socket `play-intent:invalidate` (`PLAY_INTENT_INVALIDATE_EVENT`). Reasons include intent/proposal lifecycle and `matching-games-changed` (public GAME/TOURNAMENT/BAR create, roster, invite, update, cancel). 2 min poll + focus/reconnect backup on lobby; invite Looking uses 30s refetch.

## Invite Search \| Looking

Different surface from Find radar. `PlayerListModal` tabs. Population = Browse city + sport + entity (`POST /play-intents/invite-pool`). Fit = Venue/game (5-dot strip, not arena). OPEN+not-in-proposal → reserve + `playIntentId` on invite. MATCHED/in-proposal → unlinked invite, no steal.

## Telegram `/play`

The bot creates intents through `PlayIntentService.createOrReplace`, never by writing `PlayIntent` directly, so it inherits every rule above for free: one OPEN intent per city/sport, date keys resolved in the **city** timezone, the expiry window, and every downstream queue. Group `/play` posts a "looking to play" card whose **I'm in too** mirrors the poster's day and time window into an intent for the tapper, in the *tapper's* own city and sport. Wizard shapes and callback prefixes: [notifications.md](./notifications.md).

Organizer push `INTENT_PLAYERS_FOR_GAME` ("{n} looking for this time … Tap to invite them") opens `/games/:id?invite=looking`: the game page opens the invite modal on its Looking tab when the viewer can invite, then drops the param.

Spot-opened notifications also read intents (an OPEN intent matching a game whose seat just freed is one of the audience buckets) but never write them, and `GAME_MATCHES_INTENT` semantics are untouched — [games.md](./games.md).

## AI assistant (slice 9a)

`get_my_play_intent` / `list_play_intent_matches` / `set_play_intent` / `cancel_play_intent` read the pool service and write through `PlayIntentService.createOrReplace` / `cancel` like `/play` does, home city only; matches are additionally filtered to games the agent may show. Details: [agent.md § Play intent](./agent.md#play-intent-slice-9a-toolsplayintenttoolsts).

## Looking count (PRD 363)

`GET /play-intents/count?cityId&sport` → `{ count, dayKeys }` (`authenticate`; scope defaults like `/pool`). `PlayIntentLookingCountService`: distinct users with a GAME intent in `OPEN | MATCHED`, not expired, not consumed by a seat, a date key inside `playIntentDiscoveryDateKeys(city.timezone)` (today, or today + tomorrow after 18:00), whose window is still reachable (`intentWindowIsReachable`) and who are not already PLAYING in a game on those days (`usersBusyPlaying`, the pool's `inGame`). Reads intents only — no proposal, no physics, no per-viewer block filtering. The user-id list is cached **60 s** per `(city, sport, window)` (Redis when configured, else in process; `play-intent:invalidate` does not bust it) and the viewer is subtracted after the cache. `count: null` only while `PlatformSetting.FIND_LOOKING_COUNT_ENABLED` is explicitly `false` — the feature is on by default (`getBooleanSetting(key, true)`, 60 s in-process cache). The client hides it below three (`Frontend/src/components/home/lookingCount.ts`); surfaces in [home-and-find.md](./home-and-find.md).

## Demand slots ("4 at your level want Tue · Evening")

The cluster matcher needs a full roster (padel: 4) that is pairwise compatible at once; a one-city pool rarely gets there (prod, Sep 2026: 2–3 people per day at the peak, 1 proposal in 30 days). Demand slots turn the same intents into actions.

`GET /play-intents/slots?cityId&sport` (`PlayIntentDemandSlotsService`, pure bucketing in `playIntentDemandSlots.ts`): OPEN GAME intents in the city + sport (not MATCHED — a link would not reserve them), not expired, not consumed, window reachable, not blocked either way, not PLAYING that day. Each intent lands in every day (today .. today+2) × part of day it covers — MORNING 06–12 / AFTERNOON 12–18 / EVENING 18–24; ANYTIME covers all three, custom hours count when they cover ≥ 60 min of a part. Today's part is offered while ≥ 90 min remain. Per member `fitsViewer` = both level bands, level within 0.5, gender preference, and — when the viewer is looking — the viewer's band and clubs. Slots rank by fit count, count, day, part; cap 6, members cap 8 (fitting first). `clubIds` is the clubs every fitting member accepts (`[]` any, `null` disagree). `viewerIntentId` is the viewer's OPEN intent only. Uncached, per viewer; keyed under the pool query on the client so pool invalidations refresh it.

Surfaces (`DemandSlotsSection`, helpers in `components/playIntent/demandSlots.ts`):

- **Compose sheet** (new intent only) and **lobby** lead with "Who's waiting": one card per slot with faces, "{n} at your level", "{n} more to fill" / "Full game with you".
- **Create & invite** opens `/create-game` with the day, the part's usual start (09:00 / 14:00 / 18:00, pushed to the next half hour ≥ 1 h out when today's has passed), 90 min, public, party size, the single shared club if any, a level band covering host + invitees, and the at-your-level members (all members when none fit) invited. A viewer whose OPEN intent covers the slot creates as host (`playIntentSource` DIRECT); anyone else creates normally and the invites carry `playIntentId` (`invitePlayIntentIds` state → `initialInvitePlayIntentIds`), which reserves still-OPEN intents.
- **I'm in** (spectators only) creates an intent for exactly that day + part through `POST /play-intents` — joining a 3-person slot is what lets the matcher form a proposal.
- **Find idle card / My hero hint**: "{n} at your level want {when}" when a slot has ≥ 2 fitting people (beats the looking count). **Looking strip**: "{n} more want {when} — tap to make it a game" when the viewer's own slot is shared.

## Code

BE: `Backend/src/services/playIntent/*`, routes `/play-intents`. FE: `api/playIntents.ts`, `components/playIntent/*`, `components/playerInvite/*`.
