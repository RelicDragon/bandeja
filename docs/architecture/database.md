# Database

Prisma schema: **`Backend/prisma/schema.prisma`**. PostgreSQL. Prisma **7.8** (`@prisma/adapter-pg`).

## Schema name

Runtime search_path: `process.env.DB_SCHEMA || 'padelpulse'` in `Backend/src/config/database.ts` (PrismaPg `{ schema }`).

`prisma.config.ts` datasource URL default includes `?schema=padelpulse`. Dev DB name is often `padelpulse_dev`; **schema** is `padelpulse`.

`config/env.ts` `config.db.schema` defaults to `'public'` — that field is **not** what Prisma uses. Use `DB_SCHEMA` / `database.ts`.

`schema.prisma` `datasource db` has **no** `url` (Prisma 7: URL lives in `prisma.config.ts`).

## Migrations

- Named migrations only: `cd Backend && npm run prisma:migrate` (`prisma migrate dev` via `scripts/run-heavy`).
- Commit `Backend/prisma/migrations/<timestamp>_<name>/migration.sql` with the schema change.
- Production: `npx prisma migrate deploy` (see `docs/PRODUCTION.md`).
- **Never** `prisma db push`.
- PostgreSQL `ALTER TYPE ... ADD VALUE` cannot run in the same transaction as first use of the new enum value. Split: migration 1 add value, migration 2 use it. Prefer letting `migrate dev` generate; do not hand-write unless required.

Generate client: `npm run prisma:generate` (heavy lock).

## Key models

### User

Account. Auth identifiers: `phone`, `email`, `telegramId`, `appleSub`, `googleId` (all unique, nullable). `isActive` soft-disable. `isAdmin`. `primarySport`, `sportsEnabled[]`. `currentCityId`. Wallet/points. Display prefs (`language`, `timeFormat`, `weekStart`). `payoutMethods` (`Json`: the organiser's saved "how to pay me" list, prefilled onto games they create; own-profile payloads only). `attributionId` → first-touch `LinkToAppAttribution`.

Onboarding/referral: `onboardingCompletedAt` (null ⇒ route to `/welcome`; backfilled to `createdAt` for pre-existing accounts), `onboardingStep`, `referralCode` (unique short code, generated lazily), `referredByUserId` (self FK `UserReferredBy`, first-touch, never overwritten).

Trainer identity for a game is **`Game.trainerId`**, not a user flag.

### UserSportProfile

Per `(userId, sport)`: `level`, `reliability`, `ratingUncertainty`, `gamesPlayed`/`gamesWon`, `inactive` (leaderboard), play streak fields, questionnaire timestamps, `levelSource`, `approvedLevel` (sport-level confirmation). Unique `[userId, sport]`.

`attendedCount` / `noShowCount` are **informational only** (attendance rate display). They never feed `level`, `reliability` or `ratingUncertainty`.

### UserRefreshSession (`@@map("user_refresh_sessions")`)

Refresh-token rotation: `tokenHash`, `expiresAt`, `revokedAt`, `rotationFamilyId`, `replacedBySessionId`, device metadata. Related: `AuthRefreshEvent` (metrics).

### Game

One row for match, tournament, league season shell, training, event, bar — discriminated by **`entityType`**. Fields: `sport`, `gameType`, `status` (`GameStatus`), `resultsStatus`, times, club/court/city, `maxParticipants`, `playersPerMatch`, `bookingStatus`, format/scoring columns, `parentId` (hierarchy), **`trainerId`**, `leagueRoundId` / `leagueGroupId`, `eventKind` / `eventApprovalStatus`.

- **`parentId`**: league sub-games (and other hierarchy) point at parent `Game`.
- **`seriesId`** / **`seriesOccurrenceDate`** (`@db.Date`): recurring-series occurrence link. **Not** `parentId`. Unique `[seriesId, seriesOccurrenceDate]`; `onDelete: SetNull` so ending a series keeps its past occurrences.
- Other feature columns: `autoFillFromQueue`, `showOnLiveRail`, `lastSeatOpenedAt`, `costPayerId` (named relation `GameCostPayer`), `paymentMethods` (`Json`: up to 3 `{ method, handle }` from the country-scoped catalogue in `@bandeja/shared/payments`), `paymentHint` (`VarChar(120)`, the legacy one-line mirror of that list, written through for pre-catalogue app builds), `costFrozenAt`, `weatherAlertState` (`Json`: `{ severity, sentAt[], keepAsPlannedAt?, lastEvaluatedAt }`).
- Occupancy: count **`GameParticipant.status === PLAYING`** vs `maxParticipants` (`services/game/availableGamesSlotsSql.ts`). INVITED / IN_QUEUE / NON_PLAYING / GUEST do not fill slots.

### GameParticipant

`(userId, gameId)` unique. `role` (`OWNER`/`ADMIN`/`PARTICIPANT`). `status` (`ParticipantStatus`). Optional `playIntentId`, `inviteUserTeamId`, `lookingForPartner`.

`attendance` (`ParticipantAttendance`, default `UNANSWERED`) + `attendanceUpdatedAt` are the "are you coming?" answer. Attendance **never** changes `status`, frees a slot or touches rating. `noShowNotedById` / `noShowNotedAt` hold an owner/admin no-show note (undoable).

Declined/cancelled invites that are **not** participants: `GameInviteOutcome`.

### League\*

`League` (container) → `LeagueSeason` (id **equals** the season `Game.id`) → `LeagueGroup`, `LeagueRound`, `LeagueParticipant`, `LeagueTeam` / `LeagueTeamPlayer`, `LeagueBracketSlot`. Sub-match rows are `Game` with `parentId` / round / group FKs.

### Chat\*

| Model | Role |
|-------|------|
| `ChatMessage` | All threads. `chatContextType` + `contextId`. Soft delete `deletedAt`. `clientMutationId` + `serverSyncSeq`. |
| `ChatSyncEvent` | Ordered sync log per context (`seq`, `eventType`, `payload`). |
| `ConversationSyncState` | `maxSeq` per context. |
| `ChatReadCursor` | Per user + context + `chatType`: `readMaxServerSyncSeq`. |
| `UserUnreadState` / `UserContextUnreadState` | Unread revision clocks. |
| `UserChat` | DM pair (`user1Id`/`user2Id`). |
| `GroupChannel` | City groups, channels, bug threads, marketplace buyer chats (`bugId`, `marketItemId`, `isCityGroup`, `isChannel`). |
| `GroupChannelParticipant` / `GroupChannelInvite` | Membership. |
| `ChatDraft` | Server drafts. |
| `MessageReaction`, `MessageReadReceipt`, `PinnedMessage`, `Poll`, translations, transcription | Side tables. |

Context enum is **`ChatContextType`**: `GAME`, `BUG`, `USER`, `GROUP`. Bugs are **not** `EntityType`.

### PlayIntent\*

`PlayIntent`: looking-to-play row (`status` OPEN/MATCHED/CONSUMED/EXPIRED/CANCELLED, city/sport, dateKeys, time windows, clubIds, level range). Jobs: `PlayIntentFollowerNotificationJob`, `PlayIntentMatchJob`, `PlayIntentNotificationDelivery`, `PlayIntentGameOwnerPing`. Linked from `GameParticipant.playIntentId`.

### Booking snapshots

| Model | Provider |
|-------|----------|
| `GameExternalBooking` | Linked reservation on a game (`externalBookingId`, `externalBookingProvider` = `ClubIntegrationType`, `bookingStart`/`End`, optional `courtId`) |
| `ClubBooktimeBusySnapshot` | Booktime court-day busy JSON |
| `ClubPadelooBusySnapshot` | Padeloo |
| `ClubKlikterenBusySnapshot` | Klikteren |
| `ClubNspadelBusySnapshot` | NSPadel |
| `UserClubBooktimeAuth` / `UserClubPadelooAuth` / … | Per-user club OAuth tokens |

`Game.bookingStatus`: `NONE` \| `MANUAL` \| `EXTERNAL_PARTIAL` \| `EXTERNAL_FULL`. Derived in shared `computeGameBookingStatus`.

### LinkToApp\*

`LinkToAppAttribution`: landing attribution id, UTM fields, `convertedUserId`, `referrerUserId` (from `?ref=CODE`). `LinkToAppEvent`: `kind` hits/choices. User `attributionId` = first touch.

### PlatformSetting

Generic admin key/value store: `key String @id`, `value String @db.Text`, `createdAt`, `updatedAt`. Keys are SCREAMING_SNAKE constants. **A missing row means "unset"** — a feature that depends on a setting hides itself rather than assuming a default. Seeded: `REFERRAL_REWARD_REFERRER = 50`, `REFERRAL_REWARD_REFERRED = 25`. Deliberately **not** seeded: `COINS_PER_CURRENCY_UNIT` (the "settle in coins" option stays hidden until an admin sets it).

Distinct from `ResultsArtifactSetting`, which is a singleton row with `id = 'default'`.

### GameSeries\*

| Model | Role |
|-------|------|
| `GameSeries` | Organizer-owned recurrence: `ownerId`, `name`, `entityType`, `cadence` (`GameSeriesCadence`), `weekday` (1–7 ISO, club-local), `startTimeLocal` (`HH:mm`, local not UTC), `durationMinutes`, `clubId?`, `courtIds String[]`, `template Json`, `horizonDays` (14), `seatDeadlineHours` (48), `endsOn? @db.Date`, `status` (`GameSeriesStatus`), `groupChannelId?`. |
| `GameSeriesRegular` | Regular-roster membership, unique `[seriesId, userId]`. `removedAt` soft-removes; `addedAt` is the creation timestamp. |
| `GameSeriesSkip` | One skipped occurrence date, unique `[seriesId, occurrenceDate]` (`@db.Date`). |

Occurrences are ordinary `Game` rows linked by `Game.seriesId`.

### GameCostShare

Per-player share of a game's total cost: `gameId`, `userId`, `amountCents`, `currency` (ISO string copied from `Game.priceCurrency`), `markedPaidAt?`, `confirmedAt?`, `method` (`CostShareMethod`), `transactionId?` (coins settle). Unique `[gameId, userId]`, cascade on game and user. "What I still owe" reads `[userId, confirmedAt]`.

### PairStat

Materialized partner-pair aggregate for the pairs leaderboard: `sport`, `cityId`, `userAId`, `userBId`, `games`, `wins`, `lastPlayedAt?`, `combinedLevel?`. Unique `[sport, cityId, userAId, userBId]`.

**Invariant (application-level, not DB-enforced): `userAId < userBId`.** Always sort the ids before reading or writing.

### MonthlyRecap

`userId`, `monthKey` (`YYYY-MM`, user's city timezone), `payload Json`, `viewedAt?`, `sharedAt?`, `sharedSlideKeys String[]`. Unique `[userId, monthKey]`. Pruned after 12 months. Sharing creates a `UserStory` with `StorySourceType.MONTHLY_RECAP`.

### ReferralReward

One-shot payout: `referredUserId` **unique** (idempotency key), `referrerUserId`, `rewardedAt`, `referrerTxId?` / `referredTxId?` (→ `Transaction`), `revokedAt?`. Revoking does not delete the row, so a pair can never be rewarded twice.

### Goods / UserGoods

`Goods` is the shop catalogue: `name`, `price` (coins), `kind` (`GoodsKind`), `assetKey`, `previewUrl?`, `description?` (`VarChar(400)`), `isActive`, `isFeatured`, `premiumOnly`, `sortOrder`. Unique `[kind, assetKey]`. Pre-shop rows were backfilled to `kind = PROFILE_FRAME`, `assetKey = id`, `isActive = false` — they are **not** real catalogue items.

`UserGoods` is ownership: `userId`, `goodsId`, `purchasedAt`, `giftedByUserId?`, `equipped`. Unique `[userId, goodsId]`. The row always belongs to the recipient; `giftedByUserId` records the payer. One equipped row per `Goods.kind` is enforced in the service layer.

### Notification delivery dedupe tables

| Model | Key | Purpose |
|-------|-----|---------|
| `SpotOpenedDelivery` | unique `[userId, gameId, dayKey, kind]` | "a spot opened" (`SpotOpenedKind` = which audience) |
| `LiveGameNotifyDelivery` | unique `[userId, gameId]` | "someone you follow is live" |

Both are persisted **on purpose**: the older reminder dedupe uses in-memory `Set`s and loses state on restart. Anything that must not double-fire uses a delivery table or a persisted timestamp.

## Canonical enums (schema values)

**Do not use CLAUDE.md lists.** These are from `schema.prisma`.

### Sport

`PADEL` `TENNIS` `PICKLEBALL` `BADMINTON` `TABLE_TENNIS` `SQUASH`

Same set: `Frontend/shared/sport.ts` `Sports`.

### EntityType

`GAME` `TOURNAMENT` `LEAGUE` `LEAGUE_SEASON` `BAR` `TRAINING` `EVENT`

No `BUG`. Bugs are `ChatContextType.BUG` + `Bug` model.

### GameStatus

`ANNOUNCED` `STARTED` `FINISHED` `ARCHIVED`

There is **no** `SCHEDULED`, `READY`, or `PLAYING` on `Game.status`. Scheduler: `utils/gameStatus.ts` (`ANNOUNCED` if `timeIsSet === false`; `STARTED` when live or `resultsStatus === IN_PROGRESS`; `FINISHED` when ended / results FINAL; `ARCHIVED` after timezone midnight rules).

### ResultsStatus

`NONE` `IN_PROGRESS` `FINAL`

### ParticipantStatus

`GUEST` `INVITED` `INVITE_DECLINED` `INVITE_CANCELLED` `IN_QUEUE` `PLAYING` `NON_PLAYING`

`INVITE_DECLINED` / `INVITE_CANCELLED` are **deprecated on the participant row** (comment in schema). Live decline/cancel lives on `GameInviteOutcome` (`DECLINED` `CANCELLED` `EXPIRED`).

Slot count = `PLAYING` only.

### ClubIntegrationType

`BOOKTIME` `PADELOO` `KLIKTEREN` `NSPADELSUPABASE`

### ChatSyncEventType — Prisma vs `@bandeja/chat-contract`

Parity test `packages/chat-contract/test/parity.test.mjs` requires **identical** value sets. Current values (both):

```
MESSAGE_CREATED
MESSAGE_UPDATED
MESSAGE_DELETED
REACTION_ADDED
REACTION_REMOVED
POLL_VOTED
MESSAGE_TRANSCRIPTION_UPDATED
MESSAGE_READ_RECEIPT
MESSAGE_TRANSLATION_UPDATED
MESSAGES_READ_BATCH
READ_CURSOR_UPDATE
MESSAGE_PINNED
MESSAGE_UNPINNED
MESSAGE_STATE_UPDATED
THREAD_LOCAL_INVALIDATE
THREAD_ARCHIVED
CHAT_AUTO_TRANSLATE_CONFIG_UPDATED
```

Contract exports a const object + `CHAT_SYNC_EVENT_TYPES` array (`packages/chat-contract/src/chatSyncEventType.ts`). Prisma is the enum. If they ever diverge, the parity test fails — document both sides from those two files, not from memory.

Stale names (`MESSAGE_CREATE`, `REACTION_ADD`) are **not** in schema.

### Other enums agents hit often

| Enum | Values |
|------|--------|
| `GameType` | `CLASSIC` `AMERICANO` `MEXICANO` `ROUND_ROBIN` `WINNER_COURT` `LADDER` `KOTC` `CUSTOM` |
| `ChatContextType` | `GAME` `BUG` `USER` `GROUP` |
| `ChatType` | `PUBLIC` `PRIVATE` `ADMINS` |
| `MessageType` | `TEXT` `IMAGE` `VOICE` `VIDEO` `POLL` `STICKER` `DOCUMENT` |
| `MessageState` | `SENT` `DELIVERED` `READ` |
| `ParticipantRole` | `OWNER` `ADMIN` `PARTICIPANT` |
| `PlayIntentStatus` | `OPEN` `MATCHED` `CONSUMED` `EXPIRED` `CANCELLED` |
| `ScoringPreset` | `CLASSIC_AUTOMATIC` `CLASSIC_BEST_OF_3` `CLASSIC_BEST_OF_5` `CLASSIC_PRO_SET` `CLASSIC_SHORT_SET` `CLASSIC_FAST4` `CLASSIC_SUPER_TIEBREAK` `CLASSIC_SINGLE_SET` `CLASSIC_TIMED` `POINTS_11` `POINTS_12` `POINTS_15` `POINTS_16` `POINTS_21` `POINTS_24` `POINTS_32` `BEST_OF_3_11` `BEST_OF_3_15` `BEST_OF_3_21` `BEST_OF_5_11` `PAR_11` `SINGLE_GAME_21` `TIMED` `CUSTOM` |
| `EventKind` | `TOURNAMENT` `LEAGUE` `CAMP` |
| `EventApprovalStatus` | `ON_APPROVE` `APPROVED` `DECLINED` |
| `GameBookingStatus` | `NONE` `MANUAL` `EXTERNAL_PARTIAL` `EXTERNAL_FULL` |
| `GenderTeam` | `ANY` `MEN` `WOMEN` `MIX_PAIRS` |
| `StorySourceType` | `USER_STORY_ITEM` `GAME_PHOTO` `GAME_CREATED` `GAME_RESULT` `BRACKET_CHAMPION` `MONTHLY_RECAP` |
| `ParticipantAttendance` | `UNANSWERED` `CONFIRMED` `UNSURE` |
| `GameSeriesCadence` | `WEEKLY` `BIWEEKLY` |
| `GameSeriesStatus` | `ACTIVE` `ENDED` |
| `CostShareMethod` | `MANUAL` `COINS` |
| `GoodsKind` | `PROFILE_FRAME` `CHAT_ACCENT` `STICKER_PACK` `NAME_COLOR` |
| `SpotOpenedKind` | `QUEUE` `INTENT` `FOLLOWER` |

## Patterns

| Rule | Meaning |
|------|---------|
| Trainer = `Game.trainerId` | FK to `User`. Do not invent participant trainer flags. |
| Slots = `PLAYING` | `COUNT(*)` where `GameParticipant.status = 'PLAYING'` vs `Game.maxParticipants`. |
| `parentId` | Child games (league matches, etc.) under a parent `Game`. |
| Soft `isActive` | `User`, `City`, `Club`, `Court`, … prefer `isActive: false` over delete. Chat messages use `deletedAt`. |
| League season game | `LeagueSeason.id` is the season `Game.id`. |
| PADEL level mirror | `UserSportProfile.approvedLevel`; User denormalized PADEL fields exist for badge — see product constraints, do not “simplify” away. |
| Series ≠ hierarchy | Recurring occurrences use `Game.seriesId`, never `parentId`. Deleting a `GameSeries` sets `Game.seriesId` to NULL; past occurrences survive. |
| `PairStat.userAId < userBId` | Application-level invariant. Sort the two ids before every read and write, or a pair gets two rows per `(sport, cityId)`. |
| Setting unset ⇒ hidden | A `PlatformSetting` row that does not exist means the dependent feature hides itself. Never invent a fallback value. |
| Delivery tables, not Sets | `SpotOpenedDelivery` / `LiveGameNotifyDelivery` / `MonthlyRecap` unique keys / `Game.weatherAlertState.sentAt[]` are restart-safe dedupe. Do not copy the in-memory reminder dedupe. |
