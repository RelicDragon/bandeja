# Games

`Game` is the universal event row. Discriminator: `entityType`. Every scheduled thing (match, bar, training, fixture, season hub, Event poster) is one `Game`. Product **Event** is only `EntityType.EVENT`.

Shell: `/games/:id` (`GameDetailsPage`). Overlay on MainPage. Chat: `/games/:id/chat`.

## Status

`Game.status` (`GameStatus` in `Backend/prisma/schema.prisma`): **`ANNOUNCED` | `STARTED` | `FINISHED` | `ARCHIVED`**. There is no `READY` or `PLAYING` game status.

Do not confuse:

| Name | Where | Values |
|------|--------|--------|
| Game status | `Game.status` | ANNOUNCED STARTED FINISHED ARCHIVED |
| Results status | `Game.resultsStatus` | NONE → IN_PROGRESS → FINAL |
| Participant status | `GameParticipant.status` | PLAYING (slots), IN_QUEUE, INVITED, GUEST, NON_PLAYING |
| League fixture UI | `timeIsSet` / `resultsStatus` | `SCHEDULED` / `NOT_SCHEDULED` (`leagueScheduleMyGameStatus.ts`) — not `GameStatus` |

Computed by `calculateGameStatus` (`Backend/src/utils/gameStatus.ts`); applied by `GameStatusScheduler` (`:00`/`:30` + startup). See [results.md](./results.md).

- `timeIsSet === false` → force `ANNOUNCED`
- `resultsStatus === IN_PROGRESS` → `STARTED`
- In scheduled window → `STARTED`
- Results-based types (`GAME`, `LEAGUE`, `TOURNAMENT`, `TRAINING`) are **not** auto-`FINISHED` by the scheduler
- `GAME`/`TOURNAMENT`: archive 7 days after `startTime` even without FINAL; FINAL path archives 2 club-TZ days after `finishedDate`
- Trainer is **`Game.trainerId`**, not a participant flag

`status` is derived, so it must never gate mutations: **`resultsStatus !== NONE` locks the roster, settings and format**, with `ARCHIVED` as a separate hard stop. Shared predicates in `Frontend/shared/gameMutationLock.ts` (`canMutateGameRoster`); see `docs/product/constraints.md`. A game past its start or end time with `resultsStatus === NONE` is still fully editable and joinable.

The one exception is **player substitution** while `resultsStatus === IN_PROGRESS`: `POST /games/:id/substitute-participant` hands one seat to a replacement (owner/admin, `participantSubstitution.service.ts`) so an injured player can be swapped out mid-game. The substitute inherits the seat and all results recorded for it; the roster size never changes.

## Entity types

| `entityType` | Meaning |
|--------------|---------|
| `GAME` | Standard match / social session |
| `TOURNAMENT` | Bracket-oriented defaults |
| `TRAINING` | Coach-led; `trainerId` |
| `BAR` | Bar meetup; auto-results on FINISHED |
| `LEAGUE` | Fixture under a season (`parentId` → `LEAGUE_SEASON`) |
| `LEAGUE_SEASON` | Season hub (tabs). `LeagueSeason.id` = this game id |
| `EVENT` | External camp/tournament/league listing. Kind: `eventKind` (`TOURNAMENT`/`LEAGUE`/`CAMP`). Caps: `Frontend/shared/entityCapabilities.ts` |

EVENT: no rating, results, live, bets, courts, or Game Settings. Created `eventApprovalStatus=ON_APPROVE`. Public Find/RSVP after `APPROVED`. Owner + `isAdmin` see pending; admin Approve/Decline.

Caps (booking, radar, partner board, unbounded roster, etc.): `getEntityCapabilities`. EVENT: `hasPartnerBoard`, `unboundedRoster`, `alwaysPublic`, `alwaysDirectJoin`, no results/rating/booking.

## Shell routing

`Frontend/src/pages/GameDetailsPage.tsx`:

| `entityType` | Content |
|--------------|---------|
| `EVENT` | `EventDetailsContent` |
| `LEAGUE`, `LEAGUE_SEASON` | `GameDetailsShell` `variant="league"` |
| else | `GameDetailsShell` `variant="game"` |

`GameDetailsShell` renders nothing but the decline-invite modal when `variant` and `entityType` disagree, so the two variants never overlap while the entity type resolves.

## Participation

Only `PLAYING` counts toward `maxParticipants`.

| Action | API | Notes |
|--------|-----|--------|
| Join | `POST /games/:id/join` | `allowDirectJoin` false → `IN_QUEUE` after gender check |
| Leave roster | `POST /games/:id/leave` | Owner cannot fully leave |
| Guest (chat-only) | `POST /games/:id/join-as-guest` | `GUEST` |
| Leave chat | `POST /games/:id/leave-chat` | |
| Queue accept/decline | owner/admin | `acceptJoinQueue` / `declineJoinQueue` |
| Cancel queue | `cancelJoinQueue` | |
| Invite | owner/admin or `anyoneCanInvite` | Search \| Looking; `canInviteToGame` |
| Kick | owner/admin | `kickUser` |
| Transfer ownership | owner | `transferOwnership` |
| Admins | `addAdmin` / `revokeAdmin` | |
| Toggle playing | `togglePlayingStatus` | Owner play/don't-play |
| EVENT RSVP | `POST /games/:id/event-rsvp` | `going` → PLAYING; `looking` → NON_PLAYING + `lookingForPartner` |
| EVENT leave RSVP | `DELETE /games/:id/event-rsvp` | |

Gender filter: `genderTeams` MEN/WOMEN/MIX_PAIRS. Fixed teams: `GameTeam` / `gameTeam.controller`. Guest is a **status**, not a `ParticipantRole`.

Play-intent consume: only `PLAYING` joins consume a looking intent. Queue does not.

A queued player is **not** frozen in the queue. `POST /games/:id/join` re-runs every gate for them: with `allowDirectJoin` true and a genuinely free seat they become `PLAYING` through the ordinary path (this is what the spot-opened push's "Join now" lands in). With `allowDirectJoin` false the join is refused with `spots.queue.waitForOrganizer` — seating is the organizer's call, through `acceptNonPlayingParticipant`.

### Spot opened and queue auto-fill

A freed **PLAYING** seat is a first-class event, not a side effect of whatever removed the player. Entry point: `GameSeatService.seatOpened(gameId, freedCount, cause, { freedByUserId? })` (`services/gameSeat/gameSeat.service.ts`). It **never throws** — every call site uses `void GameSeatService.seatOpened(...)`, so a notification problem can never surface inside a join or leave request.

| Trigger | Where | Cause |
|---------|-------|-------|
| `ParticipantService.leaveGame` (PLAYING branch) | `game/participant.service.ts` | `LEAVE` |
| `ParticipantService.togglePlayingStatus` (PLAYING → not playing) | same | `LEAVE` |
| `AdminService.kickUser` (target was PLAYING) | `game/admin.service.ts` | `KICK` |
| `InviteService.declineInvite` via `seatOpenedFromInviteDecline` | `invite.service.ts` | `INVITE_DECLINED` |
| `GameParticipantSubstitutionService.substitute` | `game/participantSubstitution.service.ts` | `SUBSTITUTION` |
| `GameUpdateService.updateGame`, `maxParticipants` raised | `game/update.service.ts` | `CAPACITY_INCREASE` |

The service **re-derives the truth** rather than trusting the caller: it returns early when the roster is locked (`canMutateGameRoster`), when the game is not `ANNOUNCED`/`STARTED`, when the start time has passed, or when there is no actually-open seat. That is why the substitution call is safe — the substitute inherits the seat, the PLAYING count is unchanged, and nothing fires. `seatOpenedFromInviteDecline` adds one more guard: an `INVITED` row never counted toward slots, so a decline only counts when playing + held invites exactly filled the game.

Side effects, in order: `Game.lastSeatOpenedAt = now` → socket `game-seat-opened` on `game-${gameId}` → chat system message `GAME_SPOT_OPENED` ("A spot opened (Luka left)") when the freeing user is known → auto-fill if `Game.autoFillFromQueue` → spot-opened notifications if a seat is still open afterwards ([notifications.md](./notifications.md)).

**Auto-fill.** Queue order is `joinedAt` ascending (there is no order column — see `GameReadService.computeJoinQueuesFromParticipants`). `selectAutoFillCandidate` walks the queue and takes the first player who passes `validatePlayerCanJoinGame(..., { targetIsOtherUser: true })`; a gate that throws counts as a rejection. The promotion reuses `ParticipantService.acceptNonPlayingParticipant`, so the roster write, the play-intent consume, the "joined" chat message and the game-update emit are byte-identical to a manual organizer accept. On success: socket `game-seat-filled`, chat message `GAME_SEAT_AUTO_FILLED`, and a "You're in!" push carrying `data.seatedFromQueue = '1'`.

> **The level gate is deliberately asymmetric.** `acceptNonPlayingParticipant` passes `skipLevelCheck: true` because an organizer accepting by hand is a conscious override. Auto-fill has no human in the loop, so it pre-checks the level range itself before delegating. Removing that pre-check would silently seat out-of-range players.

Card pill and sorting: [home-and-find.md](./home-and-find.md).

### Attendance

**Attendance is a courtesy signal, never a contract.** A player says whether they are coming so the organizer knows. That is the whole feature: nothing removes, demotes, penalises, auto-fills or reorders anyone based on an answer, there is no deadline, and there is no auto-release. The enforced allow-list is an invariant — see [constraints.md](../product/constraints.md).

`GameParticipant` carries `attendance` (`ParticipantAttendance`: `UNANSWERED` / `CONFIRMED` / `UNSURE`), `attendanceUpdatedAt`, `noShowNotedById` and `noShowNotedAt`. Only `status === 'PLAYING'` rows take part: trainers (`NON_PLAYING`), the queue and invitees are never counted and never get a dot.

**The organizer's implicit yes.** The owner is never asked — no card, no push question, no nudge, no watch prompt — and their PLAYING row reads `CONFIRMED` everywhere attendance is read, so a four-player game the owner plays in can reach 4/4. This is a **derivation, not a write**: `isImplicitlyConfirmedOwner` / `withOwnerImplicitAnswer` in `attendanceRules.ts` coerce at every DB boundary (`loadRoster`, the card enricher, the counter queries, the reminder filter) while the column keeps whatever the person actually answered, usually `UNANSWERED`. Deriving rather than storing is what makes the rule follow ownership instead of freezing at creation, and what makes it true for games that already exist. `role === 'ADMIN'` earns nothing here: only the owner made the game. An owner who is `NON_PLAYING` has no seat and no dot. A `POST /games/:id/attendance` from an owner (a stale client, a push tapped after a hand-over) writes nothing and answers `CONFIRMED`.

Eligibility is `timeIsSet` + `canMutateGameRoster` + `startTime > now` (`gameAcceptsAttendanceAnswers`). **Never `Game.status`**: a game created after its own `startTime` keeps `status: 'ANNOUNCED'` until it archives, so a status gate fails open and lets a player "confirm" a game that already happened.

| Route | Auth | Notes |
|-------|------|-------|
| `GET /games/:id/attendance` | `canAccessGame` | summary + per-player rows + nudge cooldown |
| `POST /games/:id/attendance` `{ state }` | participant, PLAYING only | idempotent |
| `POST /games/:id/attendance/nudge` | `canEditGameIncludingArchived` | max once per 6 h per game |
| `POST/DELETE /games/:id/participants/:userId/no-show` | `canEditGameIncludingArchived` | within 7 days of the game's **end** |
| `GET /games/me/no-show-notes` | `authenticate` | own notes only |
| `GET /games/me/attendance-rate` | `authenticate` | rate + 12-month series, own profile |

`canEditGameIncludingArchived` rather than `canEditGame` is deliberate: a no-show is noted **after** the game, when it may already be ARCHIVED. It also carries parent-game permission, which is what lets a league **season** owner/admin note a no-show on a fixture.

Code: `Backend/src/services/gameAttendance/` — `attendanceRules.ts` (pure: the write allow-list, the 7-day window, the 6 h cooldown, the counting rules, the ≥5 sample floor, the Telegram `at:` parser), `attendanceCounters.service.ts` (recompute, never increment), `gameAttendance.service.ts` (endpoints, the `attendance` push-action handler and the `attendanceSummary` card enricher, both registered at import time). Socket: `game-attendance-updated` on `game-${gameId}` → `{ gameId, userId, attendance, confirmedCount, playingCount }`, where `userId` is the player the change is *about*, never the actor.

The nudge cooldown has **no table**: the nudge writes an `ATTENDANCE_NUDGED` system message into the game chat *before* it fans out and reads the cooldown back from the newest such message. That makes it restart-safe and doubles as the visible record in chat.

**Where a player can answer.** Game details, the push shade on both platforms
(`attendance_actions` / the `GAME_REMINDER` category — see
[notifications.md](./notifications.md)), the Telegram reminder's inline buttons,
and the Apple Watch. The watch fetches `GET /games/:id/attendance` with the game
and posts the same `POST /games/:id/attendance`; the prompt rule it shares with
the widget envelope (unanswered, ANNOUNCED, starting within 24 h) lives in
`WatchAttendance.needsAnswer`, and `CachedNextGame.attendance` carries the
viewer's answer into the envelope. Every surface writes through the same
endpoint and the same allow-list — none of them can move a seat.

**The card stack** (`attendanceSummary`) is projected **only** for games the
viewer is PLAYING in; every other game gets `null`. So the right-rail avatar
stack follows the viewer, not the list: it appears on a Find card once the
viewer has joined that game, and never on a stranger's.

Public rate and counters: [social-and-profile.md](./social-and-profile.md).

## Game series (recurrence)

A **`GameSeries`** is an organizer-owned recurrence that spawns one ordinary `Game` per occurrence. An occurrence is a normal `GAME` / `TRAINING` / `TOURNAMENT` row with its own roster, results, rating, chat and booking, and every existing rule applies to it unchanged. Flag: `GAME_SERIES_ENABLED` / `VITE_GAME_SERIES_ENABLED` — off means 404, not an empty shell.

| Concept | Where it lives |
|---------|----------------|
| The recurrence | `GameSeries` — owner, cadence `WEEKLY`/`BIWEEKLY`, `weekday` (1–7 ISO), `startTimeLocal` `HH:mm` club-local, `durationMinutes`, `clubId`, `courtIds`, `template Json`, `horizonDays` (14), `seatDeadlineHours` (48), `endsOn?`, `status ACTIVE`/`ENDED`, `groupChannelId?` |
| The link to an occurrence | `Game.seriesId` + `Game.seriesOccurrenceDate @db.Date`, `@@unique([seriesId, seriesOccurrenceDate])` |
| The regular roster | `GameSeriesRegular(seriesId, userId, addedAt, removedAt?)` |
| A skipped week | `GameSeriesSkip(seriesId, occurrenceDate)` |

**`parentId` is not used.** That hierarchy means league season → fixture and drives `parentGamePermissions.ts`; a series is a peer relationship, not a parent one.

**The template is an allow-list, never a spread.** `services/gameSeries/gameSeriesTemplate.ts` projects a game (or a create payload) onto a fixed set of scalars, so a new create-game field does **not** automatically replay — add it to `STRING_KEYS` / `NUMBER_KEYS` / `BOOLEAN_KEYS` deliberately. And **no schedule lives in the template**: `startTime` / `endTime` are derived per occurrence from the series columns, so a template can never pin a generated game to the original date.

**Occurrence generation** (`gameSeriesGeneration.service.ts`) fills a `horizonDays` window ahead and calls `GameCreateService.createGame` with the stored template, so `validateGameForSport`, the club/court checks, overlap detection, readiness and play-intent matching all run exactly as for a hand-made game. Generated occurrences are **never auto-booked** — the card shows the normal "not booked" badge and the owner books from edit.

Idempotency is a **database invariant**: `Game.@@unique([seriesId, seriesOccurrenceDate])`. The pre-read of existing occurrences is only an optimisation; the `P2002` branch is the correctness path and rolls the duplicate back through `GameDeleteService`. Never replace it with an in-memory `Set` — schedulers retry, and the request path can run concurrently with the nightly cron. Likewise, date maths in `gameSeriesOccurrenceDates.ts` walks club-local day keys and converts to an instant once per occurrence with `fromZonedTime`; adding `7 * 86400000 ms` drifts the wall-clock time by an hour twice a year in every DST timezone.

**Edit scope.** `PATCH /series/:id` with `scope: 'future'` re-applies the template to every occurrence from today onward that is unstarted and `resultsStatus === 'NONE'`. The other two buckets (`locked`, `started`) come back in the response so the UI can say how many games kept their current details. `resultsStatus !== 'NONE'` is the lock — never `Game.status`.

**Ending a series** sets `status = ENDED` and deletes future occurrences through `GameDeleteService`, which already refuses anything with results or children. Those refusals are collected and reported, never forced.

**Access.** Pure predicates in `gameSeriesAccess.ts`, shared by the service, the controller and the push-action handler:

- `isSeriesManager` — owner or platform admin. Template, skips, roster and chat, nobody else.
- `canRemoveSeriesRegular` — the manager may remove anyone; a regular may remove themselves ("not next week" without leaving tonight's game). There is no other self-service path onto a roster: being a regular is what unlocks the carry-over seat and the private series chat.
- `isSeriesInsider` — manager, active regular, or a participant on any occurrence. `GET /series/:id` requires it and answers **403 `series.notAMember`** otherwise, because the payload names every regular, lists private occurrence cards and exposes the group-channel id. The public face of a series is the `↻ Weekly` card pill, which stays open to everyone.
- `evaluateSeriesSeatClaim` — a seat claim only ever applies to the series' *next* occurrence, and only for someone on the roster right now. The gameId in a push token is attacker-supplied, so it is compared against the id the server recomputes.

**Carry-over ("Same time next week?").** Fired from the **post-commit** tail of `recalculateGameOutcomes` (see [results.md](./results.md)), never inside the outcomes transaction: the hook creates the next occurrence through the normal create path and sends the prompt. `selectCarryOverRecipients` requires that you **played** this occurrence, are still on the regular roster, and are not already PLAYING on the next one — that last rule is what makes a re-run of the hook harmless. The prompt carries a `kind: 'series'` push action token whose `targetId` is the **next occurrence's** gameId, so the shade buttons, the Telegram `sr:` buttons and the in-app "I'm in" all land in `GameSeriesCarryOverService.acceptSeat`. Accept upserts a PLAYING `GameParticipant` with `invitedByUserId = series owner`; decline records **nothing**.

**Nothing is ever reserved.** `seatDeadlineHours` is *display* copy ("your seat opens to others on Sun 29 Sep"), not a job: the seat was open the whole time, so there is no hold to release. Do not add a release scheduler for it.

**Entry points into a series**, all four of them:

- the `↻ Weekly` **card pill** (`gameSeriesCardEnricher`), public;
- the **"Part of *X* · week N" line** under the game title (`SeriesTitleLine`),
  which reads the same public label off `game.seriesLabel` — attached to the
  detail read in `read.service.ts`, so it renders for a signed-out viewer too;
- the **series links row** on the occurrence (`SeriesGameSection`): *Open series*
  and *Open series chat*;
- **Profile → Statistics → "Your regular games"** (`ProfileSeriesRow`), backed by
  `GET /series`, which lists series the viewer **owns or is a regular of**. The
  owner cap (`countActiveSeries`) counts only owned, active ones, so the wider
  list does not move it. This is also where the cap helper's "Manage your series"
  link lands.

**The series chat is owner-created, insider-openable.** `POST /series/:id/chat`
creates the `GroupChannel` on the owner's first tap (`assertSeriesOwner`) but
hands an *existing* channel to any insider, so a regular can open the group from
the occurrence. A non-insider gets 404, never the channel id.

Creation, the Repeat row and the entity-type restriction: [create.md](./create.md). Card pill: [home-and-find.md](./home-and-find.md).

## General tab

`GameInfo`: name, time, club/court(s), sport, level range, public/private, favorite-club star, club mini map, format tags in header.

- Weather: `GET /games/:id/weather` → `GameWeatherDialog` (hourly, day nav, archive days). The separate **risk banner** for outdoor games — and the Move indoor sheet, which applies its change through the ordinary edit path — is [weather.md](./weather.md)
- Cost split: per-game ledger of who owes what, [economy.md](./economy.md)
- Linked bookings: `GameLinkedBookingsSection` (“From your reservations”), coverage badges
- Court web cameras: `GameWebCamerasSection` — **only `resultsStatus === FINAL`**
- Add to calendar; share game (`ShareModal` / Capacitor Share)
- Private notes: per-user `UserGameNote` (`userGameNoteController`, `GameInfoUserNote`). Not visible to others. Also on My/Find cards and fixture sheets
- FAQ: `GET /faqs/game/:id`. Season FAQ tab + owner `FaqEdit`
- Photos: `canViewGamePhotos` requires **FINAL**. Upload/set main/delete; `forbidOthersPhotosView`. `Backend/src/services/gamePhoto/` + `Frontend/shared/gamePhotos/permissions.ts`
- Results: [results.md](./results.md). Bets: create/accept/update/cancel **locked when `resultsStatus !== NONE`** (`bet.service.ts`). Resolution on FINAL
- Emoji reactions on list cards; workout (`gameWorkout.service`)
- Chat: participants-only toggle; desktop split panel; Organizers tab when participants-only

## Settings (owner/admin)

`GameSettings` toggles: `affectsRating`, `isPublic`, `anyoneCanInvite`, `resultsByAnyone`, `allowDirectJoin`, `autoFillFromQueue`, `afterGameGoToBar`, `showOnLiveRail`.

- **`autoFillFromQueue`** sits immediately below `allowDirectJoin`, with a read-only "N in queue" line under it.
- **`showOnLiveRail`** (`Boolean @default(true)`) is the organizer's opt-out from the Live now rail, independent of `isPublic`: a private game is never on the rail whatever this says, and a public game with it off stays joinable but is invisible while it is being scored. It is editable through the ordinary `PUT /games/:id` path (it is in `GAME_UNCHECKED_SCALAR_KEYS`) and is rendered only while the game is public. `readSetting` in `GameSettings.tsx` defaults every other toggle to `false`; this one must default to **`true`** (`game.showOnLiveRail ?? true`), or every game created before the column existed reads as hidden until its owner touches the switch. See [live-scoring.md](./live-scoring.md).
- There is **no attendance setting** — no deadline, no auto-release. Attendance is informative only.

`EditGameInfoModal`: general, location & time (same Booktime/Padeloo/Klikteren panel as create), courts reorder (`gameCourt.controller`), visibility, rating, invite/join/results perms, participants-only chat.

- Duplicate: `canEdit` + not IN_PROGRESS → `/create-game` with `initialGameData` (`buildDuplicateGameInitialData`)
- Delete: owner (`DELETE /games/:id`, `GameDeleteService`). Blocked if `resultsStatus !== NONE` or children (`parentId`). Writes `CancelledGame`; later GET is 410. Linked-booking warning modal. Club-admin court cancel is a separate path (`ClubAdminGameService.cancelGame`)

`canViewSettings` is false for league fixture variant (`isLeague`) and for EVENT poster (different shell).

## Permissions

`ParticipantRole`: `OWNER` | `ADMIN` | `PARTICIPANT`.

| Gate | Roles |
|------|--------|
| `canEditGame` | OWNER, ADMIN |
| `canAccessGame` | OWNER, ADMIN, PARTICIPANT |
| `*IncludingArchived` | same, ARCHIVED allowed |
| Delete | OWNER only |
| `canModifyResults` | owner/admin **or** (`resultsByAnyone` and participant). Parent season roles inherit onto fixtures (`parentGamePermissions.ts`) |
| Global `isAdmin` | bypass |
| Guest status | public view; spectator live with token; chat-only if GUEST |
| ARCHIVED | join/edit blocked; cancelled chat stub |

EVENT pending: owner + `isAdmin` only (`eventApprovalVisibility.ts`).

## Entity UI

| Type | UI |
|------|-----|
| GAME | Standard shell |
| TOURNAMENT | Roster/bracket defaults; table view when format allows |
| TRAINING | Trainer section, pending trainer invite, `TrainingResultsSection` + `EditLevelModal` when FINAL. See [training.md](./training.md) |
| BAR | `BarParticipantsList` when FINAL (level before/after). No format/results entry |
| LEAGUE | Link to parent season. Fixture, not season tabs |
| LEAGUE_SEASON | Tabs `?tab=`: general, schedule, planner (participants only), standings, faq. See [leagues.md](./leagues.md) |
| EVENT | Poster: `eventKind`, hero slideshow, Register `externalUrl`, Going / Need a partner, partner board. `ON_APPROVE` banner. Organizing is not auto-Going. My/calendar if OWNER, Going, or Looking |

EVENT code: `Frontend/src/components/eventDetails/*`, `eventRsvp.service.ts`, `eventApproval.service.ts`, `eventHeroes.service.ts`, `eventCreateDefaults.ts`. `assertEventForbidsResults`.

## Localized display text

Authored `Game.name` / `Game.description` stay originals forever (edit forms + API). Create/edit name and description inputs seed only via `authoredGameTextForEdit` (never `localizedText` / display resolver); helper copy explains automatic translation; “Original text” when details would show a translation. Reads accept `?locale=` / `X-App-Locale` / `Accept-Language` (normalized via `@bandeja/app-locale`). Additive `localizedText` projection: `{ locale, name, description }` each `{ text, sourceRevision, state, provenance }`. Resolve order: current manual override → current automatic → current original; preserve-name → original; pending/missing → original. Find cards omit description in the projection. Client: `useGameLocalizedText` / `resolveDisplayedGameText`. Find/My/upcoming/past card titles (`GameCardTitle`, stale home rows), Event posters (`EventPosterCard`), and game chat list/header titles (`chatListGameCardDisplay`, `getGameHeaderTitle`) render the resolved name (including nested parent-season names); no per-card spinner or language control. Locale is part of games react-query keys; `gameCardPropsEqual` / chat list memo include `localizedText` so titles refresh in place. Details: quiet `Translated · Show original` / `Original · Show translation` via `useGameDetailsLocalizedDisplay` + session memory per `gameId` (`gameTextShowOriginalSession`); omit when display equals original; pending translations silently show originals until ready; no progress hint or failure toast; `lang`/`dir=auto`; defer text updates while the user has a selection. Organizer editor: `GET/PATCH /games/:id/translations/:locale` + `POST …/retry` (game-edit permissions; archived blocked); panel from Edit details / Event edit listing; `keepOriginalNameInAllLocales` (+ optional source-locale overrides) on `PUT /games/:id`. Realtime: `game-text:invalidate` after publish/correction (`game-{id}` + authorized `notify-user-*`; game id / locale / revisions only — clients refetch HTTP). Socket is best-effort; details use capped pending poll + focus/reconnect. Generation flag: Backend `GAME_TEXT_LOCALIZATION_GENERATION_ENABLED` (env; package default false).

## Code

- BE: `Backend/src/services/game/` (`game.service.ts` facade: create/read/update/delete/participant/admin/ownership), `game.controller.ts`, `game.routes.ts`
- Series: `Backend/src/services/gameSeries/`, `routes/series.routes.ts` (`/api/series`) + `routes/gameSeries.routes.ts` (mounted at `/api/games` **before** `game.routes.ts` — never declare a bare `/` or `/:id` there)
- Attendance: `Backend/src/services/gameAttendance/`, `routes/gameAttendance.routes.ts`
- Seat / auto-fill: `Backend/src/services/gameSeat/`, no routes of its own
- FE: `Frontend/src/features/spot-opened/`, `attendance/`, `game-series/`, `cost/`, `weather-alerts/`
- Game text localization: `Backend/src/services/gameText/gameTextLocalizedText.*`, `gameTextRequestLocale.ts`, `gameTextEditor.*`, `gameTextTranslation.controller.ts`
- Photos: `gamePhoto.controller.ts`, `Backend/src/services/gamePhoto/`
- FE: `GameDetailsPage.tsx`, `GameDetailsShell.tsx`, `Frontend/src/components/GameDetails/`, `Frontend/src/utils/gameText/`, `hooks/useGameLocalizedText.ts`, `hooks/useGameDetailsLocalizedDisplay.ts`, `components/gameText/GameTextTranslationsPanel.tsx`
- Caps: `Frontend/shared/entityCapabilities.ts`
