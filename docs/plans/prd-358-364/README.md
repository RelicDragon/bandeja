# PRDs 358–364 — Engagement weeks 1–5

**Status: all seven closed 2026-09-22.** See "Closing" at the end.

Source plan: `docs/plans/engagement-growth.md` (§3 order, §5 briefs). Numbers are **document numbers**, not GitHub issue numbers: unlike 345–357, this set was never filed on the tracker (GitHub is still at 357), so these files and their reports are the record. 358–364 are therefore reserved and must not be reused if issues are filed later (`docs/agents/issue-tracker.md`).

Engineering conventions: `docs/plans/prd-345-357/CONTRACT.md` §0 hard rules, §3 Prisma, §5 backend, §7 frontend, §8 i18n, §10 tests apply verbatim. Design language: the "Design language" section at the end of `docs/plans/prd-345-357/prd-346.md` applies to every PRD here.

## Grouping

One PRD per **surface + data change**. Items were grouped when they share a component and a test plan, and split when they need a different migration, a different owner file set, or a different rollout switch.

| PRD | Title | Week | Size | Schema | Status | Why this grouping |
|-----|-------|------|------|--------|--------|-------------------|
| 358 | Find day-and-time shortcuts (Today · Tonight · Tomorrow · Weekend) | 1 | S | none | Closed | Pure client filter state in one header control. |
| 359 | Seat count and queue position on game cards | 1 | S | none | Closed | Both read roster state already on the card; one projection check, one test file. |
| 360 | Novices welcome (organizer toggle, tag, filter) | 1 | S | 1 column | Closed | Own migration and eight touch points; must not be bundled with a no-schema PRD. |
| 361 | Played with: recent co-players in invite Search | 2 | M | none | Closed | Backend query reuse + one modal pane. |
| 362 | Play with this group again | 2–3 | M | none | Closed | Evolves the existing Play again + Duplicate; separate from 361 because different files and owners. |
| 363 | Find recovery actions and looking-to-play count | 3 | M | none (+ 1 platform setting key) | Closed | Both live in the Find empty state; the count is flagged inside the same PRD. |
| 364 | Organizer next actions | 4–5 | M | none | Closed | Replaces two existing organizer surfaces; needs its own rollback switch. |

Deliberately **not** in this set: saved filter alerts (schema + matcher, demoted), calendar feed, time-change v0, anything touching booking providers (parked, plan §5.7).

## Verified 2026-09-22 (facts that changed the briefs)

- `GameResultsShareCard` already renders **Play again** for GAME playing participants; it navigates to `/create-game` with `buildDuplicateGameInitialData(game)`, which copies `courtId`, `startTime`, `endTime`, `hasBookedCourt` and passes **no** invitees. A second **Duplicate** `GameActionCard` exists on the shell. PRD 362 unifies them.
- `CreateGameWrapper` already accepts `state.invitedPlayerIds` → `CreateGame.initialInvitedPlayerIds`, and `CreateGame` sends invites after `POST /games` (line ~1596). PRD 362 needs no new invite path.
- The invite user-search handler in `Backend/src/controllers/user/social.controller.ts` already computes `gamesTogetherCount` with a raw query on `gp1.status = PLAYING AND gp2.status = PLAYING AND g.resultsStatus = FINAL`, and sorts results by `UserInteraction.count`. PRD 361 builds on it.
- Queue position exists on the game page (`GameQueuePanel`, `spots.queue.position`, `readQueueState().viewerPosition`). PRD 359 adds it to cards only.
- The Find time-of-day window (`filterTimeStart`/`filterTimeEnd`) is a **client residual** filter, not SQL. PRD 358 is client-only.
- `EntityFilterChips` is a fixed five-up equal-width row, not a scrolling row. PRD 358 does not add chips there.
- `ParticipantSetupTags` are descriptive format tags (fixed teams, gender, 1v1/2v2). They are **not** organizer hints and PRD 364 leaves them alone. The organizer-facing surfaces are `AttendanceOrganizerStrip` (inside `AttendanceCard`), `SpotOpenedGameSection`, `GameLinkedBookingsSection` coverage, and `GameCostCard`.
- Play-intent discovery keys are today, or today + tomorrow after 18:00 city time (`playIntentDiscoveryDateKeys`). A "looking today" count is well defined.
- `PlatformSetting` exists (admin read/write only). No public read endpoint exists; PRD 363 adds an allow-listed one that PRD 364 reuses.

## Closing (2026-09-22)

All seven are implemented and closed. Each PRD file carries a status line; each has a report in `reports/`. Closure is recorded here and in those files only — no GitHub issues were opened for this set.

Landing commits on `dev`:

| PRD | Commit |
|-----|--------|
| 358 | `8606a24cf` (landed alongside the 359 PRD doc, despite the subject line) |
| 359 | `5087a7a09` |
| 360 | `21324f24e` |
| 361–364 | `a093a955c`, then `62e84a89f` for platform settings and organizer next actions |

### Decisions that override the PRD text

- **363 and 364 ship on by default.** Both PRDs asked to ship dark. The 2026-09-22 decision reversed that: a missing `PlatformSetting` row means on, and an explicit `false` (`FIND_LOOKING_COUNT_ENABLED`, `GAME_ORGANIZER_NEXT_ACTIONS_ENABLED`) is the per-environment kill switch. `PUBLIC_PLATFORM_FLAG_DEFAULTS` is the one place this is stated in code.
- **363's public flags endpoint was shipped by the 364 session**, which reached it first; 363 reuses it as-is.

### Open after closing

Nothing blocks the set, but these are real and unowned:

- **Migration history drift (from 360's work, not caused by it).** Two July 2026 migrations were edited after being applied, so the next `prisma migrate dev` will insist on a reset. 360 was applied with `migrate deploy` to avoid destroying dev data. The drift is still there.
- **60 pre-existing frontend `tsc --noEmit` errors** (`useLiveGames`, `SeriesPage`, `WeatherRiskBanner`, `useGameAttendance` …), all implicit-`any` on react-query `data` plus two weather type errors. Present before this set; none of these PRDs' own files are among them.
- **Manual device passes** for all seven: 375 pt phone, Light / Dark / Classic / Premium, `ar` RTL, plus the two-user cases in 359, 361 and 362 and the GD-NA-01…20 walkthrough in 364. None have been run.
- **Deliberately deferred by 363:** the probe-query "which filter blocked you" explanation, and blocked-user filtering inside the looking-to-play count.
