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

Visual/live: `docs/plans/lobby-radar-matching-games.md`.

## Notify ≠ radar

`GAME_MATCHES_INTENT` (`matchIntentToGames`) is **GAME/BAR only** (not TOURNAMENT/TRAINING/EVENT). A fitting tournament can appear on the radar without a game-fit push. Delivery is transactional per event+user+channel, revalidated, backoff, deduped — not fire-and-forget.

## Live

Socket `play-intent:invalidate` (`PLAY_INTENT_INVALIDATE_EVENT`). Reasons include intent/proposal lifecycle and `matching-games-changed` (public GAME/TOURNAMENT/BAR create, roster, invite, update, cancel). 2 min poll + focus/reconnect backup on lobby; invite Looking uses 30s refetch.

## Invite Search \| Looking

Different surface from Find radar. `PlayerListModal` tabs. Population = Browse city + sport + entity (`POST /play-intents/invite-pool`). Fit = Venue/game (5-dot strip, not arena). OPEN+not-in-proposal → reserve + `playIntentId` on invite. MATCHED/in-proposal → unlinked invite, no steal.

`docs/plans/player-invite-looking.md`.

## Telegram `/play`

The bot creates intents through `PlayIntentService.createOrReplace`, never by writing `PlayIntent` directly, so it inherits every rule above for free: one OPEN intent per city/sport, date keys resolved in the **city** timezone, the expiry window, and every downstream queue. Group `/play` posts a "looking to play" card whose **I'm in too** mirrors the poster's day and time window into an intent for the tapper, in the *tapper's* own city and sport. Wizard shapes and callback prefixes: [notifications.md](./notifications.md).

Spot-opened notifications also read intents (an OPEN intent matching a game whose seat just freed is one of the audience buckets) but never write them, and `GAME_MATCHES_INTENT` semantics are untouched — [games.md](./games.md).

## Looking count (PRD 363)

`GET /play-intents/count?cityId&sport` → `{ count, dayKeys }` (`authenticate`; scope defaults like `/pool`). `PlayIntentLookingCountService`: distinct users with a GAME intent in `OPEN | MATCHED`, not expired, not consumed by a seat, a date key inside `playIntentDiscoveryDateKeys(city.timezone)` (today, or today + tomorrow after 18:00), whose window is still reachable (`intentWindowIsReachable`) and who are not already PLAYING in a game on those days (`usersBusyPlaying`, the pool's `inGame`). Reads intents only — no proposal, no physics, no per-viewer block filtering. The user-id list is cached **60 s** per `(city, sport, window)` (Redis when configured, else in process; `play-intent:invalidate` does not bust it) and the viewer is subtracted after the cache. `count: null` while `PlatformSetting.FIND_LOOKING_COUNT_ENABLED` is off (read through `getBooleanSetting`, 60 s in-process cache). The client hides it below three (`Frontend/src/components/home/lookingCount.ts`); surfaces in [home-and-find.md](./home-and-find.md).

## Code

BE: `Backend/src/services/playIntent/*`, routes `/play-intents`. FE: `api/playIntents.ts`, `components/playIntent/*`, `components/playerInvite/*`.
