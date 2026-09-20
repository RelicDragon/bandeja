# Security fixes — PRD 345 (recurring game series)

Scope: every finding in `docs/plans/prd-345-357/reports/critic-security.md` tagged PRD 345 / `gameSeries`.
No schema or migration file was touched. No heavy command was run.

New shared module: `Backend/src/services/gameSeries/gameSeriesAccess.ts` — every series
authorization rule as a pure, fail-closed predicate, so the service, the controller and the
push-action handler share one definition instead of three hand-rolled `if`s.

---

## 1. [BLOCKER] Self-add as a "regular" → private game + private chat compromise

**Attack it enabled.** `GET /games/<anyGameId>/series-next` (authenticated only, no viewer
check) handed a stranger the `seriesId`, the `ownerId`, the next occurrence's `gameId` and
every regular's name/avatar. `POST /series/<id>/regulars` with an empty body then self-added
them to the roster, because `addRegular` skipped `assertSeriesOwner` whenever
`actorId === targetUserId` and the controller defaults the target to `req.userId`.
`POST /games/<nextId>/series-next {"action":"accept"}` then seated them `PLAYING` through
`acceptSeat`, which checked only `maxParticipants` — no `validatePlayerCanJoinGame`, so the
level band, `isPublic`, `allowDirectJoin` and the gender rule were all bypassed. Finally
`POST /series/<id>/chat` synced them into the private group channel.

**Fix — the whole chain, not just the entry point.**

| Link | Fix |
|---|---|
| `addRegular` | Now calls `assertSeriesOwner` for **every** caller, self-add included. The `actorId === targetUserId` shortcut is gone; the doc comment says why it must not come back. |
| `removeRegular` | Keeps self-removal (PRD 345 user story 18) but via the explicit `canRemoveSeriesRegular` predicate, documented as the one safe self-referential action — it removes privileges, never grants any. |
| `acceptSeat` entitlement | `evaluateSeriesSeatClaim` requires an **active** `GameSeriesRegular` row (`removedAt === null`) or the series owner, an `ACTIVE` series, and `requestedGameId === nextOccurrenceId` where the next occurrence is re-resolved **server-side** by `nextOccurrenceOf()`. An out-of-band gameId from a push token is refused with `errors.series.notNextOccurrence`. |
| `acceptSeat` join rules | The seat is now created behind `validatePlayerCanJoinGame`, which runs `validateGameCanAcceptParticipants`, the level band, `validateGenderForGame` and `canAddPlayerToGame` — the same gate `ParticipantService.joinGame` uses. Being a regular skips the *invite*, never the rules of the game. `ApiError`s are mapped back to a `PushActionResult` so the push/Telegram paths still answer cleanly. |
| `acceptSeat` concurrency | The transaction now takes `SELECT id FROM "Game" WHERE id = … FOR UPDATE` before re-reading the roster (house pattern from `gameTeam.service.ts`). Closes the separate `[MINOR] acceptSeat's in-transaction capacity re-check buys nothing`. |
| `GET /games/:id/series-next` | `getSeriesContext` now takes the viewer's admin flag and gates the whole `next` block (owner id, next occurrence id, roster names/avatars, confirmation counters) behind `isSeriesInsider`: owner, platform admin, active regular, or a participant of this occurrence. The `label` stays public — PRD 345 user story 10 wants a newcomer to see "Weekly · Tuesdays 19:00", and the same label is already on every public Find card via `gameSeriesCardEnricher`. |
| `GET /series/:id` (**not in the report, same class**) | `getSeriesDetail` had no authorization at all and returns the full regular roster, the occurrence **cards for private games**, and the group-channel id. It now 403s (`errors.series.notAMember`) for non-insiders, and the check runs **before the 60 s per-viewer cache read** so a revoked membership cannot keep serving a warm entry. `groupChannelId` is additionally narrowed to actual chat members (owner/admin/active regular), since a one-off occurrence participant is not synced into the channel. |

**Files touched**
- `Backend/src/services/gameSeries/gameSeriesAccess.ts` (new)
- `Backend/src/services/gameSeries/gameSeries.service.ts`
- `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts`
- `Backend/src/controllers/series.controller.ts`

**Regression test:** `Backend/src/services/gameSeries/gameSeriesAccess.test.ts` (pure, `node:assert`,
`ts-node`). Asserts, step by step against the report's exploit: a stranger cannot manage the roster
even when actor === target; an unresolved/empty actor fails closed and two empty ids do not compare
equal into ownership; a stranger is not a series insider; a removed regular loses insider status; a
non-regular seat claim is refused; a **real regular pointing at an out-of-band gameId** is refused;
an ended series and a missing next occurrence refuse every claim; self-removal still works.

---

## 2. [BLOCKER] `ensureSeriesChat` leaked the group-channel id

**Attack it enabled.** The `if (series.groupChannelId)` early return synced members and returned
`{ groupChannelId }` *before* `assertSeriesOwner`, so the owner check only ever ran on first
creation. Any authenticated account could `POST /api/series/<anyId>/chat` and get the private
channel id of any series that already had a chat.

**Fix.** `assertSeriesOwner` moved to the first statement after the series loads — ahead of every
side effect and every return of an id. The already-created branch is now unreachable without
ownership. Comment added stating the ordering is the point.

**File touched:** `Backend/src/services/gameSeries/gameSeries.service.ts`.

**Regression coverage:** the same `gameSeriesAccess.test.ts` asserts `isSeriesManager` — the single
predicate the assertion is built on — refuses strangers, empty actors and `''`-vs-`''` ids. (The
ordering itself is a two-line structural change; a DB round trip to prove it would need a
`*.integration.test.ts` fixture that the suite does not currently have for series.)

---

## 3. [MAJOR] Carry-over prompt had no persisted dedupe

**Failure it enabled.** `onOccurrenceFinalized` is re-fired by `recalculateGameOutcomes`, which
runs on every score correction (`POST /results/game/:id/recalculate`), every
`update.service.ts` results edit and every late substitution. The only guard excluded regulars
already `PLAYING` on the next occurrence, so a regular who simply ignores the prompt was re-pushed
and re-Telegrammed on every edit.

**Fix.** A persisted, atomic, one-shot claim: `claimCarryOverFanOut()` does a conditional
`UPDATE "Game" SET metadata = jsonb_set(…, '{seriesCarryOver}', …) WHERE id = $1 AND
COALESCE(metadata->'seriesCarryOver'->>'nextGameId','') <> $2`. The affected-row count **is** the
claim, so two concurrent finalizations cannot both win, and it survives a restart. The claim is
taken **before** the fan-out (crash ⇒ a dropped prompt, which is recoverable; the other ordering
spams a roster). Keying the marker on the offered `nextGameId` keeps the legitimate case working:
if the organizer skips that occurrence and the generator materialises a different one, the id
differs and a fresh prompt is allowed.

Also fixed on the same path (second half of that finding): the gate `game.resultsStatus !== 'FINAL'
&& game.status !== 'FINISHED'` dropped the `Game.status` branch. `Game.status` is clock-derived and
`docs/product/constraints.md` forbids gating a state-changing path on it — and this path *creates
games* via `generateForSeries`. The gate is now `resultsStatus === 'FINAL'` only.

**Files touched:** `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts`.

**Could not fully close:** see "Residual risk / needs a column" below.

---

## 4. [MAJOR] Series generation pushed the whole city before the uniqueness stamp

**Failure it enabled.** `GameCreateService.createGame` commits and immediately fires
`sendNewGameNotification` + `PlayIntentMatchQueueService.drain()`. Only afterwards did
`stampOccurrenceOrRollback` write `(seriesId, seriesOccurrenceDate)`, hit `P2002` and delete the
game. Two nodes generating the same date both blasted the city-wide push; the loser's game was
deleted, so every matching play-intent user was deep-linked to a 404. The `inFlightSeriesIds` `Set`
is per-process and does not help.

**Fix.** `createGame` gained an optional 4th argument `GameCreateOptions` with
`deferDiscoveryAnnouncement?: (announce: () => void) => void`. When supplied, the existing
notify-and-drain block is handed over as a thunk instead of being fired; the existing gate
(`isPublic`, not LEAGUE/LEAGUE_SEASON/EVENT) is untouched and not duplicated. Every other caller is
unchanged — the parameter defaults to `{}`, so behaviour is byte-identical without it.
`gameSeriesGeneration.service.ts` captures the thunk and runs it **only after
`stampOccurrenceOrRollback` returns true**. Never running it (rollback, or an early `continue`)
means nobody is notified — the safe direction.

**Files touched:** `Backend/src/services/game/create.service.ts`,
`Backend/src/services/gameSeries/gameSeriesGeneration.service.ts`.

---

## 5. [MINOR] `closeExpiredSeries` used a UTC cutoff against club-local day keys

**Failure it enabled.** For a club west of UTC the bulk `updateMany` flipped a series to `ENDED`
while its final local day was still in progress, suppressing that day's occurrence and every prompt
attached to it.

**Fix.** The bulk pass has no timezone to compare against, and real offsets span UTC−12…UTC+14, so
the cutoff is pulled back one further day: a series is only bulk-closed when `endsOn` is
unambiguously past everywhere. The precise, timezone-aware close stays in
`generateForSeriesUnguarded` (`endsOnDayKey < todayDayKey` in club-local terms), which the same
daily scheduler pass runs for every active series immediately afterwards. Closing a day late is
invisible; closing early silently deletes a final occurrence.

**File touched:** `Backend/src/services/gameSeries/gameSeriesGeneration.service.ts`.

---

## Residual risk / could not fully close

1. **The carry-over dedupe marker lives in `Game.metadata`, which is client-writable.**
   `metadata` is in `GAME_UNCHECKED_SCALAR_KEYS` (`update.service.ts`) and is *not* in
   `GAME_RESULTS_LOCKED_FIELDS`, so a game owner/admin could `PATCH` the game with a `metadata`
   value that drops `seriesCarryOver` and then re-trigger a recalculation to re-prompt their own
   regulars. The frontend never sends `metadata`, so this needs a crafted API call by someone who
   already owns the game. **This wants a real column** — `Game.seriesCarryOverPromptedFor String?`
   (or a `GameSeriesPromptDelivery` table keyed `@@unique([gameId, userId])` for per-recipient
   granularity). I was not allowed to edit `schema.prisma`; `metadata` was the best available
   persisted JSON state field (`resultsMeta` has the same writability, `weatherAlertState` belongs
   to PRD 357, and `PlayIntentNotificationDelivery` is drained by a worker so writing rows there
   would actually *send* something).
2. **`getSeriesDetail` now 403s for non-insiders.** Insider = owner, platform admin, active
   regular, or participant (any status) of any occurrence. If the product wants a stranger who taps
   the `↻ Weekly` pill on a public Find card to land on a partial public series page, that needs a
   second, projected payload — the current one is not safe to serve publicly (it contains private
   occurrence cards). Flagging because it is a behaviour change beyond the literal report finding.
3. **`declineSeat` still tells any authenticated caller whether a given gameId is a series
   occurrence.** It records nothing and mutates nothing; left as-is (a game-existence oracle of the
   same grade as several pre-existing endpoints).
4. **Not verified by execution.** Per the brief I ran no builds, typecheck, lint or tests. The new
   raw SQL (`jsonb_set` claim, `SELECT … FOR UPDATE`) follows existing house usage
   (`gameTeam.service.ts`, `achievementLeaderboard.service.ts`) including the unqualified `"Game"`
   table name, but it has not been executed against Postgres.

## New i18n error keys (backend-side, no locale files carry `errors.series.*` today)

- `errors.series.notNextOccurrence` — seat claim aimed at a game that is not the resolved next occurrence.
- `errors.series.notAMember` — non-insider reading `GET /series/:id`.
- `series.seatRefused` (error `code` only) — the ordinary join validation refused the seat.

## Test files added

- `Backend/src/services/gameSeries/gameSeriesAccess.test.ts` — pure, `ts-node --transpile-only`,
  no DB. Suggested wiring: append to the existing series test script alongside
  `gameSeriesEditScope.test.ts` / `gameSeriesOccurrenceDates.test.ts`.
