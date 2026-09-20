# Wave 1 — schema report (PRDs 345–357)

Owner: Wave 1 schema agent. Files touched: `Backend/prisma/schema.prisma`, five new dirs under
`Backend/prisma/migrations/`, `docs/architecture/database.md`, this report. Nothing else.

**Validated with `npx prisma validate` → "The schema at prisma/schema.prisma is valid 🚀".**
No heavy command was run (no generate, no migrate, no build, no test, no lint).

---

## 1. Done

### `Backend/prisma/schema.prisma`

- **6 new enums**, **11 new models**, **`StorySourceType` += `MONTHLY_RECAP`**.
- New columns on `Game`, `GameParticipant`, `User`, `UserSportProfile`, `NotificationPreference`,
  `Goods`, `LinkToAppAttribution`.
- Back-relations added to `User`, `Game`, `Club`, `City`, `GroupChannel`, `Goods`, `Transaction`.
- `Game`, `GameParticipant`, `Club` and `LinkToAppAttribution` were re-aligned to canonical
  `prisma format` output (my longer field names changed the column width). Those four models were
  already off-format at HEAD; 14 other pre-existing off-format models were left alone so the diff
  stays reviewable. Running `prisma format` on the whole file would produce a ~700-line
  whitespace-only diff — **do not** run it mid-programme.

### `Backend/prisma/migrations/` — five migrations, in order

| Dir | Contents |
|---|---|
| `20260920100000_prd345_357_enums` | `CREATE TYPE` × 6. Nothing else. |
| `20260920100100_prd345_357_story_source_monthly_recap` | only `ALTER TYPE "StorySourceType" ADD VALUE 'MONTHLY_RECAP';` + a comment on the PostgreSQL same-transaction restriction. |
| `20260920100200_prd345_357_tables` | 11 `CREATE TABLE` + 43 indexes + 24 foreign keys. |
| `20260920100300_prd345_357_columns` | all `ADD COLUMN` + 13 indexes + 5 foreign keys. |
| `20260920100400_prd345_357_backfill` | `User.onboardingCompletedAt` backfill, `Goods` backfill + `SET NOT NULL`, `PlatformSetting` seed. |

Non-empty-table safety: the only two required-without-default columns (`Goods.kind`,
`Goods.assetKey`) are added **nullable** in migration 4, backfilled in migration 5, and only then
`SET NOT NULL`. Everything else either is nullable or has a `DEFAULT`. The
`Game_seriesId_seriesOccurrenceDate_key` unique index is on two nullable columns, and PostgreSQL
treats NULLs as distinct, so all 2 882 existing games pass.

### `docs/architecture/database.md`

New "Key models" sections (`PlatformSetting`, `GameSeries*`, `GameCostShare`, `PairStat`,
`MonthlyRecap`, `ReferralReward`, `Goods`/`UserGoods`, delivery-dedupe tables), updated `User` /
`UserSportProfile` / `Game` / `GameParticipant` / `LinkToApp*` entries, 7 new rows in the enum
table, 4 new rows in the Patterns table.

---

## 2. Authoritative name list — code against exactly these

### 2.1 New enums

```prisma
enum ParticipantAttendance { UNANSWERED  CONFIRMED  UNSURE }
enum GameSeriesCadence     { WEEKLY  BIWEEKLY }
enum GameSeriesStatus      { ACTIVE  ENDED }
enum CostShareMethod       { MANUAL  COINS }
enum GoodsKind             { PROFILE_FRAME  CHAT_ACCENT  STICKER_PACK  NAME_COLOR }
enum SpotOpenedKind        { QUEUE  INTENT  FOLLOWER }
```

`StorySourceType` now also has `MONTHLY_RECAP` (last value).

### 2.2 New columns on existing models

| Model | Field | Type | Notes |
|---|---|---|---|
| `Game` | `seriesId` | `String?` | FK → `GameSeries.id`, `onDelete: SetNull` |
| `Game` | `seriesOccurrenceDate` | `DateTime? @db.Date` | unique with `seriesId` |
| `Game` | `autoFillFromQueue` | `Boolean @default(false)` | |
| `Game` | `showOnLiveRail` | `Boolean @default(true)` | |
| `Game` | `lastSeatOpenedAt` | `DateTime?` | |
| `Game` | `costPayerId` | `String?` | FK → `User.id`, relation **`"GameCostPayer"`**, `SetNull` |
| `Game` | `paymentHint` | `String? @db.VarChar(120)` | |
| `Game` | `costFrozenAt` | `DateTime?` | |
| `Game` | `weatherAlertState` | `Json?` | `{ severity, sentAt[], keepAsPlannedAt?, lastEvaluatedAt }` |
| `Game` | `series` | `GameSeries?` | relation field (unnamed) |
| `Game` | `costPayer` | `User?` | relation field `"GameCostPayer"` |
| `Game` | `costShares` | `GameCostShare[]` | |
| `Game` | `spotOpenedDeliveries` | `SpotOpenedDelivery[]` | |
| `Game` | `liveGameNotifyDeliveries` | `LiveGameNotifyDelivery[]` | |
| `GameParticipant` | `attendance` | `ParticipantAttendance @default(UNANSWERED)` | |
| `GameParticipant` | `attendanceUpdatedAt` | `DateTime?` | |
| `GameParticipant` | `noShowNotedById` | `String?` | FK → `User.id`, relation **`"ParticipantNoShowNotedBy"`**, `SetNull` |
| `GameParticipant` | `noShowNotedAt` | `DateTime?` | |
| `GameParticipant` | `noShowNotedBy` | `User?` | relation field |
| `User` | `onboardingCompletedAt` | `DateTime?` | backfilled to `createdAt` |
| `User` | `onboardingStep` | `String?` | |
| `User` | `referralCode` | `String? @unique` | |
| `User` | `referredByUserId` | `String?` | self-FK, relation **`"UserReferredBy"`**, `SetNull` |
| `User` | `referredByUser` / `referredUsers` | `User?` / `User[]` | relation `"UserReferredBy"` |
| `UserSportProfile` | `attendedCount` | `Int @default(0)` | |
| `UserSportProfile` | `noShowCount` | `Int @default(0)` | |
| `NotificationPreference` | `sendWeatherAlerts` | `Boolean @default(true)` | matches `PreferenceKey.SEND_WEATHER_ALERTS` |
| `Goods` | `kind` | `GoodsKind` | **required** |
| `Goods` | `assetKey` | `String` | **required**; unique with `kind` |
| `Goods` | `previewUrl` | `String?` | |
| `Goods` | `description` | `String? @db.VarChar(400)` | |
| `Goods` | `isActive` | `Boolean @default(true)` | |
| `Goods` | `isFeatured` | `Boolean @default(false)` | |
| `Goods` | `premiumOnly` | `Boolean @default(false)` | |
| `Goods` | `sortOrder` | `Int @default(0)` | |
| `Goods` | `owners` | `UserGoods[]` | |
| `LinkToAppAttribution` | `referrerUserId` | `String?` | FK → `User.id`, relation **`"AttributionReferrerUser"`**, `SetNull` |
| `LinkToAppAttribution` | `referrerUser` | `User?` | relation field |

Back-relations added on other models: `City.pairStats`, `Club.gameSeries`,
`GroupChannel.gameSeries`, `Transaction.costShares`,
`Transaction.referralRewardsAsReferrerTx`, `Transaction.referralRewardsAsReferredTx`, and on `User`:
`ownedGameSeries`, `gameSeriesRegulars`, `gamesAsCostPayer`, `gameCostShares`,
`noShowNotesAuthored`, `pairStatsAsUserA`, `pairStatsAsUserB`, `monthlyRecaps`,
`referralRewardReceived` (singular — `referredUserId` is unique), `referralRewardsGiven`,
`ownedGoods`, `giftedGoods`, `spotOpenedDeliveries`, `liveGameNotifyDeliveries`,
`referrerAttributions`.

New indexes on existing tables: `Game` → `@@unique([seriesId, seriesOccurrenceDate])`,
`@@index([seriesId])`, `@@index([costPayerId])`, `@@index([lastSeatOpenedAt])`,
`@@index([resultsStatus, isPublic, showOnLiveRail])`; `GameParticipant` →
`@@index([noShowNotedById])`, `@@index([gameId, attendance])`; `User` →
`@@index([referredByUserId])` (+ `referralCode` unique); `Goods` → `@@unique([kind, assetKey])`,
`@@index([kind, isActive, sortOrder])`, `@@index([isActive, isFeatured])`;
`LinkToAppAttribution` → `@@index([referrerUserId])`.

### 2.3 New models — exact fields

#### `PlatformSetting`
`key String @id` · `value String @db.Text` · `createdAt DateTime @default(now())` ·
`updatedAt DateTime @updatedAt`. No indexes beyond the PK.

#### `GameSeries`
`id String @id @default(cuid())` · `ownerId String` · `name String` · `entityType EntityType` ·
`cadence GameSeriesCadence @default(WEEKLY)` · `weekday Int` (1 = Mon … 7 = Sun, club-local) ·
`startTimeLocal String` (`HH:mm`, local) · `durationMinutes Int` · `clubId String?` ·
`courtIds String[]` · `template Json` · `horizonDays Int @default(14)` ·
`seatDeadlineHours Int @default(48)` · `endsOn DateTime? @db.Date` ·
`status GameSeriesStatus @default(ACTIVE)` · `groupChannelId String?` · `createdAt` · `updatedAt`.
Relations: `owner User` (`"GameSeriesOwner"`, Cascade) · `club Club?` (SetNull) ·
`groupChannel GroupChannel?` (SetNull) · `occurrences Game[]` · `regulars GameSeriesRegular[]` ·
`skips GameSeriesSkip[]`.
Indexes: `ownerId`, `clubId`, `groupChannelId`, `status`.

#### `GameSeriesRegular`
`id` · `seriesId String` · `userId String` · `addedAt DateTime @default(now())` ·
`removedAt DateTime?` · `series` (Cascade) · `user` (Cascade).
`@@unique([seriesId, userId])`, `@@index([seriesId])`, `@@index([userId])`.
No `createdAt`/`updatedAt` — `addedAt` is the creation timestamp (same pattern as
`GameParticipant.joinedAt`).

#### `GameSeriesSkip`
`id` · `seriesId String` · `occurrenceDate DateTime @db.Date` · `createdAt` · `series` (Cascade).
`@@unique([seriesId, occurrenceDate])`, `@@index([seriesId])`. Append-only ⇒ `createdAt` only.

#### `GameCostShare`
`id` · `gameId String` · `userId String` · `amountCents Int` · `currency String` (ISO code) ·
`markedPaidAt DateTime?` · `confirmedAt DateTime?` · `method CostShareMethod @default(MANUAL)` ·
`transactionId String?` · `createdAt` · `updatedAt` · `game` (Cascade) · `user` (Cascade) ·
`transaction Transaction?` (SetNull).
`@@unique([gameId, userId])`, `@@index([gameId])`, `@@index([userId])`,
`@@index([transactionId])`, `@@index([userId, confirmedAt])` ← "what I still owe" /
`GET /transactions/owed`.

#### `PairStat`
`id` · `sport Sport` · `cityId String` · `userAId String` · `userBId String` ·
`games Int @default(0)` · `wins Int @default(0)` · `lastPlayedAt DateTime?` ·
`combinedLevel Float?` · `createdAt` · `updatedAt` · `city` (Cascade) ·
`userA` (`"PairStatUserA"`, Cascade) · `userB` (`"PairStatUserB"`, Cascade).
`@@unique([sport, cityId, userAId, userBId])`, `@@index([cityId])`, `@@index([userAId])`,
`@@index([userBId])`, `@@index([sport, cityId, games])` ← leaderboard scan with the ≥5-games
floor, `@@index([sport, cityId, lastPlayedAt])` ← period windows.
**Invariant: `userAId < userBId`, enforced in application code, documented with a `///` comment on
the model. Sort before every read and write.**

#### `MonthlyRecap`
`id` · `userId String` · `monthKey String` (`YYYY-MM`) · `payload Json` · `viewedAt DateTime?` ·
`sharedAt DateTime?` · `sharedSlideKeys String[]` · `createdAt` · `updatedAt` · `user` (Cascade).
`@@unique([userId, monthKey])`, `@@index([userId])`, `@@index([monthKey])` ← scheduler sweep per
month, `@@index([createdAt])` ← 12-month prune.

#### `ReferralReward`
`id` · `referredUserId String @unique` · `referrerUserId String` ·
`rewardedAt DateTime @default(now())` · `referrerTxId String?` · `referredTxId String?` ·
`revokedAt DateTime?` · `createdAt` · `updatedAt` ·
`referredUser` (`"ReferralRewardReferred"`, Cascade) ·
`referrerUser` (`"ReferralRewardReferrer"`, Cascade) ·
`referrerTx Transaction?` (`"ReferralRewardReferrerTx"`, SetNull) ·
`referredTx Transaction?` (`"ReferralRewardReferredTx"`, SetNull).
`@@index([referrerUserId])` ← the 50-per-referrer cap, `@@index([referrerTxId])`,
`@@index([referredTxId])`, `@@index([rewardedAt])` ← admin list / CSV.
On `User`: `referralRewardReceived ReferralReward?` (**singular**, because `referredUserId` is
unique) and `referralRewardsGiven ReferralReward[]`.

#### `UserGoods`
`id` · `userId String` · `goodsId String` · `purchasedAt DateTime @default(now())` ·
`giftedByUserId String?` · `equipped Boolean @default(false)` · `updatedAt` ·
`user` (`"UserGoodsOwner"`, Cascade) · `goods` (Cascade) ·
`giftedByUser User?` (`"UserGoodsGiftedBy"`, SetNull).
`@@unique([userId, goodsId])`, `@@index([userId])`, `@@index([goodsId])`,
`@@index([giftedByUserId])`, `@@index([userId, equipped])` ← the public projection's
`equippedGoods` lookup. No `createdAt` — `purchasedAt` is it.

#### `SpotOpenedDelivery`
`id` · `userId String` · `gameId String` · `dayKey String` (`YYYY-MM-DD`, game's city tz) ·
`kind SpotOpenedKind` · `createdAt` · `user` (Cascade) · `game` (Cascade).
`@@unique([userId, gameId, dayKey, kind])` ← **the dedupe key**, `@@index([userId])`,
`@@index([gameId])`, `@@index([createdAt])` ← prune.

#### `LiveGameNotifyDelivery`
`id` · `userId String` · `gameId String` · `createdAt` · `user` (Cascade) · `game` (Cascade).
`@@unique([userId, gameId])` ← the dedupe key, `@@index([userId])`, `@@index([gameId])`,
`@@index([createdAt])`.

### 2.4 `onDelete` decisions and why

| Relation | `onDelete` | Reason |
|---|---|---|
| `Game.seriesId → GameSeries` | `SetNull` | ending/deleting a series must keep its past occurrences (results, ratings, photos hang off them) |
| `Game.costPayerId → User` | `SetNull` | a deleted organizer must not delete the game |
| `GameParticipant.noShowNotedById → User` | `SetNull` | the note survives the noter |
| `User.referredByUserId → User` | `SetNull` | a deleted referrer must not delete the referred account |
| `LinkToAppAttribution.referrerUserId → User` | `SetNull` | attribution history survives |
| `GameSeries.ownerId → User` | `Cascade` | a series is meaningless without its owner; occurrences survive via the `SetNull` above |
| `GameSeries.clubId / groupChannelId` | `SetNull` | optional refs |
| `GameSeriesRegular.*`, `GameSeriesSkip.seriesId` | `Cascade` | owned children |
| `GameCostShare.gameId / userId` | `Cascade` | shares are owned by the game (deleting a game cascades its cost shares, as required) |
| `GameCostShare.transactionId` | `SetNull` | the ledger row is independent |
| `PairStat.cityId / userAId / userBId` | `Cascade` | **a deleted user must not orphan a `PairStat`** — the aggregate row goes away with either member |
| `MonthlyRecap.userId` | `Cascade` | personal data |
| `ReferralReward.referredUserId / referrerUserId` | `Cascade` | the record is about the pair |
| `ReferralReward.referrerTxId / referredTxId` | `SetNull` | ledger independence |
| `UserGoods.userId / goodsId` | `Cascade` | inventory is owned |
| `UserGoods.giftedByUserId` | `SetNull` | the gift survives the giver |
| `SpotOpenedDelivery.*`, `LiveGameNotifyDelivery.*` | `Cascade` | pure dedupe bookkeeping |

---

## 3. Deviations from CONTRACT.md §4 (all deliberate, all minor)

1. **`PlatformSetting.createdAt` added.** §4.3 lists only `key`/`value`/`updatedAt`. It has a
   default, so nothing downstream has to set it; the closest precedent
   (`LinkToAppCampaignLabel`, also a `String @id` key/value table) carries both timestamps.
2. **`GameSeriesRegular` / `GameSeriesSkip` / `UserGoods` / `SpotOpenedDelivery` /
   `LiveGameNotifyDelivery` do not have a `createdAt` + `updatedAt` pair.** They use the
   domain-named creation timestamp the contract specified (`addedAt`, `createdAt`, `purchasedAt`)
   rather than duplicating it. `UserGoods` keeps `updatedAt` because `equipped` is mutable.
   Append-only tables carry `createdAt` only, per §3.
3. **`Game.@@index([costPayerId])` added**, not in §4.1's index list — §3 requires an index on every
   FK column.
4. **`GameSeries.startTimeLocal` is a plain `String`** (contract wording), documented as `HH:mm`
   local with a `///` comment. No `@db.VarChar(5)`.
5. **`GameSeries.groupChannelId` is a plain nullable FK, not `@unique`.** A unique constraint would
   turn it into a Prisma 1-1 and would fail confusingly if a channel were ever re-pointed. If PRD
   345 wants "one channel per series" enforced, say so and I will add it.
6. **Extra performance indexes** beyond the contract's minimums, driven by the PRD access patterns:
   `GameCostShare[userId, confirmedAt]`, `PairStat[sport, cityId, games]`,
   `PairStat[sport, cityId, lastPlayedAt]`, `MonthlyRecap[monthKey]`, `MonthlyRecap[createdAt]`,
   `ReferralReward[rewardedAt]`, `UserGoods[userId, equipped]`, `Goods[kind, isActive, sortOrder]`,
   `Goods[isActive, isFeatured]`, `GameParticipant[gameId, attendance]`,
   `SpotOpenedDelivery[createdAt]`, `LiveGameNotifyDelivery[createdAt]`.

### Places where a PRD contradicts the contract — contract won, as instructed

- **PRD 345** says the series chat is linked by `GroupChannel.seriesId`. The contract puts
  `groupChannelId` on `GameSeries`. I implemented the contract. `GroupChannel` has **no**
  `seriesId` column; the PRD-345 agent must read `GameSeries.groupChannelId`.
- **PRD 347** says to extend `PlayIntentNotificationDelivery` with a `SPOT_OPENED` kind. The
  contract creates a dedicated `SpotOpenedDelivery`. I implemented the contract.
  `PlayIntentNotificationDelivery` is untouched.
- **PRD 355** lists a `Goods.stickerPackId?` FK. The contract's §4.4 list omits it, so I did **not**
  add it. `GoodsKind.STICKER_PACK` items must resolve the pack through `assetKey` (the sticker-pack
  key), or the orchestrator has to authorise a follow-up migration. **This is the one gap a
  downstream agent is most likely to trip on — flagging it explicitly.**
- **PRD 348** describes `GameCostShare.currency` loosely; I kept it as `String` (ISO code copied
  from `Game.priceCurrency`) rather than the `PriceCurrency` enum, because the contract says
  `currency String` and cost shares may outlive an enum change.

---

## 4. Files I could not touch — nothing needed

I needed no change outside my ownership. For the record, the schema now **requires** these
follow-ups from other agents (they are already in the contract, listed here as a checklist):

- `Backend/src/types/notifications.types.ts` — `PreferenceKey.SEND_WEATHER_ALERTS = 'sendWeatherAlerts'`
  (the Prisma column is `NotificationPreference.sendWeatherAlerts`).
- `Backend/src/services/notificationPreference.service.ts` — `DEFAULT_PREFERENCES.sendWeatherAlerts: true`
  and the 10 new `NOTIFICATION_TYPE_TO_PREF` entries.
- The orchestrator must run `npm run prisma:generate` before any agent writes Prisma client code —
  none of the new models exist on the client until then.

---

## 5. Known gaps

- `Goods.stickerPackId` is not in the schema (see §3). PRD 355's sticker-pack ownership path needs a
  decision.
- No check constraint enforces `PairStat.userAId < userBId`; Prisma cannot express it. The PRD-352
  agent must add a pure helper (e.g. `orderPairIds(a, b)`) and use it everywhere, plus a unit test.
- `GameSeries.template Json` is unvalidated at the DB level by design (it is a replayed create-game
  payload). The PRD-345 agent owns a Zod/TS shape for it.
- I did not add a `@@index` for the Find "live rail" ordering beyond
  `[resultsStatus, isPublic, showOnLiveRail]`; if the query also filters `cityId`, the PRD-349 agent
  should report whether `[cityId, resultsStatus, isPublic, showOnLiveRail]` is worth it after
  measuring — I did not want to add an index nobody uses.

---

## 6. Test files added

None. Schema and migrations only; there is nothing here a unit test can assert that
`prisma migrate` does not assert better.

---

## 7. Manual verification needed (orchestrator)

1. `cd Backend && npm run prisma:migrate` (or `prisma migrate deploy`) against `padelpulse_dev`
   — 1 376 users, 2 882 games, 10 248 clubs, 4 233 cities. Expect the five migrations to apply in
   timestamp order with no drift warning.
2. `npm run prisma:generate` before Wave 2 starts writing client code.
3. Spot-check after the run:
   - `SELECT count(*) FROM "User" WHERE "onboardingCompletedAt" IS NULL;` → **0**.
   - `SELECT "kind", "assetKey", "isActive" FROM "Goods" LIMIT 5;` → all `PROFILE_FRAME`,
     `assetKey = id`, `isActive = false`, and the columns are `NOT NULL`.
   - `SELECT * FROM "PlatformSetting";` → exactly two rows, `REFERRAL_REWARD_REFERRER = 50` and
     `REFERRAL_REWARD_REFERRED = 25`. **`COINS_PER_CURRENCY_UNIT` must be absent** — that is the
     "coins settle option hidden" state PRD 348 depends on.
4. `prisma migrate dev` must report **no drift**. I verified every generated column type,
   nullability, default, index name, FK name and `ON DELETE` clause against the schema
   programmatically (both directions: schema → SQL and SQL → schema) and `prisma validate` passes,
   but only a real run proves it.
5. Do **not** run `prisma format` on `schema.prisma` during this programme — 14 pre-existing models
   are off-format and it would produce a ~700-line whitespace diff across everyone's work.
