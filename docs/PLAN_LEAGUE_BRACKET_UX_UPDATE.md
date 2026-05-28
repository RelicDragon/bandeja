# League Bracket Playoff — Plan Compliance & UX Update

**Date:** 2026-05-25 (revised)  
**Related:** [PLAN_LEAGUE_BRACKET_PLAYOFF.md](./PLAN_LEAGUE_BRACKET_PLAYOFF.md). **Unified execution hub** → [PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md](./PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md) (league track L3).

---

## Orchestrator Status

**Last updated:** 2026-05-25 — Verification pass complete (code + automated QA)  
**Coordinator:** team orchestrator

### Global progress

| Sprint | Status | Notes |
|--------|--------|-------|
| Sprint 1 — P0 blockers | ✅ Complete | All P0 items + automated QA |
| Sprint 2 — P1 discovery | ✅ Complete | All 4 agents done |
| Sprint 3 — P2/P3 polish | ✅ Complete | All 5 agents done |
| ENG release checklist | ✅ Complete (automated) | MIG committed; automated tests green; **ENG-E2E-1/2 manual-only** |

### Sprint 1 task board

| Agent | Role | Items | Status |
|-------|------|-------|--------|
| FE-Wizard | Frontend dev | UX-B1, UX-B2 | ✅ |
| FE-BracketView | Frontend dev | UX-A1, UX-D3, UX-D4, UX-A12 | ✅ |
| FS-DeepLinks | Full-stack dev | UX-A2, UX-C7, UX-C3, ENG-PUSH-1, ENG-PUSH-2 | ✅ |
| FE-Walkover | Frontend dev | UX-D1 | ✅ |
| BE-Eng | Backend dev | ENG-VAL-1, ENG-NOTIFY-1 | ✅ |
| QA-P0 | QA | P0 acceptance tests | ✅ |

### Sprint 2 task board

| Agent | Role | Items | Status |
|-------|------|-------|--------|
| FE-Discovery | Frontend dev | UX-C1, UX-C2, UX-C4, UX-C5, UX-C8 | ✅ |
| FE-BracketNav | Frontend dev | UX-A3, UX-A6, UX-A4, UX-A5 | ✅ |
| FE-WizardP1 | Frontend dev | UX-B3, UX-B4, UX-B5, UX-B8 | ✅ |
| FE-StatusPolish | Frontend dev | UX-D2, UX-D5, UX-D10 | ✅ |

### Sprint 3 task board

| Agent | Role | Items | Status |
|-------|------|-------|--------|
| FE-BracketPolish | Frontend dev | UX-A7–A11, A13–A16 | ✅ |
| FE-WizardPolish | Frontend dev | UX-B6, B7, B9–B16 | ✅ |
| FE-Integration | Full-stack dev | UX-C6, C9–C13, C15 | ✅ |
| FE-EdgePolish | Frontend dev | UX-D6, D9, D11–D16 | ✅ |
| BE-QA-Release | BE dev + QA | ENG-MIG-1, test sweep, ENG-BETS doc | ✅ |

---

## Part 1 — Plan Compliance Audit

### Executive Summary

| Scope | Code-complete | UX-shippable |
|-------|---------------|--------------|
| V1 core (Phases 1–3) | ~98% | ~95% — P0 closed (B1/B2, A1/A2, C3/C7, D1/D3/D4) |
| Full plan §1–18 | ~95% | ~92% |
| Extended plan (Phases 4–6, §21) | ~95% | ~93% |
| Production readiness (migrations + manual E2E) | ~95% | ~90% — blocked only on **ENG-E2E-1/2** device matrix |

**Bottom line:** Feature code and UX backlog items are **implemented and covered by automated tests**. Remaining release gap is the **manual E2E matrix** (§18, §21.14), not missing features. §19 bets / §21 constraint seeding / audit table remain intentionally out of scope.

### Implemented (highlights)

- **Data model:** `PlayoffFormat`, `BracketSlotKind`, `BracketScope`, `LeagueBracketSlot`, `BRACKET_CHAMPION` story source
- **Pairing engine:** `buildBracketPlan` N=2..16, play-in, custom bye/play-in, third place, consolation, double-elim; golden fixtures + unit tests (BE + FE)
- **Backend APIs:** create/GET/PATCH slots/walkover/notify-summary; PER_GROUP + CROSS_GROUP; lazy game creation; play-in hard gate; advancement + undo cascade
- **Cross-group:** seeding presets, unequal K, scope tests, FE wizard + view rules
- **Notifications:** game-assigned, round-start deep links (push + Telegram), bracket summary PNG
- **Frontend:** creation wizard, `LeagueBracketView`, edit overlay, fullscreen, podium, share/export, champion story, i18n (~100 keys × 5 locales)

### Partially Implemented

| ID | Item | Gap |
|----|------|-----|
| ENG-E2E | Manual E2E (§18, §21.14) | Code wired; 9 checklist rows still open |
| ENG-MIG | Prisma migrations | ✅ `20260525220000_add_league_bracket_tables` committed; dev DB baselined via `migrate resolve` (prior `db push` drift) |
| ENG-NOTIFY | Telegram summary owner trigger | ✅ FE API + `BracketShareToolbar` (UX-D9) |
| ENG-A11Y | Accessibility — list fallback | ✅ `UX-D5` — `role="region"`, `sr-only` list-fallback hint |
| ENG-AUDIT | Audit log | JSON `bracketConfig.audit[]` only (table deferred per plan) |

### Not Implemented (out of scope for UX pass)

- §19 Bets resolution for bracket games
- §21 constraint seeding ("never same group until round X")
- Dedicated audit table (intentionally deferred)
- Manual E2E process (testing gap, not missing features)

### Extra / Unplanned (delivered beyond original V1)

Third-place match, custom bye/play-in UI, consolation bracket, double elimination + grand final, cross-group unequal K, bracket share/export (html2canvas), Telegram summary PNG, champion promo story, hard API play-in gate, owner `seedingLocked` toggle, home matchup display (`YourLeaguesHomeLeagueGameMatchup`)

### Phase Status (code vs UX)

| Phase | Code | UX notes |
|-------|------|----------|
| 1 — Core MVP | ✅ | Wizard preview/confirm fidelity (B1/B2); group filter (A1) |
| 2 — Owner edit | ✅ | Walkover confirm + 44px (D1); edit tree layout (B10) |
| 3 — Polish | ✅ | Unified deep links (A2/C7); retry/stale load (D3/D4) |
| 4 — Optional | ✅ | Per-group phase-4 state (B4 Option A) |
| 5 — Cross-group | ✅ | Home season-playoff labels (C9) |
| 6 — V2+ | ✅ | Walkover vs forfeit signaling (D2) |

---

## Part 2 — Release Checklist (engineering)

Not UX — required before production deploy.

| ID | Task | Ref | Status |
|----|------|-----|--------|
| ENG-E2E-1 | Run §18 manual matrix: N ∈ {2, 5, 7, 8, 9, 16}, multi-group POST | Plan §18 | ⏳ Manual |
| ENG-E2E-2 | Run §21.14 cross-group manual checks | Plan §21.14 | ⏳ Manual |
| ENG-MIG-1 ✅ | Commit Prisma migration for bracket tables | Plan §2 | ✅ `20260525220000_add_league_bracket_tables` — enums `PlayoffFormat`/`BracketSlotKind`/`BracketScope`, `LeagueRound` bracket columns, `LeagueBracketSlot` table. Dev DB had prior `db push` drift; `migrate dev` blocked reset → SQL authored manually + `prisma migrate resolve --applied` on dev. Prod: run `prisma migrate deploy`. |
| ENG-VAL-1 ✅ | Add `includeDoubleElimination` to POST validator | `league.routes.ts` | ✅ |
| ENG-BETS ✅ | Confirm bets behavior for bracket games or document N/A | Plan §19 | ✅ **N/A — no bracket-specific path.** Bets are game-scoped (`BetService.createBet` / `resolveGameBets` on `gameId`). Bracket playoff games are normal `Game` rows (lazy-created via `LeagueBracketSlot.gameId`). Resolution fires on first FINAL via `outcomes.service` → `shouldResolveBets` same as other league games. No bracket/playoff guard in bet services. |

### Automated test sweep (2026-05-25 verification pass)

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend bracket | 6 (`bracketStructure`, `bracketSlotEdit`, `crossGroupBracketSeeding`, `crossGroupBracketScope`, `leagueBracketDeepLink`, `bracketScheduleListSort`) + 15 golden N=2..16 fixtures | all | ✅ Pass |
| Frontend bracket/playoff/wizard utils | 26 vitest `*.test.ts` under `src/utils/*{bracket,playoff,wizard,crossGroup,...}*` | 108 | ✅ Pass |
| P0 acceptance utils | 8 files (`playoffWizardBracketPlan`, `playoffWizardCreatePayload`, `leagueBracketScheduleDeepLink`, `leagueBracketLoad`, `pushNotificationBracketRouting`, `leagueBracketWalkover`, `bracketView`, `leagueBracketRound`) | 29 | ✅ Pass |
| Backend + Frontend lint | — | — | ✅ Pass (bracket-related; no new issues) |

```bash
cd Backend && npm run test:bracket-structure
cd Frontend && npx vitest run src/utils/*bracket* src/utils/*playoff* src/utils/*wizard* src/utils/crossGroup* src/utils/consolation* src/utils/doubleElim* src/utils/customBye* src/utils/gameBracketReturn* src/utils/roundTypePlayoff* src/utils/leagueHomeBracket* src/utils/leagueRoundAccordionHeader*
```

Optional engineering (pairs with UX):

| ID | Task | UX ref |
|----|------|--------|
| ENG-NOTIFY-1 ✅ | Add `notifyBracketSummary` to `Frontend/src/api/leagues.ts` | UX-D9 |
| ENG-PUSH-1 ✅ | Bracket assignment push → schedule bracket tab (not game-only INVITE) | UX-C3 |
| ENG-PUSH-2 ✅ | Gate assignment notify on `timeIsSet === true` | UX-C12 |

---

## Part 3 — UX/UI Improvement Backlog

Findings from four UX reviews. IDs are stable (`UX-A1`, etc.) for sprint references.

### Priority Legend

- **P0** — Trust-breaking or blocks core workflow; blocks UX-shippable
- **P1** — High impact; next pass after P0
- **P2** — Medium polish and coherence
- **P3** — Low impact; delight

### Cross-cutting themes (deduplicated)

| Theme | IDs | Primary fix |
|-------|-----|-------------|
| Deep links / share / `roundId` | UX-A2, UX-C7 | Single URL contract: `?tab=schedule&subtab=bracket&roundId=&group=`; Schedule tab reads all params; share link matches (not only fullscreen) |
| Bye advance label | UX-A12 ✅ | Render `bracketByeAdvance` in `LeagueBracketByeCard` (already shown in creation `BracketPlayoffPreview`) |
| PNG export clipping | UX-A14 | Expand scroll container or stitch columns before `html2canvas` |
| Telegram summary UI | UX-D9, ENG-NOTIFY | Owner button + FE API wrapper |

---

### A. Bracket Viewing & Navigation (Plan §4, §6–7)

| ID | Pri | Finding | Components | Plan § |
|----|-----|---------|------------|--------|
| UX-A1 | P0 | ✅ "All groups" prompts group selection (no silent first tree) | `shouldPromptBracketGroupSelection`, `LeagueScheduleTab` banner | §6 |
| UX-A2 | P0 | ✅ Share + deep links use schedule `?tab=schedule&subtab=bracket&roundId=&group=` | `buildLeagueBracketShareUrl`, `LeagueScheduleTab` URL effects | §7 |
| UX-A3 | P1 | ✅ Champion/podium only on Standings, not Bracket tab | `LeagueBracketPodiumCard`, `LeagueBracketView` | §7 |
| UX-A4 | P1 | ✅ Weak winner/loser signaling outside champion path | `leagueBracketOutcome.ts`, `LeagueBracketSlotCard` | §6 |
| UX-A5 | P1 | ✅ Fullscreen `compact` → vertical stack, not horizontal tree | `LeagueBracketFullscreenPage`, `LeagueBracketView` | §4 |
| UX-A6 | P1 | ✅ No in-bracket round navigation on mobile (scroll-only) | `LeagueBracketView` | §4 |
| UX-A7 | P2 | ✅ Dual card patterns — inconsistent density | `LeagueBracketView` | §6 |
| UX-A8 | P2 | ✅ List fallback not linked from tree | `LeagueScheduleTab`, `LeagueBracketListPanel` | §4.5 |
| UX-A9 | P2 | ✅ Play-in gate banner has no jump-to-play-in action | `LeagueBracketView` | §6 |
| UX-A10 | P2 | ✅ Toolbar: share/export/lock/edit same visual weight | `LeagueBracketView`, `BracketShareToolbar` | §6 |
| UX-A11 | P2 | ✅ Loading/error/empty minimal — no retry or contextual empty copy | `LeagueBracketView`, `LeagueBracketListPanel` | §6 |
| UX-A12 | P2 | ✅ Live bye cards lack advance label (`bracketByeAdvance` in preview only) | `LeagueBracketByeCard` | §5 |
| UX-A13 | P2 | ✅ Generic "Round N" column headers when `roundLabel` absent | `LeagueBracketView` | §9 |
| UX-A14 | P3 | ✅ Export PNG may clip off-screen columns | `leagueBracketShare.util.ts` | §7 |
| UX-A15 | P3 | ✅ `BracketRoundPicker` generic "Round N" labels | `BracketRoundPicker` | §6 |
| UX-A16 | P3 | ✅ Fullscreen maximize overlaps bracket content | `LeagueScheduleTab` | §7 |

---

### B. Organizer Setup & Configuration (Plan §4–5)

| ID | Pri | Finding | Components | Plan § |
|----|-----|---------|------------|--------|
| UX-B1 | P0 | ✅ Per-group preview uses `bracketPlanOptionsFromWizardConfig` + `buildBracketPlan` | `PlayoffConfigurationModal` preview step | §5 |
| UX-B2 | P0 | ✅ Confirm uses `participantIdsForGroupCreate`, phase-4 + custom options | `PlayoffConfigurationModal` summary, `playoffWizardCreatePayload.util` | §4 |
| UX-B3 | P1 | ✅ No wizard step indicator (X of 4) | `PlayoffConfigurationModal` | §4 |
| UX-B4 | P1 | ✅ Phase 4 UI looks per-group but single modal state; **BE supports per-group flags** | `BracketPhase4CreateOptions`, `PlayoffConfigurationModal` | §4 |
| UX-B5 | P1 | ✅ Custom bye/play-in editors seed-number-only | `BracketCustomByePicker`, `BracketPlayInPairEditor` | §5 |
| UX-B6 | P1 | ✅ Play-in/bye validation at submit only | `BracketPlayInPairEditor`, `PlayoffConfigurationModal` | §5 |
| UX-B7 | P2 | ✅ Structure summary ignores custom bye selection | `BracketStructureSummary` | §5 |
| UX-B8 | P2 | ✅ Multi-group setup lacks per-group completion badges | `PlayoffConfigurationModal` | §4 |
| UX-B9 | P2 | ✅ Cross-group seeding buried; arrow-only reorder | `CrossGroupBracketConfigStep`, `CrossGroupBracketSeedList` | §21 |
| UX-B10 | P2 | ✅ Edit overlay flat list vs creation tree | `BracketEditOverlay` | §7 |
| UX-B11 | P2 | ✅ Confirm step cannot reopen visual preview | `PlayoffConfigurationModal` | §4 |
| UX-B12 | P2 | ✅ Phase 4 toggles lack explanatory copy | `BracketPhase4CreateOptions` | §4 |
| UX-B13 | P2 | ✅ Advanced options before participant selection done | `PlayoffConfigurationModal` | §4 |
| UX-B14 | P3 | ✅ Preview KO columns opaque TBD | `BracketPlayoffPreview` | §5 |
| UX-B15 | P3 | ✅ Game setup allows blind advance | `BracketPlayoffGameSetupStep` | §4 |
| UX-B16 | P3 | ✅ Cross-group play-in editor detached from config panel | `PlayoffConfigurationModal` | §21 |

**UX-B4 decision (pick one):**

- **Option A (recommended):** Per-group phase-4 state in FE, send `groups.*.includeThirdPlace` etc. to match BE.
- **Option B:** Round-level only — move toggles outside group tabs, document as season-wide.

---

### C. Discovery, Notifications & Integration (Plan §6, §16, §21.8)

| ID | Pri | Finding | Components | Plan § |
|----|-----|---------|------------|--------|
| UX-C1 | P1 | ✅ Home rows hide playoff/bracket context | `YourLeaguesHomeLeagueGameRow` | §16 |
| UX-C2 | P1 | ✅ Home taps → single game, not bracket tab | `YourLeaguesHomeSeasonScheduledGamesExpandable` | §6 |
| UX-C3 | P0 | ✅ Assignment push → schedule bracket tab (`scheduleSubtab: 'bracket'`) | `bracketGameNotification.service.ts`, `pushNotificationService.tryNavigateToBracketSchedule` | §16 |
| UX-C4 | P1 | ✅ Standings: no podium/CTA until SF/champion exists (does auto-select PLAYOFF and load bracket data) | `LeagueStandingsTab`, `LeagueBracketPodiumCard` | §7 |
| UX-C5 | P1 | ✅ Schedule defaults REGULAR; Standings auto-selects PLAYOFF | `LeagueScheduleTab`, `LeagueStandingsTab` | §6 |
| UX-C6 | P2 | ✅ Round-start push copy game-centric, not bracket-framed | `league-round-start-push.notification.ts` | §16 |
| UX-C7 | P0 | ✅ Deep links include `roundId`/`round` + `group` (merged with UX-A2) | `leagueBracketDeepLink.util.ts` (BE), `leagueBracketScheduleDeepLink.util.ts` (FE) | §16 |
| UX-C8 | P2 | ✅ Season hub: no playoff badge or bracket shortcut | `YourLeaguesHomeSection`, `YourLeaguesHomeSeasonOpenRow` | §16 |
| UX-C9 | P2 | ✅ Cross-group games: no season-playoff label on Home | `YourLeaguesHomeLeagueGameRow` | §21 |
| UX-C10 | P2 | ✅ Unscheduled bracket games: no play-in vs knockout urgency | Home unscheduled bucket | §16 |
| UX-C11 | P2 | ✅ List round headers don't show bracket format | `LeagueRoundAccordion` | §6 |
| UX-C12 | P2 | ✅ Assignment notify may fire with placeholder times (`timeIsSet: false`) | `bracketGameNotification.service.ts` | §16 |
| UX-C13 | P3 | ✅ "Play-off" filter obscures bracket vs session | `RoundTypeFilterSwitch` | §6 |
| UX-C14 | P3 | ✅ Home i18n has no bracket keys | `home.json` | §21.13 |
| UX-C15 | P3 | ✅ "My games" subtab doesn't link to bracket position | `LeagueScheduleTab` | §6 |

---

### D. Polish, Accessibility & Edge Cases

| ID | Pri | Finding | Components |
|----|-----|---------|------------|
| UX-D1 | P0 | Walkover one-tap destructive; ~24px buttons ✅ | `LeagueBracketSlotCard` |
| UX-D2 | P1 | Walkover/forfeit indistinguishable from played finals | `leagueBracketMatchStatus.ts`, `LeagueGameCard` |
| UX-D3 | P0 | ✅ Bracket load error: no retry | `LeagueBracketView`, `LeagueBracketFullscreenPage` |
| UX-D4 | P0 | ✅ Stale `bracketPayload` on round switch; list ignores loading | `LeagueScheduleTab`, `LeagueBracketListPanel` |
| UX-D5 | P1 | Tree: no region label; list fallback not surfaced to AT | `LeagueBracketView` |
| UX-D6 | P2 | Play-in gate: list knockout filter shows generic empty | `LeagueBracketListPanel` ✅ |
| UX-D7 | P2 | Merged into UX-A12 (live bye cards only) | — |
| UX-D8 | P2 | Merged into UX-A14 | — |
| UX-D9 | P2 | Telegram bracket summary: no owner UI | BE + toolbar ✅ |
| UX-D10 | P2 | Results entry: no "Return to bracket" | `GameResultsEntryEmbedded` |
| UX-D11 | P2 | Walkover/edit API errors raw English in `t()` | `LeagueBracketSlotCard`, `BracketEditOverlay` ✅ |
| UX-D12 | P2 | `bracketPreviewReorderHint` en-only | `gameDetails.json` ✅ |
| UX-D13 | P2 | `SegmentedSwitch` lacks tab ARIA | `SegmentedSwitch` ✅ |
| UX-D14 | P2 | Offline not handled for bracket actions | toolbar, edit, walkover ✅ |
| UX-D15 | P3 | Champion story thin (no avatars/score) | `BracketChampionStorySlide` ✅ |
| UX-D16 | P3 | Podium partial outcomes without "in progress" | `LeagueBracketPodiumCard` ✅ |

---

## Part 4 — P0 Acceptance Criteria

| ID | Done when |
|----|-----------|
| UX-B1 | Per-group preview calls `buildBracketPlan` with `customByeSeedRanks` + `customPlayInPairings` from config step |
| UX-B2 | Summary step uses `participantIdsForGroupCreate` / `previewOrderedByGroup`; lists phase-4 + custom options; matches POST payload |
| UX-A1 | Bracket tab with "All groups" shows explicit banner + group picker, OR removes "All groups" and requires a group |
| UX-A2 / UX-C7 | Share URL and push/deep links use same query shape; Schedule `subtab=bracket` reads `roundId`/`round` + `group`; fullscreen still works |
| UX-C3 | Bracket game assignment/advance push opens season schedule bracket tab with correct group |
| UX-D1 | Walkover requires confirm step; winner buttons ≥44px touch target |
| UX-D3 | Error state shows Retry that refetches bracket |
| UX-D4 | Round switch clears `bracketPayload` immediately; list subtab shows loading skeleton |

### P0 automated QA (2026-05-25)

| ID | Automated coverage | Result | Manual E2E still required |
|----|-------------------|--------|---------------------------|
| UX-B1 | `playoffWizardBracketPlan.util.test.ts` — preview `buildBracketPlan` with custom bye/play-in | ✅ Pass | Full wizard preview UI + reorder drag |
| UX-B2 | `playoffWizardCreatePayload.util.test.ts` — POST group parity with preview order/options | ✅ Pass | Confirm step UI lists phase-4 + custom labels end-to-end |
| UX-A1 | `bracketView.util.test.ts` — All groups prompts selection (no silent first tree) | ✅ Pass | Banner + group picker visible on Bracket tab |
| UX-A2 / UX-C7 | `leagueBracketScheduleDeepLink.util.test.ts`, `leagueBracketRound.test.ts`, BE `leagueBracketDeepLink.util.test.ts` | ✅ Pass | Share toolbar copies schedule URL; deep link opens correct round/group |
| UX-C3 | `pushNotificationBracketRouting.util.test.ts`, BE push extras in `leagueBracketDeepLink.util.test.ts` | ✅ Pass | Tap bracket assignment push on device → schedule bracket tab |
| UX-D1 | `leagueBracketWalkover.util.test.ts` (44px + confirm contract) | ✅ Pass | Walkover confirm modal + touch targets on real device |
| UX-D3 | `LeagueBracketView`/`LeagueBracketListPanel` `onRetry` → `refetchBracket` in `LeagueScheduleTab` | ✅ Pass (util + wiring) | Error state + Retry tap refetches on device |
| UX-D4 | `leagueBracketLoad.util.test.ts`; `LeagueScheduleTab` clears payload on round change | ✅ Pass | List subtab loading skeleton while bracket refetches |

**Run commands**

```bash
cd Backend && npx ts-node --transpile-only src/services/league/leagueBracketDeepLink.util.test.ts
cd Frontend && npx vitest run src/utils/playoffWizardBracketPlan.util.test.ts src/utils/playoffWizardCreatePayload.util.test.ts src/utils/leagueBracketScheduleDeepLink.util.test.ts src/utils/leagueBracketLoad.util.test.ts src/utils/pushNotificationBracketRouting.util.test.ts src/utils/leagueBracketWalkover.util.test.ts src/utils/bracketView.util.test.ts src/utils/leagueBracketRound.test.ts
```

---

## Part 5 — Roadmap

### Sprint 1 — UX-shippable blockers (all P0)

| # | Items | Notes |
|---|-------|-------|
| 1 | UX-B1, UX-B2 | Wizard fidelity — highest organizer trust risk |
| 2 | UX-A1 | Group filter |
| 3 | UX-A2, UX-C7, UX-C3 | Unified deep links + notification landing (pair with ENG-PUSH-1) |
| 4 | UX-D3, UX-D4 | Loading/retry/stale data |
| 5 | UX-D1 | Walkover safety |

**Exit:** Organizer can create bracket with custom bye/play-in and verify on confirm; player/owner lands on correct bracket from share/push; no stale tree on round change.

### Sprint 2 — Discovery & navigation (P1)

UX-C1, UX-C2, UX-C4, UX-C5, UX-A3, UX-A6, UX-B3, UX-B4, UX-B5, UX-D2

### Sprint 3 — Polish (P2–P3)

Remaining UX-A*, UX-B*, UX-C*, UX-D* not in Sprints 1–2; ENG release checklist in parallel.

---

## Verification pass (2026-05-25)

QA/integration review: every `UX-*` and `ENG-*` item checked against code + automated tests. **Gap fixes in this pass:** 14 `bracket*` i18n keys added to `cs`/`es`/`ru`/`sr` `gameDetails.json`; `useStorySegmentEngagement` exhaustive-deps lint suppressed (intentional `segmentKey`-only reset).

### ENG checklist

| ID | Status | Evidence |
|----|--------|----------|
| ENG-E2E-1 | ⏳ Manual-only | Plan §18 matrix — no automated substitute |
| ENG-E2E-2 | ⏳ Manual-only | Plan §21.14 cross-group checks — device QA |
| ENG-MIG-1 | ✅ | `Backend/prisma/migrations/20260525220000_add_league_bracket_tables/migration.sql` |
| ENG-VAL-1 | ✅ | `Backend/src/routes/league.routes.ts` — `includeDoubleElimination` on POST body/groups/crossGroup |
| ENG-BETS | ✅ | Documented N/A — `outcomes.service` / `BetService` game-scoped; bracket games are normal `Game` rows |
| ENG-NOTIFY-1 | ✅ | `Frontend/src/api/leagues.ts` — `notifyBracketSummary`; `BracketShareToolbar` |
| ENG-PUSH-1 | ✅ | `leagueBracketDeepLink.util.ts`, `pushNotificationService.tryNavigateToBracketSchedule` |
| ENG-PUSH-2 | ✅ | `bracketGameNotificationPolicy.ts` — `timeIsSet` gate; `bracketGameNotification.service.ts` query |

### UX backlog (all items)

| ID | Status | Evidence |
|----|--------|----------|
| UX-A1 | ✅ | `bracketView.util.ts` — `shouldPromptBracketGroupSelection`; `LeagueScheduleTab` banner |
| UX-A2 | ✅ | `leagueBracketShare.util.ts` — `buildLeagueBracketShareUrl` (schedule query, not fullscreen-only) |
| UX-A3 | ✅ | `LeagueBracketView` — `LeagueBracketPodiumCard` |
| UX-A4 | ✅ | `leagueBracketOutcome.ts`, `LeagueBracketSlotCard` winner/loser classes |
| UX-A5 | ✅ | `LeagueBracketFullscreenPage` — horizontal tree when `compact` |
| UX-A6 | ✅ | `LeagueBracketView` — `BracketRoundPicker` / column navigation |
| UX-A7 | ✅ | `bracketTreeCard.util.ts` unified card density |
| UX-A8 | ✅ | `LeagueBracketView` list-fallback link; `LeagueScheduleTab` `sr-only` hint |
| UX-A9 | ✅ | `LeagueBracketView` — `bracketJumpToPlayIn` scroll action |
| UX-A10 | ✅ | `LeagueBracketView` toolbar tiers (primary vs secondary actions) |
| UX-A11 | ✅ | `LeagueBracketView` / `LeagueBracketListPanel` retry + contextual empty copy |
| UX-A12 | ✅ | `LeagueBracketByeCard` — `bracketByeAdvance` |
| UX-A13 | ✅ | `bracketRoundDisplay.util.ts` — `roundLabel` column headers |
| UX-A14 | ✅ | `leagueBracketShare.util.ts` — `applyBracketExportScrollExpand` |
| UX-A15 | ✅ | `BracketRoundPicker` — `formatBracketRoundLabel` |
| UX-A16 | ✅ | `LeagueScheduleTab` — fullscreen control spacing |
| UX-B1 | ✅ | `PlayoffConfigurationModal` preview — `bracketPlanOptionsFromWizardConfig` per group |
| UX-B2 | ✅ | `participantIdsForGroupCreate`, `BracketPlayoffConfirmOptions`, `playoffWizardCreatePayload.util` |
| UX-B3 | ✅ | `playoffWizardSteps.util.ts` — step X of N in modal header |
| UX-B4 | ✅ | `includeThirdPlaceByGroup` etc. — per-group phase-4 maps → POST `groups.*` |
| UX-B5 | ✅ | `BracketCustomByePicker` / `BracketPlayInPairEditor` — `seedLabels` + `formatSeedOptionLabel` |
| UX-B6 | ✅ | `playoffWizardValidation.util.ts` — inline validation in editors |
| UX-B7 | ✅ | `BracketStructureSummary` — `customByeSeedRanks` |
| UX-B8 | ✅ | `getGroupSetupStatus` badges in `PlayoffConfigurationModal` |
| UX-B9 | ✅ | `CrossGroupBracketConfigStep`, `CrossGroupBracketSeedList` |
| UX-B10 | ✅ | `bracketEditTreeLayout.util.ts`, `BracketEditOverlay` tree columns |
| UX-B11 | ✅ | `bracketConfirmViewPreview` button on summary step |
| UX-B12 | ✅ | `BracketPhase4CreateOptions` hint strings |
| UX-B13 | ✅ | `bracketAdvancedOptionsGateHint` — advanced gated until participants selected |
| UX-B14 | ✅ | `BracketPlayoffPreview` TBD/ghost chips |
| UX-B15 | ✅ | `BracketPlayoffGameSetupStep` — `bracketGameSetupBlindAdvanceWarn` |
| UX-B16 | ✅ | Cross-group play-in inside `CrossGroupBracketConfigStep` |
| UX-C1 | ✅ | `YourLeaguesHomeLeagueGameRow` + `YourLeaguesHomeLeagueGameMatchup` |
| UX-C2 | ✅ | `YourLeaguesHomeSeasonScheduledGamesExpandable` — `buildLeagueHomeGameBracketPath` |
| UX-C3 | ✅ | BE push extras + FE `pushNotificationBracketRouting.util.ts` |
| UX-C4 | ✅ | `LeagueStandingsTab` — `LeagueBracketPodiumCard` / CTA when SF+ |
| UX-C5 | ✅ | `LeagueScheduleTab` / `LeagueStandingsTab` round-type defaults |
| UX-C6 | ✅ | `leagueRoundStartNotificationCopy.util.ts` bracket framing |
| UX-C7 | ✅ | Same as UX-A2 — `leagueBracketDeepLink.util.ts` |
| UX-C8 | ✅ | `YourLeaguesHomeSection` — `bracketShortcutPath` on season row |
| UX-C9 | ✅ | `leagueGameSeasonPlayoffBadge` on home rows |
| UX-C10 | ✅ | Home unscheduled — play-in vs KO urgency copy |
| UX-C11 | ✅ | `leagueRoundAccordionHeader.util.ts` bracket format in headers |
| UX-C12 | ✅ | `bracketGameNotificationPolicy.ts` — `timeIsSet` |
| UX-C13 | ✅ | `roundTypePlayoffFilterLabel.util.ts` |
| UX-C14 | ✅ | `home.json` — `leagueGameSeasonPlayoffBadge` × 5 locales |
| UX-C15 | ✅ | `LeagueScheduleMyGamesList` — `scheduleMyGamesViewBracket` |
| UX-D1 | ✅ | `LeagueBracketSlotCard` confirm modal + `min-h-[44px]`; `leagueBracketWalkover.util.ts` |
| UX-D2 | ✅ | `leagueBracketMatchStatus.ts` walkover vs forfeit; `LeagueGameCard` badges |
| UX-D3 | ✅ | `onRetry` → `refetchBracket` in `LeagueScheduleTab` |
| UX-D4 | ✅ | Round change `setBracketPayload(null)` + list loading skeleton |
| UX-D5 | ✅ | `bracketTreeRegionLabel`, list-fallback `sr-only` / `aria-describedby` |
| UX-D6 | ✅ | `LeagueBracketListPanel` play-in gate empty copy |
| UX-D7 | ✅ | Merged → UX-A12 |
| UX-D8 | ✅ | Merged → UX-A14 |
| UX-D9 | ✅ | `BracketShareToolbar` Telegram notify; `notifyBracketSummary` API |
| UX-D10 | ✅ | `GameResultsEntryEmbedded` — `gameBracketReturn.util.ts` |
| UX-D11 | ✅ | `bracketApiError.util.ts` — i18n keys for API errors |
| UX-D12 | ✅ | `bracketPreviewReorderHint` × 5 locales |
| UX-D13 | ✅ | `SegmentedSwitch` — `role="tablist"`, `aria-selected` |
| UX-D14 | ✅ | `bracketOffline.util.ts` — toolbar/edit/walkover offline guard |
| UX-D15 | ✅ | `BracketChampionStorySlide` enriched layout |
| UX-D16 | ✅ | `bracketPodiumProgress.util.ts` — `bracketPodiumInProgress` |

### Verdict

**Plan fully implemented in code** for all UX/ENG items except **ENG-E2E-1** and **ENG-E2E-2** (manual device matrix). No code blockers found; ship after manual E2E sign-off.

---

## Appendix — What's Working Well

| Area | Strength |
|------|----------|
| Pairing engine | N=2..16 golden fixtures; BE + FE parity |
| Play-in gate | Tree fade + banner; list auto-filters play-in |
| Champion path | Amber highlight on path slots/byes |
| Cross-group | Origin badges, season playoff label in schedule |
| Round-start deep links | Push/Telegram → bracket tab |
| Creation preview | `bracketByeAdvance` shown in `BracketPlayoffPreview` |
| Share/export | html2canvas pipeline exists |
| Stories | `BracketChampionStorySlide` deep-links to bracket |
| Home matchup | `YourLeaguesHomeLeagueGameMatchup` |
| Automated tests | Structure, edit, scope, deep link, list sort |
