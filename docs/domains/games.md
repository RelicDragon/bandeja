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

## General tab

`GameInfo`: name, time, club/court(s), sport, level range, public/private, favorite-club star, club mini map, format tags in header.

- Weather: `GET /games/:id/weather` → `GameWeatherDialog` (hourly, day nav, archive days)
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

`GameSettings` toggles: `affectsRating`, `isPublic`, `anyoneCanInvite`, `resultsByAnyone`, `allowDirectJoin`, `afterGameGoToBar`.

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

Authored `Game.name` / `Game.description` stay originals forever (edit forms + API). Create/edit name and description inputs seed only via `authoredGameTextForEdit` (never `localizedText` / display resolver); helper copy explains automatic translation; “Original text” when details would show a translation. Reads accept `?locale=` / `X-App-Locale` / `Accept-Language` (normalized via `@bandeja/app-locale`). Additive `localizedText` projection: `{ locale, name, description }` each `{ text, sourceRevision, state, provenance }`. Resolve order: current manual override → current automatic → current original; preserve-name → original; pending/missing → original. Find cards omit description in the projection. Client: `useGameLocalizedText` / `resolveDisplayedGameText`. Find/My/upcoming/past card titles (`GameCardTitle`, stale home rows), Event posters (`EventPosterCard`), and game chat list/header titles (`chatListGameCardDisplay`, `getGameHeaderTitle`) render the resolved name (including nested parent-season names); no per-card spinner or language control. Locale is part of games react-query keys; `gameCardPropsEqual` / chat list memo include `localizedText` so titles refresh in place. Details: quiet `Translated · Show original` / `Original · Show translation` via `useGameDetailsLocalizedDisplay` + session memory per `gameId` (`gameTextShowOriginalSession`); omit when display equals original; pending hint only; no failure toast; `lang`/`dir=auto`; defer text updates while the user has a selection. Organizer editor: `GET/PATCH /games/:id/translations/:locale` + `POST …/retry` (game-edit permissions; archived blocked); panel from Edit details / Event edit listing; `keepOriginalNameInAllLocales` (+ optional source-locale overrides) on `PUT /games/:id`. Realtime: `game-text:invalidate` after publish/correction (`game-{id}` + authorized `notify-user-*`; game id / locale / revisions only — clients refetch HTTP). Socket is best-effort; details use capped pending poll + focus/reconnect. Generation flag: Backend `GAME_TEXT_LOCALIZATION_GENERATION_ENABLED` (env; package default false).

## Code

- BE: `Backend/src/services/game/` (`game.service.ts` facade: create/read/update/delete/participant/admin/ownership), `game.controller.ts`, `game.routes.ts`
- Game text localization: `Backend/src/services/gameText/gameTextLocalizedText.*`, `gameTextRequestLocale.ts`, `gameTextEditor.*`, `gameTextTranslation.controller.ts`
- Photos: `gamePhoto.controller.ts`, `Backend/src/services/gamePhoto/`
- FE: `GameDetailsPage.tsx`, `GameDetailsShell.tsx`, `Frontend/src/components/GameDetails/`, `Frontend/src/utils/gameText/`, `hooks/useGameLocalizedText.ts`, `hooks/useGameDetailsLocalizedDisplay.ts`, `components/gameText/GameTextTranslationsPanel.tsx`
- Caps: `Frontend/shared/entityCapabilities.ts`
