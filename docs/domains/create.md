# Create

Wizards:

| Route | Page | Creates |
|-------|------|---------|
| `/create-game` | `CreateGame.tsx` (`CreateGameWrapper`) | GAME, BAR, TRAINING, TOURNAMENT |
| `/create-league` | `CreateLeague.tsx` | **LEAGUE_SEASON** |
| `/create-event` | `CreateEvent.tsx` (`CreateEventWrapper`) | EVENT (`ON_APPROVE`) |

Casual create templates **are not** league/playoff formats. Template tiers are `social` | `match` | `both`. Do not add a `league` or `playoff` template tier. League seasons and playoffs use `playoffTemplates.ts` / `PLAYOFF_GAME_TYPE_TEMPLATES` (`league/gameCreation.util.ts`). See [leagues.md](./leagues.md).

Canonical template registry: `Frontend/shared/createTemplates.ts` (`CREATE_TEMPLATES`). FE/BE parity tests. FE also merges **legacy padel ids** (`PADEL_AUTOMATIC`, `PADEL_BEST_OF_3`, `PADEL_SUPER_TIEBREAK`, `PADEL_SINGLE_SET`, `PADEL_AMERICANO`, `PADEL_TIMED`, `PADEL_SINGLES_AUTOMATIC`) in `createTemplateUiExtras.ts`. Sport picker lists: `Frontend/src/sport/createFlow.ts` (`CREATE_FLOW_BY_SPORT`).

## `/create-game`

Entity chips: GAME / BAR / TRAINING / TOURNAMENT. TRAINING invite picker is trainers-only. Creator of TRAINING may be NON_PLAYING.

Who may create what (server-side, `GameCreateService.createGame`):

- **TRAINING**: anyone may create one as a **playing** creator — that is what a trainee's "Play with this group again" / Duplicate sends, and shipped store builds rely on it. Such a creator does not become `Game.trainerId`. "I coach, I don't play" (`creatorNonPlaying`, makes the creator the trainer) is `User.isTrainer` / platform admin only (403 otherwise). The create menu (`CreateMenuModal`) and the agent (`assertMayCreate`) still offer TRAINING only to trainers/admins. The security boundary is level edits, see [training.md](./training.md). Recurring-series occurrences skip the check (`seriesOccurrence`).
- **TOURNAMENT**: open to everyone. `User.canCreateTournament` is **not** a create permission — it only raises the participant cap: 12 for everyone else; with the flag (or platform admin) the picker offers up to 32 (`maxSlotsForUserTournament`) and the server lifts the cap (`maxParticipantsLimitForActor` in `Backend/src/utils/game/userMaxParticipantsCap.ts`).

### Format wizard

`GameFormatWizard` / `GameFormatCard` / `useGameFormat` / `MatchFormatControl`.

- Sport (filters clubs + templates)
- Template picker (`CreateGameTemplatePicker`) — social vs match
- Scoring preset, `gameType`, `matchGenerationType`
- `affectsRating`
- Golden point / `deucesBeforeGoldenPoint`
- Singles vs doubles (`playersPerMatch` 2|4)
- Fixed teams, gender teams
- Participants-only chat (default off)
- Match timer (`matchTimerEnabled`, `matchTimedCapMinutes`) where the template allows
- Officiating / strict validation from preset meta (`StrictValidationId`)

Shared ids (examples): Padel Americano 10/20/24, Mexicano 24, Challenger Pool, KOTC 11, singles BO3 / single set / Americano 24; Pickleball social 21 / match BO3 11 / KOTC 11; Badminton club 3×15/3×21, Americano 21, match 3×21; TT open 11, club RR, box BO3, legacy 21, match BO3/BO5, Americano/Mexicano 11, Swiss box (`TT_SWISS_BOX` → generation `ESCALERA`, not a `MatchGenerationType.SWISS`); Tennis Fast4 / Classic BO3; Squash quick BO3 11.

### Scheduling

- Venue city chip independent of Find browse. Club search can pick other cities; pick sets `cityId` from `club.cityId` and clears courts/bookings
- Court grid + occupancy rings (`CourtOccupancyRing`); multi-court from participant count
- Date, duration, time grid
- Level range, max participants, gender
- Name, description, avatar
- Price (`priceType`, currency, total), plus a live **per-head preview** and an optional 120-char payment hint when the price type yields a game total ([economy.md](./economy.md))
- **Repeat** row (`Once · Weekly · Every 2 weeks`) with an optional **Until** date — see below
- Invite from Search \| Looking when time is set; browse-city chip; level filter
- Players step leads with an inline **looking nudge** once club, date and time are set (`CreateGameLookingNudge`, same `POST /play-intents/invite-pool` draft as the modal's Looking tab): "{n} players are looking for this time" + **Invite**, offering OPEN, not-in-proposal people whose request fits this game, up to the free seats; invites carry `playIntentId`. Not for TRAINING
- Demand-slot create (`play-intent.md` § Demand slots) arrives with `invitePlayIntentIds`; links made outside the modal survive a later modal confirm
- Floating summary chips when scrolled (`CreateGameSummaryBar`), including a **Repeat** chip while a cadence is selected

#### Repeat (recurring series)

The flow deliberately **creates the game first and converts it afterwards** (`POST /games/:id/series`): the create payload is untouched, every create-game validation runs exactly once, and a failure to create the series can never lose the game the organizer just made — it surfaces as a toast on an otherwise successful create.

Only `GAME`, `TRAINING` and `TOURNAMENT` may recur. Events, leagues and league seasons never show the row. Gated on `VITE_GAME_SERIES_ENABLED` / `GAME_SERIES_ENABLED`; off means the row is absent and no `/series` request is made. The series model, generation and edit scope: [games.md](./games.md).

### Booking on create

When club integration is BOOKTIME / PADELOO / KLIKTEREN: `GameLocationTimePanel` + `useCreateGameBookingFlow`.

- Club → date → court → reservation card → auth/duration → time
- Phone OTP inline (`ClubBookingConnectInline`)
- Reservation strip; green overlay; adjacent slot grouping
- **Book on create:** reserve via provider API; multi-court confirm modals (`BooktimeCreateGameConfirmModal`, `PadelooCreateGameConfirmModal`, `KlikterenCreateGameConfirmModal`, `NspadelCreateGameConfirmModal`)
- Opt-out: “Don't book real court” — full grid, red external cells selectable
- Prefill `?bookingIds=`
- Rollback reservation if game create fails (`BOOKING_ERROR_KEYS.rollbackFailed`)
- `GameCreateService` links `externalBookingIds` / `bookingSnapshots`; `hasBookedCourt` / `bookingStatus`

### Submit

Inline validation. Overlap confirm (`runWithOverlapConfirm`). Gender-for-event gate. Questionnaire banner (`CreateGameQuestionnaireBanner`) when level band vs estimated level. Progress overlay. Success → details or calendar. Duplicate from details pre-fills `initialGameData`. **Rematch** (PRD 362) pre-fills the format only (`buildRematchGameInitialData`), passes `invitedPlayerIds` / `invitedPlayers` / `invitedTrainerId` / `creatorNonPlaying` / `rematchOf` through `CreateGameWrapper`, shows `RematchDraftBanner` at the top of the form, and the existing post-create invite loop sends the invites (`asTrainer` for the previous TRAINING trainer). Invitee chips are seeded from the passed users so a co-player outside the Browse city still shows.

BE: `POST /games` → `GameCreateService.createGame`. `validateGameForSport`, `normalizeGameFormatPatch`, `assertMaxParticipantsWithinUserCap`, `assertSlotOverlapConfirmed`, `assertClubSupportsSport`.

## `/create-league`

Not a create-template. Fields (`CreateLeague.tsx`): league name/description, city, club; season name; sport, level range, max participants; start date; season avatar (uploaded after create); the format (`season.gameSeason`: game type, scoring, sets/points, match generation — **playoff templates** for seeds, not `CREATE_TEMPLATES`). Fixed teams, price and other season settings are set later on the season page.

`POST /leagues` (`league.routes.ts`): name, `cityId`, `season.startDate` required. 403 unless `User.canCreateLeague` or platform admin (the app only offers League to `isAdmin || canCreateLeague`, `CreateMenuModal.tsx`). `LeagueCreateService` creates `LEAGUE_SEASON` game + `League`/`LeagueSeason` rows.

## `/create-event`

Not the game wizard. No courts, rating, results, or templates. Required: `eventKind`, name, ≥1 hero (`EVENT_MAX_HEROES` = 8). Optional: `venueText`, `externalUrl` (http/s), club/city, dates, level band, price, creator intent organizing|looking.

`assertEventCreatePayload` / `eventCreateDefaults`. Submit → `entityType=EVENT`, `eventApprovalStatus=ON_APPROVE`. Not on Find until approved.

## Code

- FE: `Frontend/src/pages/CreateGame.tsx`, `CreateLeague.tsx`, `CreateEvent.tsx`; `Frontend/src/components/createGame/`; `Frontend/src/components/createEvent/`; `Frontend/src/components/gameFormat/`; `Frontend/src/hooks/createGameBookingFlow/`
- Shared: `Frontend/shared/createTemplates.ts`, `isPresetLegal.ts`, `entityCapabilities.ts`, `@shared/booking/`
- BE: `Backend/src/services/game/create.service.ts`, `eventCreateDefaults.ts`; `Backend/src/services/league/create.service.ts`; `validateGameForSport`
