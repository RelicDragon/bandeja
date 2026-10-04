# Novice mode

PRD #358. A progressive first-weeks experience: every **counted game** raises the user's **novice rank** until they become **Regular** at 5. Ranks reveal navigation entry points; they never block a route. Organizers get credit (Talent Scout / Ambassador) for bringing newcomers in.

## Contract (`@bandeja/shared/novice`)

`Frontend/shared/novice/index.ts` — canonical for FE (`@shared/novice`) and BE (`@bandeja/shared/novice`, no BE copy).

| Rank | Id | Counted games |
|------|----|---------------|
| 0 | `newcomer` | 0 |
| 1 | `debut` | 1 |
| 2 | `rookie` | 2 |
| 3 | `contender` | 3 |
| 4 | `challenger` | 4 |
| 5 | `regular` | 5 (`NOVICE_REGULAR_THRESHOLD`) |

- `noviceRankForCount(n)`, `noviceRankId(rank)`, `noviceProgressToRegular(count)`.
- `NOVICE_FEATURE_MIN_RANK` — feature → min rank: `homeShell` / `findTab` / `calendar` / `pastGames` (1); `chatsTab` / `followPlayers` / `playStreak` / `createGame` (2); `topTab` / `levelHistory` / `playerComparison` (3); `leagues` / `tournaments` / `marketTab` / `stories` / `liveRail` / `userTeams` (4); `aiAssistant` / `wallet` / `createLeague` / `ads` (5).
- `isNoviceModeActive(user)` = `noviceRank < 5 && !noviceUnlockedAllAt`. A payload **without** novice fields (old API, guest) is never in novice mode. `isNewcomerUser` is the same rule (🌱 badge).
- `hasNoviceFeature(user, feature)`, `featuresUnlockedAtRank(rank)`, `featuresUnlockedBetween(from, to)` (combined multi-rank reveal), `hasPendingNoviceCelebration(user)` (`noviceRank > noviceMilestoneSeenRank`, not unlock-all).

## Data (`User`)

`noviceCountedGames`, `noviceRank` (monotonic), `noviceMilestoneSeenRank`, `noviceUnlockedAllAt`, `noviceDebutGameId`, `noviceDebutHostUserId` (indexed). Migration `20261005210000_novice_mode` backfilled counts / rank / seen-rank for everyone and set `noviceUnlockedAllAt = now()` for every existing user **except** accounts created in the 30 days before it with 0 counted games. New accounts start at rank 0 in novice mode.

## Counted game

User is `PLAYING` in a game with `status` `FINISHED` or `ARCHIVED` (never `EVENT` / `LEAGUE_SEASON`) and either a `GameOutcome` row for the user, or the game is `TRAINING` / `BAR` and the participant has no `noShowNotedAt`. Each game counts once. Rule: `countedGamesWhere` / `isCountedGame` in `Backend/src/services/novice/noviceRules.ts` (the migration SQL mirrors it).

## Recount (never increment)

`Backend/src/services/novice/noviceProgress.service.ts`:

- `recountNoviceProgress(tx, userId)` locks the user row (`FOR UPDATE`), counts, sets `noviceRank = max(stored, rankFor(count))`. Undone results lower the count, never the rank.
- **Debut**: established once, on the 0 → ≥1 transition, at the earliest counted game. `noviceDebutHostUserId` = that game's `OWNER` participant, or null when the newcomer owned it (no self-credit). Users backfilled with games never get a debut (no retroactive credit).
- `grantNoviceOrganizerCredit` (same transaction): Talent Scout to the new debut host; Ambassador to the debut host when the newcomer crosses into Regular.
- Rank-up push `NOVICE_RANK_UP` ("Your results are in — you reached {rank}", data `{ noviceRank }`, pref `sendReminders`, copy in `novicePushCopy.ts`) after commit; never for unlock-all users. The durable signal is `noviceRank > noviceMilestoneSeenRank`; the push is best-effort.

Hooks — all **post-commit**, own transaction per user, never throw:

| Where | Hook |
|-------|------|
| `recalculateGameOutcomes` (results FINAL / edit) | `onGameEndedForNovice` next to the attendance / pair-stat / referral hooks |
| `GameStatusScheduler.updateGameStatuses` → FINISHED / ARCHIVED | `onGameEndedForNovice` (TRAINING / BAR, plus a catch-all for other paths) |
| `GameUpdateService.updateGame` status → FINISHED / ARCHIVED | `onGameEndedForNovice` |
| `finishTraining` | `onGameEndedForNovice` |
| `deleteGameResults` / `resetGameResults` / `editGameResults` | `onGameResultsUndoneForNovice` (count stays honest; rank and debut never move back) |

## API

Mounted at `/api/users` before `user.routes.ts` (`Backend/src/routes/novice.routes.ts`):

- `GET /users/me/novice` → `{ noviceCountedGames, noviceRank, noviceMilestoneSeenRank, noviceUnlockedAllAt }`
- `POST /users/me/novice/unlock-all` → same shape; sets `noviceUnlockedAllAt` once (first timestamp kept).
- `POST /users/me/novice/milestone-seen` body `{ rank: 0..5 }` → same shape; `seen = max(seen, min(rank, noviceRank))`.

Payloads: the current-user profile (`PROFILE_SELECT_FIELDS`) carries all four state fields; every basic user (`USER_SELECT_FIELDS` — rosters, player cards, game detail) carries `noviceRank` + `noviceUnlockedAllAt` for `isNewcomerUser`. Find-card slim users do not. `GET /users/:id/stats` adds `newPlayersBroughtCount` (users whose `noviceDebutHostUserId` is them).

## Organizer side

- Achievements `HABIT_TALENT_SCOUT` (MILESTONE 1 / 5 / 15 / 50) and `HABIT_AMBASSADOR` (1 / 5 / 15) in `Frontend/shared/achievements/catalog.ts`; lifetime `sourceKey: ''`, granted with `ON CONFLICT DO NOTHING` (`Backend/src/services/achievements/noviceHostGrant.service.ts`). Cabinet progress counters `talentScoutCount` / `ambassadorCount`. Not leaderboard families.
- **Newcomer demand pings**: when a novice-mode user's play intent is matched (`PlayIntentMatchService.matchIntentToGames`), owners of up to 3 matching `suitableForNovices` games (public GAME/BAR, open PLAYING slot, overlapping window) get `PlayIntentNotifyService.maybeNotifyOwnerNewcomerLooking`. Same `PlayIntentGameOwnerPing` table with `kind = NEWCOMER` and `dayKey` (city-local day) → once per game per day, own 6 h budget (2 per owner). Type `INTENT_PLAYERS_FOR_GAME` (opens the game in store builds) with `data.newcomer = '1'`.

## Frontend — celebration, push, badge, organizer stat

- **Milestone sequence**: `Frontend/src/components/novice/celebration/NoviceCelebrationHost.tsx` (mounted once in `App.tsx`) watches the auth-store user. When `hasPendingNoviceCelebration(user)` it plays one blocking full-screen sequence for everything since the acknowledged rank: congrats ("first game" / "Game #N", latest own `GameOutcome` from past games if played ≤ 14 days ago) → achievements (outcome `habitUnlocks` + profile `pendingCelebrations` not yet shown, max 3; marked shown in `trophyCelebrationGate` so the trophy sheet never repeats them) → rank-up (old → highest emblem, ladder, progress to Regular) → reveal of `featuresUnlockedBetween(seen, rank)` minus `ads`, ending on "You're a Regular — the full app is yours" at rank 5. Step list: `buildNoviceCelebrationPlan` (`noviceCelebrationPlan.ts`).
- **Ack**: on close, `markNoviceMilestoneSeen(highestRank)` (`useNovice.ts`) → once across devices. A failed ack does not replay in the same JS session (`noviceCelebrationSession.ts`); the next launch replays and re-acks. Killing the app mid-sequence acks nothing.
- **Gate priority**: `claimNoviceCelebration` / `releaseNoviceCelebration` in `trophyCelebrationGate.ts`. While a novice sequence is pending or open, trophy claims are refused (they retry on `TROPHY_CELEBRATION_RELEASED`); an already-open trophy sheet finishes first.
- **Triggers**: profile refresh on navigation, `useNoviceForegroundRefresh` on resume, and the push — never the push alone. `NOVICE_RANK_UP` tap → Home + `refreshNoviceState`; foreground receipt → refresh (`services/push/noviceRankUpFromPush.ts`).
- **Motion**: framer-motion only (radial burst on the rank-up step is the one confetti-like moment the app allows); `prefers-reduced-motion` → fades, no burst. Haptics via `utils/haptics.ts`.
- **🌱 badge**: `PlayerAvatar` renders `NewcomerAvatarGlyph` (`components/novice/badge/`) in its own badge layer when `isNewcomerUser(player)` — top-left slot, top-right when the role crown holds top-left, omitted when the remove button also holds top-right and on face-only sizes (`superTiny` / `inlineFace`). Opt out per avatar with `showNewcomerBadge={false}`. Player card header: `NewcomerRankPill` ("Newcomer · <rank>").
- **Organizer stat**: `NewPlayersBroughtStat` ("Brought N new players", hidden at 0) on own Profile statistics and the player card header, from `GET /users/:id/stats` `newPlayersBroughtCount`.
- i18n: `novice.celebration.*`, `novice.badge.*`, `novice.organizer.*` in `locales/<lng>/novice.json`.

## Tests

`cd Backend && npm run test:novice` (rules unit + DB integration). `cd Frontend && npm run test:novice-mode` (shared contract + achievements catalog, `src/components/novice/**` — celebration sequencing, gate priority, badge visibility — and push tap routing).
