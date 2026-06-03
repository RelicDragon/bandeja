# Watch (1v1) match display & results entry

Companion to [PLAN_SINGLES_1V1_MATCH_DISPLAY.md](./PLAN_SINGLES_1V1_MATCH_DISPLAY.md). Web/shared `matchFormat` is done; this doc tracks **BandejaWatch** parity when `game.playersPerMatch == 2`.

**Status:** Done (Watch 1v1 roster UI + results entry).

---

## Goal

When `playersPerMatch == 2`, Watch should match web behavior:

- **1 player per side** in scoring UI, serve setup, and match list cards
- **2 playing participants** can start / enter results (preset roster), not only 4
- Formulas aligned with `Frontend/shared/matchFormat.ts` (manual Swift mirror + parity tests)

---

## Canonical formulas (mirror TS)

Keep in sync with `Frontend/shared/matchFormat.ts` / `Backend/src/shared/matchFormat.ts`:

| Concept | Meaning | Singles example (`ppm=2`, roster=2) |
|---------|---------|-------------------------------------|
| `playersPerMatch` | On court per match (2 or 4) | 2 |
| `playersPerTeam` | `playersPerMatch / 2` | 1 |
| `maxPlayersPerTeam` | Max avatars/names per side in UI | 1 |
| Preset roster | Playing count for Watch “start results” | 2 or 4 (`isPresetResultsRoster`) |

Resolution: explicit `game.playersPerMatch` → sport default (`WatchSport.defaultPlayersPerMatch`).

**Target module:** `Frontend/ios/App/BandejaWatch Watch App/Models/WatchMatchFormat.swift`

```swift
playersPerMatch(of:) / playersPerTeam(of:) / maxPlayersPerTeam(for:)
isPresetResultsRoster(playingCount:)
capUsers(_:max:)
```

---

## Already OK (no change expected)

| Area | Path | Notes |
|------|------|-------|
| Format flags | `Models/WatchSport.swift` | `resolvedPlayersPerMatch`, `isDoublesMatch` |
| First serve pick | `Views/Scoring/FirstServePickFlow.swift` | `prefix(isDoublesMatch ? 2 : 1)`; skips doubles-server step when singles |
| Court schema | `Views/Scoring/WatchServeCourtSchema.swift` | `baselineSlots` handles `n == 1 && !matchDoubles` |
| Serve guide | `Services/ServeGuideEngine.swift`, `ServeCoachStrip.swift` | `isDoublesMatch` / `matchDoubles` |
| API model | `Models/WatchGame.swift`, `CachedNextGame.swift`, widgets | `playersPerMatch` on payload/cache |
| Live scoring rules | [watch-vs-live-scoring-audit.md](./watch-vs-live-scoring-audit.md) | Engine parity; separate from roster UI |

---

## Must implement — Done

| # | Area | Status |
|---|------|--------|
| 1 | `GameDetailViewModel` gates — `isPresetResultsRoster` | Done |
| 2 | `WatchResultsRoundBuilder.firstRound` — 2+2, 4+4, fixed 1+1; rejects 4+ppm=2 | Done |
| 3 | `MatchScoringViewModel` — capped `teamAUsers`/`teamBUsers` + save payload | Done |
| 4 | `MatchResultCard` — `maxPlayersPerTeam` cap | Done |
| 5 | `WatchCopy` / `GameDetailView` — readiness shows required count | Done |

---

## Medium / optional

| Item | Action |
|------|--------|
| `WatchServeCourtSchema.baselineSlots` | Use `prefix(maxPlayersPerTeam)` if VM cap not sufficient |
| Widget / `GameRowView` | Optional 1v1 vs 2v2 label from `playersPerMatch` |
| `ServeCoachStrip` doubles pick | Ensure `ForEach(users)` respects cap |

---

## Tests

| Layer | File | Cases |
|-------|------|-------|
| XCTest | `BandejaWatchWatchTests/WatchMatchFormatTests.swift` | Same parity table as `Frontend/src/utils/matchFormat.test.ts` |
| XCTest | `BandejaWatchWatchTests/WatchResultsRoundBuilderTests.swift` | 2 playing + ppm=2 → 1 match; 4+4 → triples; fixed 1+1 |
| Manual | — | Padel/Tennis 1v1: enter results, score, first-serve, court coach |
| Manual | — | Doubles regression: 4 players, doubles server pick, 3 preset matches |

---

## Implementation order — Done

1. `WatchMatchFormat.swift` + XCTest parity  
2. `WatchResultsRoundBuilder` + `GameDetailViewModel` gates  
3. `MatchScoringViewModel` capped teams + save payload  
4. `MatchResultCard` cap  
5. `WatchCopy` / readiness strings  
6. Mark sections **Done** in this doc; link from [PLAN_SINGLES_1V1_MATCH_DISPLAY.md](./PLAN_SINGLES_1V1_MATCH_DISPLAY.md)

---

## Out of scope

- 8-player singles **rotation** first-round generation on Watch  
- League / bracket playoff UI on Watch  
- Codegen Swift from TS `shared/matchFormat` (manual mirror + tests only)  
- Open-ended `TIMED` / `CUSTOM` presets ([watch-vs-live-scoring-audit.md](./watch-vs-live-scoring-audit.md) §6)

---

## Related docs

- [PLAN_SINGLES_1V1_MATCH_DISPLAY.md](./PLAN_SINGLES_1V1_MATCH_DISPLAY.md) — web + shared module (complete)
- [PLAN_CASUAL_MULTISPORT_UX.md](./PLAN_CASUAL_MULTISPORT_UX.md) — `playersPerMatch` in create flow
- [watch-vs-live-scoring-audit.md](./watch-vs-live-scoring-audit.md) — scoring engine parity
