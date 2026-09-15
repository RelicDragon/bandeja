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
- Price (`priceType`, currency, total)
- Invite from Search \| Looking when time is set; browse-city chip; level filter
- Floating summary chips when scrolled (`CreateGameSummaryBar`)

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

Inline validation. Overlap confirm (`runWithOverlapConfirm`). Gender-for-event gate. Questionnaire banner (`CreateGameQuestionnaireBanner`) when level band vs estimated level. Progress overlay. Success → details or calendar. Duplicate from details pre-fills `initialGameData`.

BE: `POST /games` → `GameCreateService.createGame`. `validateGameForSport`, `normalizeGameFormatPatch`, `assertMaxParticipantsWithinUserCap`, `assertSlotOverlapConfirmed`, `assertClubSupportsSport`.

## `/create-league`

Not a create-template. Fields: league name/description, city, club; season name + date range; sport, level range, max participants; format wizard (RR / bracket seeds — **playoff templates**, not `CREATE_TEMPLATES`); season avatar; gender teams, fixed teams, multi-court; `anyoneCanInvite`; participant setup tags; price.

`POST /leagues` (`league.routes.ts`): name, `cityId`, `season.startDate` required. `LeagueCreateService` creates `LEAGUE_SEASON` game + `League`/`LeagueSeason` rows. `canCreateLeague` on User.

## `/create-event`

Not the game wizard. No courts, rating, results, or templates. Required: `eventKind`, name, ≥1 hero (`EVENT_MAX_HEROES` = 8). Optional: `venueText`, `externalUrl` (http/s), club/city, dates, level band, price, creator intent organizing|looking.

`assertEventCreatePayload` / `eventCreateDefaults`. Submit → `entityType=EVENT`, `eventApprovalStatus=ON_APPROVE`. Not on Find until approved.

## Code

- FE: `Frontend/src/pages/CreateGame.tsx`, `CreateLeague.tsx`, `CreateEvent.tsx`; `Frontend/src/components/createGame/`; `Frontend/src/components/createEvent/`; `Frontend/src/components/gameFormat/`; `Frontend/src/hooks/createGameBookingFlow/`
- Shared: `Frontend/shared/createTemplates.ts`, `isPresetLegal.ts`, `entityCapabilities.ts`, `@shared/booking/`
- BE: `Backend/src/services/game/create.service.ts`, `eventCreateDefaults.ts`; `Backend/src/services/league/create.service.ts`; `validateGameForSport`
