# Docs merge — PRD 345–357 staged material

Staged directories `ui-test-plan/` and `domains/` were merged into the canonical docs and then **deleted**. `reports/`, `CONTRACT.md` and the `prd-*.md` files are untouched.

No source code was changed. No heavy commands were run.

---

## 1. UI test plan (`docs/UI_TEST_PLAN.md`)

2,264 → 3,276 lines. Sections 1–23 keep their numbers and every existing case ID, so the Cursor rule and the release scripts are unaffected. New top-level sections were appended as 24–30 and `## References` moved from 24 to **31** (still last).

| Staged file | Destination | ID prefix |
|---|---|---|
| `prd-345.md` (series) | §8.6 Repeat (recurring series); §9.10 Series occurrence surfaces; **§25 Game series (`/series/:id`)** | `C-SER-*`, `GD-SER-*`, `SER-*` |
| `prd-346.md` (attendance) | §6.6 Attendance glance on my cards; §9.11–§9.14 (card / dots / no-show notes / nudge); §13.4 "Shows up" tile; §18.8b push rows | `H-AT-*`, `GD-AT-*`, `PR-AT-*`, `PN-AT-*` |
| `prd-347.md` (spot opened) | §7.4b card pills; §9.15 Queue, auto-fill and the open seat; §18.8b push rows | `F-SO-*`, `GD-SO-*`, `PN-SO-*` |
| `prd-348.md` (cost split) | §9.2b Cost split; §8.3b price preview & payment hint; §7.4b per-head price; §13.3 Wallet rows | `GD-CS-*`, `C-CS-*`, `F-CS-*`, `PR-CS-*` |
| `prd-349.md` (live now) | **§26 Live now**; §9.19 Live block and Show on Live now; §18.8b follower push | `LN-*`, `GD-LN-*`, `PN-LN-*` |
| `prd-350.md` (onboarding) | **§24 Onboarding (`/welcome`)**; §5.2 `A-10` / `A-15` corrected | `ON-*` |
| `prd-351.md` (referrals) | **§29 Referrals**; §13.3 Invite friends card; §18.6 `X-26v` pointer; §18.8b payout push | `RF-*`, `PR-RF-*`, `PN-RF-*` |
| `prd-352.md` (pairs) | §14.1 heading added over the existing player table; **§14.2 Pairs**; §15 `UT-16`/`UT-17`; §13.4 Your partners | `LB-PR-*`, `PR-PT-*` |
| `prd-353.md` (monthly recap) | §6.7 Monthly recap (story rail); §13.4 Recaps archive; §18.8b recap push | `RC-*`, `PR-RC-*`, `PN-RC-*` |
| `prd-354.md` (club page) | **§27 Club page (`/clubs/:id`)**; §7.3 club chevron rows | `CLB-*`, `F-CLB-*` |
| `prd-355.md` (shop) | **§28 Shop and collection (`/shop`)**; §13.3 entry points; §18.8b gift push | `SH-*`, `PR-SH-*`, `PN-GF-*` |
| `prd-356.md` (Telegram) | **§30 Telegram bot commands** | `TG-*` |
| `prd-357.md` (weather) | §9.16–§9.18 (banner / move indoor / keep as planned); §7.4b weather pill; §17 court cover; §18.8b weather push | `GD-WX-*`, `F-WX-*`, `CA-WX-*`, `PN-WX-*` |

Placement notes:

- The staged files each claimed `## 25` or `## NN`; none of the suggested numbers survived. Sub-numbers were also renumbered (`9.20–9.22` → `9.16–9.18`; `4.9` → `6.6`; `12.7` → `13.4`; `18.5` → `18.8b`; `20.6` → §17 rows).
- `12.7 "Shows up" tile` was staged for "§12 Player card". §12 is **Marketplace** — it went to §13 Profile.
- Cost split was staged as a bullet list plus its own tables; it is now `### 9.2b`, directly after §9.2 Participation, matching the existing `4.1b` letter-suffix convention.
- The pair leaderboard became §14.2 under the existing Leaderboard section rather than a new top-level section; the shop earned its own section because it is a new route with seven case groups.
- Everything was converted from the staged bullet form into the file's house format: `| ID | Test | Steps | Expected |` tables with a stable ID prefix. PRD 348 was already in that form and kept its `GD-CS-*` ids.
- §1 scope, §20 P2/P3 and the two register cases were updated to match.

---

## 2. Domain docs

| Staged block | Destination |
|---|---|
| 345 · series model, generation, edit scope, access, carry-over | `domains/games.md` → new `## Game series (recurrence)` |
| 345 · Repeat row | `domains/create.md` → under Scheduling |
| 345 · `seriesLabel` enrichment | folded into the single card-enrichment table in `home-and-find.md` |
| 345 · carry-over notification | `games.md` (mechanics) + `notifications.md` (type table, push-token registry) |
| 346 · attendance data, services, API, nudge, socket | `games.md` → `### Attendance` under Participation |
| 346 · counters and the public rate | `social-and-profile.md` → Statistics (staged target `domains/users.md` does not exist) |
| 346 · notifications and shade actions | `notifications.md` → type table + push-action registry |
| 347 · seat service, triggers, auto-fill | `games.md` → `### Spot opened and queue auto-fill` |
| 347 · delivery, audience, dedupe | `notifications.md` → type table + `### Persisted delivery and dedupe` |
| 347 · card enrichment + client sorting | `home-and-find.md` → `## Card enrichment` |
| 348 · cost split ledger (whole block) | `economy.md` → `## Cost split ledger` |
| 349 · live rail predicate, summary, ordering, spectator mint | `live-scoring.md` → `## Watching a live game` |
| 349 · `Game.showOnLiveRail` | `games.md` → Settings |
| 349 · `FOLLOWED_USER_LIVE` | `notifications.md` |
| 350 · onboarding columns, gate, endpoints, suggestions | `social-and-profile.md` → `## First-run onboarding` |
| 350 · `GET /cities/:id/stats` | `cities.md` → `### City stats` |
| 350 · "onboarding does not replace the Home prompts" | `home-and-find.md` |
| 351 · referrals ride the attribution row | `ads-and-attribution.md` |
| 351 · payouts, cap, abuse | `economy.md` → `## Referral payouts` |
| 351 · notification types and tap routing | `notifications.md` |
| 352 · `PairStat` derivation and rebuild | `results.md` → `## Pair stats` |
| 352 · chemistry | `ratings.md` → `### Chemistry` |
| 352 · pair leaderboard API | `ratings.md` → `### Pairs tab` (staged target was `games.md`; it belongs next to the leaderboard) |
| 353 · `MONTHLY_RECAP` story source | `stories.md` → `## Monthly recap` |
| 353 · recap payload, scheduler, neutral-level rule | `social-and-profile.md` → `## Monthly recap payload` |
| 354 · public club page + regulars privacy | `club-admin.md` → `## The public club page` |
| 354 · read-only occupancy | `booking.md` → `### Read-only occupancy surfaces` |
| 354 · `?date=` and `?clubIds=` deep links | `booking.md` and `home-and-find.md` respectively |
| 355 · cosmetics shop | `economy.md` → `## Cosmetics shop` |
| 355 · shop-gated sticker packs, chat accent | `chat.md` |
| 355 · Goods admin page + security note | `admin.md` |
| 356 · `/play`, `/live`, callback prefixes, command menu | `notifications.md` → Telegram section (there is no `domains/telegram.md`; the bot lives there) |
| 356 · namespaced backend copy modules | `notifications.md` → `### Backend copy modules` (there is no `domains/i18n.md`) |
| 357 · weather alerts + outdoor detection | `weather.md` → `## Weather alerts (outdoor games)` |
| 357 · move indoor | `weather.md` (endpoint + rules), `booking.md` (availability), `games.md` (pointer) |
| 357 · notifications | `notifications.md` |
| 357 · court cover control | `club-admin.md` |

Three files named a destination that does not exist. `domains/users.md` → `social-and-profile.md`; `domains/telegram.md` and `domains/i18n.md` → the Telegram and copy sections of `notifications.md`. No new domain file was created, so `docs/README.md`'s tree is unchanged.

`docs/APP_FUNCTIONALITY.md` §2.2 gained six compact rows so its inline table matches the PRD 345–357 block that already existed in `docs/product/constraints.md`.

---

## 3. What was deduplicated

The staged set described the same five shared mechanisms up to five times each. Each is now written once, with cross-references from the features that use it.

| Mechanism | Written once in | Previously repeated by |
|---|---|---|
| **Push action tokens** — `{ userId, kind, targetId, action }`, 48 h, kind × action allow-list enforced on sign *and* verify, `registerPushActionHandler` registry, stale token is a quiet no-op | `notifications.md` → `### Push action buttons` | 345 (`series`), 346 (`attendance`), 357 (`weather`) |
| **Persisted delivery / dedupe** — claim before dispatch, revalidate on retry, never an in-process `Set` | `notifications.md` → `### Persisted delivery and dedupe`, with one table row per feature's claim key | 346, 347, 348, 349, 351, 353, 357 — all of them re-argued the "not a `Set`" point |
| **Card enrichment pipeline** — `registerAvailableGamesEnricher`, bounded batched query, import-time registration, hand-mirrored types | `home-and-find.md` → `## Card enrichment`, one table of all seven enrichers | 345, 346, 347, 348, 349, 357 |
| **Notification type → preference key** | one table in `notifications.md` | ten separate one-row tables |
| **Namespaced backend copy modules** (`seriesT`, `liveT`, weather, referral, recap) | `notifications.md` → `### Backend copy modules` | 345, 349, 351, 353, 356, 357 |
| **Post-commit hooks on `recalculateGameOutcomes`** | `results.md` → `## Post-commit hooks on finalisation` | 345, 346, 351, 352 each explained "why post-commit" separately |

Also removed as duplication:

- Every staged file ended with an "Invariants for `docs/product/constraints.md`" block. **`constraints.md` already carries an accurate, audited `## PRD 345–357 invariants` section**, written after the audit cycles. Nothing was copied in — the domain docs link to it instead. This is why, e.g., `games.md` states the attendance allow-list in one sentence and points at constraints rather than restating the enforcement matrix.
- `economy.md`'s old `## Goods` section said "**No shop UI**". Replaced, not appended to.
- Two staged blocks (347 and 351) each described the whole play-intent delivery contract; both now point at the existing text in `constraints.md`.

---

## 4. Where staged text contradicted the code

Everything below is a case where the builders' text described pre-audit behaviour. The code wins; the merged text says what the code does.

| # | Staged claim | Code | What was written |
|---|---|---|---|
| 1 | PRD 347 queue panel: a queued player can only be seated by the organizer or by auto-fill | `participant.service.ts` `joinGame`: a queued player re-runs every gate; with `allowDirectJoin` **true** and a free seat they become PLAYING through the ordinary path. `allowDirectJoin` false → `spots.queue.waitForOrganizer` | `games.md` Participation gained the self-promotion paragraph; UI cases `GD-SO-07` / `GD-SO-08` cover both branches. The staged "Join now runs the normal join flow" case was kept and is now consistent |
| 2 | PRD 348 invariant 7: "a share is marked paid only **after** the transfer returns … the timestamps are written last" | `gameCost.service.ts` claims the `GameCostShare` row with a conditional `updateMany` **before** calling `createGuardedTransfer`, and releases the claim scoped to `confirmedAt: claimedAt` when no money moved | `economy.md` rule 7 rewritten as claim-first / release-on-failure. `GD-CS-13` now says the row is claimed before the transfer |
| 3 | PRD 348 said the coin settle goes through "the normal P2P transfer" / `TransactionService.createTransaction` | it uses `createGuardedTransfer`, a narrowly-scoped sibling whose balance check **is** the debit (`UPDATE … WHERE wallet >= total`, wallet writes ordered by user id) | `economy.md` → Transactions documents both writers and why the generic one was left alone |
| 4 | PRD 355: "an owner already holding a `REFUND` transaction row for that `goodsId` is skipped" | `refundGoodsOwners` claims the **ownership instance** with `deleteMany` on the `UserGoods` row, in the same transaction as the payout; the lifetime rule lost the money on withdraw → reactivate → re-buy → withdraw | `economy.md` rewritten; new UI case `SH-66` exercises the re-buy cycle |
| 5 | PRD 355 purchase steps did not say what authorises the spend | the conditional `updateMany({ wallet: { gte: price } })` is the authorisation, not the earlier `rejectPurchase` read | stated explicitly in `economy.md` and in `SH-35` |
| 6 | PRD 346: "Open a STARTED / FINISHED game as a player → no attendance card" | `gameAcceptsAttendanceAnswers` gates on `timeIsSet` + `canMutateGameRoster` + `startTime > now`. `Game.status` is never consulted — it fails **open** for a backdated game, which is the defect this replaced | `GD-AT-10` rewritten to name `resultsStatus` and start time and to call out the backdated-game trap; `games.md` says the same |
| 7 | PRD 346: no-show window described as "finished less than 7 days ago" | `isWithinNoShowWindow` measures from the game's **end** time | `GD-AT-30` / `GD-AT-39` and `games.md` say "end time" |
| 8 | PRD 345: `/series/:id` treated as broadly viewable; only `PATCH` was said to be owner-gated | `getSeriesDetail` requires `isSeriesInsider` and throws **403 `series.notAMember`**; the payload names every regular, lists private occurrence cards and exposes the group-channel id | `games.md` documents the three predicates (`isSeriesManager`, `canRemoveSeriesRegular`, `isSeriesInsider`, plus `evaluateSeriesSeatClaim`); new case `SER-24` covers the stranger, and `SER-31` keeps the missing-series case separate |
| 9 | PRD 349/354: results and club payloads described only by their happy path | `GET /api/results/game/:gameId` (+ round/match) now runs `assertCanReadGameResults` (404, never 403) over a `RESULTS_*_SELECT` whitelist that deliberately excludes `paymentHint`, `bio`, `weeklyAvailability`, `socialLevel` | new `## Reading results` section in `results.md`; `club-admin.md` names the same discipline for `PUBLIC_CLUB_SELECT` |
| 10 | PRD 347: "`spotOpenedEnricher` registered as `prd347.spotOpened` … registration happens at import time of `gameSeat.service`" | true but indirect — the call is in `spotOpenedEnricher.ts`, which `gameSeat.service.ts` imports for its side effect | stated accurately in `home-and-find.md` |
| 11 | PRD 357 referred to "the 12 h scheduler pass" | the weather step runs inside `GameStatusScheduler` at `0,30 * * * *`; 12 h is the *window*, not the cadence | `weather.md` and `GD-WX-13` corrected |
| 12 | PRD 350: "`Frontend/e2e/specs/auth/register.spec.ts` A-10 and A-15 were already updated" | left as an assertion about the spec, not the plan | `A-10` now states the destination is `/welcome` and cites the spec; `A-15` notes the sport step opens pre-selected |
| 13 | PRD 346 / 345 / 357 all describe answering from the **push shade** as working ("Tapping a shade action does not open the app", "the push shade actions I'm in / Not this time seat or do nothing") | The tokens, the endpoint and the handlers all exist, but no native shade button does. `ChatReplyMessagingService.java` branches only on `invite_actions` and `play_intent_actions`; `fcm.service.ts` sets `nativeHandler = 'attendance_actions'` with nothing listening, and `series` / `weather` set no `nativeHandler` at all. iOS derives a category but registers no matching `UNNotificationCategory`. `docs/product/not-shipped.md` (written by an earlier audit agent) already said so | `notifications.md` gained a "where each kind is actually tappable today" table; a new `@shade` precondition tag was added to §3 and §18.8b carries a blockquote saying to run those rows against Telegram and the in-app card until the native work lands. `PN-AT-01b`, `PN-SER-01b` and `PN-WX-01` split the payload assertion from the shade assertion |

Two staged claims were checked and confirmed correct, so they were kept verbatim in substance: the auto-fill level-gate asymmetry (`acceptNonPlayingParticipant` passes `skipLevelCheck: true`, auto-fill pre-checks) and the series idempotency being `Game.@@unique([seriesId, seriesOccurrenceDate])` with the `P2002` branch as the correctness path.

---

## 5. Code observations (not touched)

1. **`spots.queue.autoFillOff` copy is imprecise on direct-join games.** `Frontend/src/features/spot-opened/GameQueuePanel.tsx` renders "Organizer accepts manually" whenever `autoFillEnabled` is false, regardless of `allowDirectJoin`. On a game with `allowDirectJoin: true` a queued player *can* seat themselves once a seat frees (`participant.service.ts`), so the copy tells them the opposite of what the API will do. The panel has the game in scope; a third string for the direct-join case would fix it.
2. **`Frontend/src/features/spot-opened/spotOpenedWindow.ts` `sortDayGroupGames` has a known duplicate caller.** `Frontend/src/utils/groupGamesByDate.ts` and a private copy of the grouping logic inside `Frontend/src/components/home/UpcomingGamesList.tsx` both sort; the two are not shared and will drift. Documented in `home-and-find.md` as a caution, but it is a real duplication worth collapsing.
3. **`Backend/src/routes/results.routes.ts` `GET /game/:gameId/spectator` has no `optionalAuth` and no `assertCanReadGameResults`.** It is gated by the signed spectator token inside `getGameResultsForSpectator`, which is correct, but it is the one sibling of the newly-hardened read path that does not route through the shared access helper — worth a comment at minimum so the next person does not assume it was missed.
4. **`Backend/src/controllers/results.controller.ts` still has `console.log` tracing in `resetGameResults`** (`[RESET GAME RESULTS CONTROLLER] …`, two calls). Unrelated to this programme; noticed while verifying the read path.
