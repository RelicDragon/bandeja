# Reverification — PRDs 345–357

Independent pass over the working tree, run after `critic-signoff.md`. Unlike every earlier
report in this directory, this one **executed** the gates rather than reading the tree.

## Verdict

**Matches.** Every PRD's schema, endpoints, services, schedulers, notification types, socket
events, feature flags, frontend surfaces, deep links, i18n namespaces, migrations and docs are
present and wired. Two pre-existing frontend test files broke on the PRD 355 avatar/name change
and were fixed here. One failing backend suite (`test:automated`, "multisport phase 1") fails on
`master` too and is unrelated.

## Mechanical gates (all executed)

| Gate | Result |
|---|---|
| `Backend` `npm run lint` | pass |
| `Backend` `npm run build` (tsc) | pass |
| `Frontend` `npm run lint` | pass |
| `Frontend` `tsc --noEmit` | pass |
| Backend: every `test:*` script | pass, except `test:automated` (see below) |
| Frontend: every `test:*` script | pass after the two fixes below |
| `Backend` `npm run test:prd-integration` (real DB) | pass — 10 integration suites |
| `npx prisma migrate status` | all 345–357 migrations applied; only the unrelated `20260920120000_add_weltner_booking` is pending |

## Regressions found and fixed

Both are the same defect: PRD 355 made `PlayerAvatar` and `PremiumName` import
`@/features/collection/useEquippedGoods`, whose store reaches `api/axios` →
`utils/deletedUserHandler` → `i18n/config` **at module load**. Two pre-existing suites mock
`react-i18next` with `useTranslation` alone, so loading the real config throws
`No "initReactI18next" export is defined on the "react-i18next" mock` and the whole file fails to
collect (0 tests run).

| File | Suite | Note |
|---|---|---|
| `Frontend/src/components/PlayerAvatar.levelSport.test.tsx` | `test:chat-inbox-feed` — **in CI** (`.github/workflows/ci.yml`) | CI would have gone red on this branch. |
| `Frontend/src/components/PremiumName.test.tsx` | `test:premium-visibility` — not in CI | |

Fix in both: `vi.mock('@/features/collection/useEquippedGoods', …)`, matching the isolation style
each file already uses for every other store and hook `PlayerAvatar` touches, and matching the
mock the new sibling `PremiumName.collection.test.tsx` already writes. The cosmetic behaviour
itself stays covered by `PremiumName.collection.test.tsx` and the `test:shop` suites.

## Pre-existing failure, not from this programme

`npm run test:automated` stops at suite 2/141, "multisport phase 1":

```
FAIL: invite list projects sender/participants by sport
```

The assertion is a source guard — `multisport-phase1.ts:81` requires
`Backend/src/services/invite.service.ts` to contain `projectUserForSportContext`. It does not, and
`git show master:Backend/src/services/invite.service.ts` does not either, so the suite fails on
`master` identically. `test:automated` is not in CI. Out of scope here.

## Deviations from the PRD text (all defensible; CONTRACT.md wins where it spoke)

| PRD | Text said | Built as | Verdict |
|---|---|---|---|
| 345 | series chat linked by `GroupChannel.seriesId` | `GameSeries.groupChannelId` | inverted FK, same behaviour |
| 346 | socket `game:attendance-updated` | `game-attendance-updated` | CONTRACT §1 mandates kebab-case; correct |
| 345/346/357 | token kinds `SERIES_CONFIRM`, `ATTENDANCE_CONFIRM`, `WEATHER_KEEP` | `kind` × `action` pairs enforced on sign and verify | stricter, same coverage |
| 355 | `equippedGoods` on the public user projection | batched `GET /shop/equipped` + `equippedGoodsStore` | one request per screen instead of per profile read; rendered by `PlayerAvatar` and `PremiumName` |

## Known gaps carried forward (unchanged, already documented)

- **PRD 346 native push-shade actions are not built.** Tokens are minted and Telegram's inline
  buttons work, but the Android receiver and the iOS `UNNotificationCategory` are not written, so
  "I'm coming" from the lock screen is Telegram-only. Recorded in `docs/product/not-shipped.md`.
- Dead surfaces: `GET /referrals/game-link/:gameId`, `GET /shop/items/:goodsId`,
  `POST /rankings/pairs/recalculate` (no Admin UI).
- `onboardingAnalytics.ts` is a documented no-op seam — the app has no analytics client.
- `paymentHint` cross-device staleness and the FREE-game retention of a stored hint are deliberate
  (`docs/product/constraints.md`, `fix-payment-hint-regression.md`).
- The live device repro of the `paymentHint` chain has still not been run.

## Not verified here

- No device run, no Telegram bot exercise, no Admin panel click-through, no Playwright
  (`test:e2e`, `test:game-results-share` were not run).
- Two changed test files belong to other concurrent work in this shared tree
  (`player-level-feedback.test.ts`, `liveScoringTransitionVerify.test.ts`) and are in no npm
  script. Both pass when invoked directly; wiring them is not this programme's call.
