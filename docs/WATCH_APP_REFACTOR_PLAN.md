# Apple Watch App Refactor — Session-Driven UI

## Overview

Replace the current `NavigationStack`-driven flow with a **session state machine** that controls the root view. The app operates in three phases based on `startedGame` and `startedMatch` state.

| Phase | Condition | UI |
|---|---|---|
| **Idle** | `startedGame == null && startedMatch == null` | Game list → Game detail (with Start button) |
| **Game Active** | `startedGame != null && startedMatch == null` | Two-page swipe: Workout Controls ↔ Match List (with Start buttons) |
| **Match Active** | `startedGame != null && startedMatch != null` | Two-page swipe: Workout Controls ↔ Scoring UI |

**`startedGame`** = a game with `status == "STARTED"` and `resultsStatus == "IN_PROGRESS"`.

---

## Phase UX Details

### Phase 1: Idle (`startedGame == null && startedMatch == null`)

Behavior identical to current app:
- `GameListView` shows sections: Today / Upcoming / Recent
- Tapping a game → `GameDetailView` with game info
- Game detail shows a **Start** button if conditions are met (participants ready, teams ready, 4 players, etc.)
- After starting results entry via API → transitions to **Phase 2**

### Phase 2: Game Active (`startedGame != null && startedMatch == null`)

No game list visible. Only the active game is shown.

**Layout:** watchOS `TabView` with vertical page style (like Apple's native Workout app).

**Left Page — Workout Control:**
- Workout metrics (calories, heart rate, elapsed time) — shown only if workout has been started (i.e., at least one match has been played)
- If no workout yet: "Waiting for first match" indicator
- **Finish Game** button at bottom — large red circle (like Apple's End Workout button)

**Main Page — Match List:**
- Compact game info header (type icon, time, club name)
- Rounds/matches listed by round
- Each unscored match is shown **dimmed/grayed** with a **large green circle Start button** overlaid (like Apple Watch workout start — `play.fill` inside a green circle, ~44pt)
- Already-scored matches show scores normally, no Start button
- Finalize Results button at bottom when all matches scored
- Tapping Start on a match → `session.startMatch(matchId:)` → transitions to **Phase 3**

### Phase 3: Match Active (`startedGame != null && startedMatch != null`)

No game list or game detail visible. Only the active match.

**Layout:** watchOS `TabView` with vertical page style.

**Left Page — Workout Control:**
- Live workout metrics (calories, heart rate, elapsed time)
- Two horizontally-placed circle buttons at bottom (Apple Workout style):
  - **Left (yellow):** Pause / Resume
  - **Right (red):** Finish Match
- Finishing match → saves scores → auto-pauses workout → transitions back to **Phase 2**

**Main Page — Match Scoring:**
- The existing scoring UI (`ClassicScoringView` or `AmericanoScoringView`) as-is
- No `WorkoutMetricsBar` safeAreaInset (metrics live on the left page now)
- Finish Match button triggers save + transition back to Phase 2

---

## Workout Lifecycle

| Event | Workout Action |
|---|---|
| Game entered (idle → gameActive) | **Nothing** — workout not started yet |
| First match started in this game session | `WorkoutManager.startIfNeeded(gameId:, isIndoor:)` |
| Subsequent match started | `WorkoutManager.autoResume()` |
| Match finished (scores saved, matchActive → gameActive) | `WorkoutManager.autoPause()` |
| Game finalized | `WorkoutManager.endSessionUploadAndClear(gameId:)` |
| User taps Finish on left screen (game mode) | Finalize results → end workout → idle |
| User taps Finish on left screen (match mode) | Save match → pause workout → gameActive |
| User force-resets / navigates to idle | `WorkoutManager.discardIfStillActive(gameId:)` |

---

## Backend Changes

### New Field: `activeMatchId` on Participant

Add an optional `activeMatchId` field to the game participant model. This tracks which match a user is currently scoring on their Watch.

```
participant.activeMatchId: String | null
```

This field is:
- Set when the Watch user starts scoring a match
- Cleared when the user finishes scoring that match
- Cleared when the game is finalized
- Returned in game detail responses so any client can read it

### New Endpoint: `PATCH /games/:gameId/my-session`

Lightweight endpoint for the Watch to update session state.

**Request body:**
```json
{
  "activeMatchId": "match-uuid-here"
}
```

Or to clear:
```json
{
  "activeMatchId": null
}
```

**Behavior:**
- Finds the current user's participant record on this game
- Updates `activeMatchId`
- Returns `200 OK` with the updated participant

**Auth:** Standard JWT auth (same as all other endpoints).

**Validation:**
- Game must exist and user must be a participant
- Game must have `status == "STARTED"` and `resultsStatus == "IN_PROGRESS"`
- If `activeMatchId` is non-null, verify the match exists within this game's results
- If game is `FINAL` or `FINISHED`, reject with 400

### Schema Change

```sql
ALTER TABLE game_participants
  ADD COLUMN active_match_id UUID REFERENCES matches(id) ON DELETE SET NULL;
```

### Response Change

Include `activeMatchId` in the `WatchGame` participant response:

```json
{
  "participants": [
    {
      "userId": "...",
      "role": "OWNER",
      "status": "PLAYING",
      "activeMatchId": "match-uuid-or-null",
      "user": { ... }
    }
  ]
}
```

### Auto-Clear on Finalize

When `POST /results/game/:id/recalculate` is called (finalize results), the backend should clear `activeMatchId` for all participants on that game.

---

## State Persistence & Recovery (Hybrid Approach)

### Local (UserDefaults — App Group)

Fast cache for instant UI restoration on launch:

```
bandeja.session.activeGameId: String?
bandeja.session.activeMatchId: String?
bandeja.session.workoutStartedForGame: Bool
```

Written on every state transition. Read immediately on app launch to restore UI phase without network delay.

### Backend (Source of Truth)

`participant.activeMatchId` synced via `PATCH /games/:gameId/my-session` on every match start/finish.

### Recovery Flow on App Launch

1. Read UserDefaults → immediately restore UI phase (no spinner)
2. `WorkoutManager.recoverIfNeeded()` → recover HK session
3. Background: fetch game from API → validate state is still correct
4. If backend says game is now `FINAL` → transition to idle, clean up local state
5. If backend's `activeMatchId` differs from local → update local to match backend
6. If game no longer exists or user removed → reset to idle

---

## Watch App File Changes

### New Files

| File | Purpose |
|---|---|
| `Services/ActiveSessionManager.swift` | Central `@Observable` state machine singleton |
| `Views/Session/SessionRootView.swift` | Root view switching between idle/gameActive/matchActive |
| `Views/Session/WorkoutControlPage.swift` | Left page — workout metrics + Pause/Resume/Finish buttons |
| `Views/Session/ActiveGamePage.swift` | Main page during gameActive — match list with Start buttons |
| `Views/Session/ActiveMatchPage.swift` | Main page during matchActive — scoring UI |

### Modified Files

| File | Changes |
|---|---|
| `ContentView.swift` | Replace `NavigationStack` body with `SessionRootView`; move deep link handling |
| `BandejaWatchApp.swift` | Add `ActiveSessionManager` to environment; call `session.recoverIfNeeded()` |
| `WorkoutManager.swift` | Add `autoPause()`, `autoResume()` methods; remove nav-based discard logic |
| `GameDetailView.swift` | On STARTED+IN_PROGRESS games, call `session.enterGame(...)` instead of pushing nav |
| `Router.swift` | Remove `.scoringList` and `.scoringMatch` destinations (only `.gameDetail` needed for idle) |
| `Models/WatchGame.swift` | Add `activeMatchId` to `WatchParticipant` |

### Removed / Deprecated Files

| File | Reason |
|---|---|
| `Views/Scoring/MatchListView.swift` | Logic absorbed into `ActiveGamePage` |
| `Views/Scoring/MatchScoringView.swift` | Logic absorbed into `ActiveMatchPage` |
| `Views/Scoring/WorkoutMetricsBar.swift` | Replaced by `WorkoutControlPage` (metrics now on dedicated left page) |

### Unchanged Files

- `ViewModels/MatchScoringViewModel.swift` — all scoring logic stays
- `ViewModels/ScoringViewModel.swift` — reused by `ActiveGamePage`
- `ViewModels/GameListViewModel.swift` — still used in idle phase
- `Views/Scoring/ClassicScoringView.swift` — reused inside `ActiveMatchPage`
- `Views/Scoring/AmericanoScoringView.swift` — reused inside `ActiveMatchPage`
- `Views/Scoring/GameWinConfirmSheet.swift` — unchanged
- `Views/Scoring/MatchReviewView.swift` — unchanged
- `Views/Scoring/ScoreHintBanner.swift` — unchanged
- `Views/Scoring/WatchScoringTeamColumn.swift` — unchanged
- `Views/Scoring/MatchResultCard.swift` — reused with Start button overlay in `ActiveGamePage`
- `Views/GameList/GameListView.swift` — unchanged
- `Views/GameList/GameRowView.swift` — unchanged
- `Views/GameDetail/ParticipantChipView.swift` — unchanged
- `Views/WatchPlayerAvatarView.swift` — unchanged
- All models (except `WatchGame.swift` for `activeMatchId`)
- All services (API, Keychain, Outbox, etc.)

---

## Detailed Component Specs

### `ActiveSessionManager`

```
@Observable @MainActor
final class ActiveSessionManager {
    static let shared = ActiveSessionManager()

    enum Phase: Equatable {
        case idle
        case gameActive(gameId: String)
        case matchActive(gameId: String, matchId: String)
    }

    private(set) var phase: Phase = .idle
    var game: WatchGame?
    var results: WatchResultsGame?
    private(set) var workoutStartedForCurrentGame: Bool = false

    // Persisted keys (UserDefaults app group)
    // bandeja.session.activeGameId
    // bandeja.session.activeMatchId
    // bandeja.session.workoutStartedForGame

    func recoverIfNeeded() async
        // 1. Read UserDefaults for persisted gameId/matchId
        // 2. If gameId exists, fetch game from API
        // 3. Validate game is still STARTED + IN_PROGRESS
        // 4. Restore phase accordingly
        // 5. If invalid, clear local state

    func enterGame(_ game: WatchGame, results: WatchResultsGame?)
        // Set phase = .gameActive(gameId: game.id)
        // Store game and results
        // Persist gameId to UserDefaults
        // Do NOT start workout

    func startMatch(matchId: String) async
        // Set phase = .matchActive(gameId: ..., matchId: matchId)
        // Persist matchId to UserDefaults
        // PATCH /games/:gameId/my-session { activeMatchId: matchId }
        // If !workoutStartedForCurrentGame:
        //     WorkoutManager.startIfNeeded(gameId:, isIndoor:)
        //     workoutStartedForCurrentGame = true
        // Else:
        //     WorkoutManager.autoResume()

    func finishMatch() async
        // Save match scores via MatchScoringViewModel.saveCurrentSets()
        // Set phase = .gameActive(gameId: ...)
        // Clear matchId from UserDefaults
        // PATCH /games/:gameId/my-session { activeMatchId: null }
        // WorkoutManager.autoPause()

    func finishGame() async
        // Call ScoringViewModel.finalizeResults()
        // WorkoutManager.endSessionUploadAndClear(gameId:)
        // Clear all UserDefaults keys
        // Set phase = .idle

    func reset()
        // WorkoutManager.discardIfStillActive(gameId:)
        // Clear all UserDefaults keys
        // Set phase = .idle
}
```

### `SessionRootView`

```
struct SessionRootView: View {
    @Environment(ActiveSessionManager.self) var session
    @Environment(Router.self) var router

    var body: some View {
        switch session.phase {
        case .idle:
            // Existing NavigationStack with GameListView
            // navigationDestination for .gameDetail only
        case .gameActive(let gameId):
            TabView {
                WorkoutControlPage(mode: .gameActive)
                ActiveGamePage(gameId: gameId)
            }
            .tabViewStyle(.verticalPage)
        case .matchActive(let gameId, let matchId):
            TabView {
                WorkoutControlPage(mode: .matchActive)
                ActiveMatchPage(gameId: gameId, matchId: matchId)
            }
            .tabViewStyle(.verticalPage)
        }
    }
}
```

### `WorkoutControlPage`

```
enum WorkoutControlMode {
    case gameActive   // Finish button only
    case matchActive  // Pause/Resume + Finish buttons
}

struct WorkoutControlPage: View {
    let mode: WorkoutControlMode
    @Environment(ActiveSessionManager.self) var session

    // Layout:
    // Top section: workout metrics (calories, HR, timer) or "waiting" indicator
    // Bottom section:
    //   gameActive: single red Finish Game circle button
    //   matchActive: HStack of yellow Pause circle + red Finish Match circle

    // Apple Watch Workout style buttons:
    //   Circle ~60pt diameter
    //   SF Symbol centered
    //   Pause = "pause.fill" on yellow
    //   Resume = "play.fill" on yellow  
    //   Finish = "xmark" on red (gameActive) or "stop.fill" on red (matchActive)
}
```

### `ActiveGamePage`

```
struct ActiveGamePage: View {
    let gameId: String
    @State private var scoringVM: ScoringViewModel
    @Environment(ActiveSessionManager.self) var session

    // Content:
    // 1. Compact game header (type, time, club)
    // 2. List of rounds/matches:
    //    - Scored matches: normal display with scores
    //    - Unscored matches: dimmed + green Start circle overlay
    //      Start button: Circle ~44pt, green fill, "play.fill" SF Symbol
    //      Tapping Start → session.startMatch(matchId:)
    // 3. Finalize Results button when appropriate
    //
    // Uses ScoringViewModel for match grouping, finalize logic
    // Polls every 12s (same as current ScoringViewModel)
}
```

### `ActiveMatchPage`

```
struct ActiveMatchPage: View {
    let gameId: String
    let matchId: String
    @State private var vm: MatchScoringViewModel
    @Environment(ActiveSessionManager.self) var session

    // Content:
    // 1. Scoring UI (ClassicScoringView or AmericanoScoringView)
    // 2. No WorkoutMetricsBar (metrics on left page)
    // 3. Finish Match triggers:
    //    - MatchReviewView flow (same as current)
    //    - On confirm: session.finishMatch()
    //
    // Reuses MatchScoringViewModel entirely
}
```

---

## Implementation Order

### Step 1: Backend Changes
1. Add `active_match_id` column to `game_participants` table
2. Add `PATCH /games/:gameId/my-session` endpoint
3. Include `activeMatchId` in participant serialization
4. Auto-clear on finalize

### Step 2: Watch Data Model Update
1. Add `activeMatchId` to `WatchParticipant`

### Step 3: `ActiveSessionManager`
1. Create the state machine with all transitions
2. Add UserDefaults persistence
3. Add API calls for `my-session` sync
4. Add recovery logic

### Step 4: `WorkoutManager` Updates
1. Add `autoPause()` and `autoResume()`
2. Remove navigation-based discard logic

### Step 5: New Views
1. `SessionRootView` — root view switcher
2. `WorkoutControlPage` — left page with Apple-style buttons
3. `ActiveGamePage` — match list with Start buttons
4. `ActiveMatchPage` — scoring wrapper

### Step 6: Wire Up
1. Update `ContentView` to use `SessionRootView`
2. Update `BandejaWatchApp` to add environment objects
3. Update `GameDetailView` to call `session.enterGame(...)` 
4. Simplify `Router`

### Step 7: Cleanup
1. Remove deprecated `MatchListView` (or mark unused)
2. Remove `MatchScoringView` navigation wrapper (logic in `ActiveMatchPage`)
3. Remove `WorkoutMetricsBar` if fully replaced
4. Clean up unused Router destinations

### Step 8: Testing
1. Verify idle → gameActive → matchActive transitions
2. Verify workout starts on first match, pauses between matches
3. Verify recovery after app kill/crash
4. Verify backend sync of activeMatchId
5. Verify finalize flow ends workout and returns to idle
6. Verify deep links work in all phases
