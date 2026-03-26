# Bandeja Apple Watch App — Full Implementation Plan

**Target:** watchOS 26 | Swift 6 | Xcode 26  
**App name:** Bandeja Watch  
**Bundle ID:** `com.funified.bandeja.watchapp`  
**Team:** `N9634A623Q`  
**Estimated total:** ~21–25 days

---

## Table of Contents

1. [Phase 0 — Xcode Project Setup & Shared Infrastructure](#phase-0)
2. [Phase 1 — Watch App Skeleton & Networking](#phase-1)
3. [Phase 2 — Game List Screen](#phase-2)
4. [Phase 3 — Game Detail Screen](#phase-3)
5. [Phase 4 — Scoring Flow](#phase-4)
6. [Phase 5 — Finish Game & Outcomes](#phase-5)
7. [Phase 6 — HealthKit: Calories & Workout Tracking](#phase-6)
8. [Phase 7 — Complications, Widgets & Control Widgets](#phase-7)
9. [Phase 8 — WatchConnectivity Sync & Offline Resilience](#phase-8)
10. [File Structure Reference](#file-structure)
11. [Effort Estimate Summary](#effort-estimate)
12. [Key Technical Decisions](#key-decisions)

---

## Phase 0 — Xcode Project Setup & Shared Infrastructure {#phase-0}

### 0.1 — Add watchOS App Target

- In Xcode 26, add a new **watchOS App** target (SwiftUI lifecycle).
- Target name: `BandejaWatch`.
- Bundle ID: `com.funified.bandeja.watchapp`.
- Deployment target: **watchOS 26**.
- Swift Language Version: **Swift 6**, Strict Concurrency: **Complete**.
- Source lives at `Frontend/ios/App/BandejaWatch/`.

### 0.2 — Enable App Groups

- Create App Group: `group.com.funified.bandeja`.
- Add to **both** `App` (iOS) and `BandejaWatch` (watchOS) targets via Xcode Capabilities.
- This shared container is used for:
  - Shared `UserDefaults` (game cache, workout state).
  - `KeychainHelper` access group.

### 0.3 — Enable Keychain Sharing

- Add Keychain Access Group: `com.funified.bandeja` to both targets.
- Update `App.entitlements`, `AppDebug.entitlements` (iOS) and Watch entitlements.
- The Watch reads the JWT token written by the iPhone app from this shared Keychain.

### 0.4 — HealthKit Capability

- Add **HealthKit** capability to the `BandejaWatch` target.
- Add `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` to Watch `Info.plist`.
- Add `NSHealthShareUsageDescription` to the iOS `App` `Info.plist` as well (for workout mirroring).

### 0.5 — Auth Bridge: iPhone → Watch

Auth currently lives in WebKit `localStorage`. A native bridge is required to write the JWT to the shared Keychain so the Watch can read it directly.

**Strategy: Capacitor Plugin + WatchConnectivity (layered)**

Primary: Capacitor plugin writes to shared Keychain on every login/token refresh.  
Secondary: WCSession sync as a live fallback if Keychain is empty.

**Files to create:**

| File | Target | Purpose |
|------|--------|---------|
| `Frontend/ios/App/App/AuthBridgePlugin.swift` | iOS App | Capacitor plugin — receives `setToken` from JS, writes to Keychain |
| `Frontend/ios/App/App/WatchSessionManager.swift` | iOS App | WCSession delegate on iPhone side |
| `Frontend/ios/App/BandejaWatch/Services/WatchSessionManager.swift` | Watch | WCSession delegate on Watch side |
| `Frontend/ios/App/BandejaWatch/Services/KeychainHelper.swift` | Watch | Reads JWT from shared Keychain |
| `Frontend/src/services/authBridge.ts` | Web (JS) | Calls native plugin on login/logout |

**`authBridge.ts` (JS side):**
```ts
import { registerPlugin } from '@capacitor/core';

const AuthBridge = registerPlugin<{ setToken(options: { token: string }): Promise<void> }>('AuthBridge');

export async function syncTokenToNative(token: string) {
  await AuthBridge.setToken({ token });
}
```

Call `syncTokenToNative(token)` in `authStore` after every `setToken` and after restoring from `auth_backup`.

**`AuthBridgePlugin.swift` (iOS side):**
```swift
@objc(AuthBridgePlugin)
public class AuthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthBridgePlugin"
    public let jsName = "AuthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise)
    ]

    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else { return call.reject("Missing token") }
        KeychainHelper.shared.write(token: token, accessGroup: "group.com.funified.bandeja")
        WatchSessionManager.shared.sendToken(token)
        call.resolve()
    }
}
```

---

## Phase 1 — Watch App Skeleton & Networking {#phase-1}

### 1.1 — App Entry Point

```swift
// BandejaWatchApp.swift
@main
struct BandejaWatchApp: App {
    @State private var router = Router()
    @State private var gameListVM = GameListViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(router)
                .environment(gameListVM)
        }
    }
}
```

### 1.2 — Architecture Principles (Swift 6)

| Pattern | Usage |
|---------|-------|
| `@Observable @MainActor` | All ViewModels |
| `@State var vm = VM()` | Injecting VMs into views |
| `@Environment(VM.self)` | Consuming VMs deeper in the tree |
| `struct APIClient: Sendable` | Networking — no mutable state |
| `actor` | If networking needs mutable state (e.g., retry queue) |
| `async/await` | All async work — no Combine, no callbacks |
| `Codable & Sendable` | All model types |

### 1.3 — Network Layer (`APIClient.swift`)

```swift
struct APIClient: Sendable {
    let baseURL: URL = URL(string: "https://bandeja.me/api")!
    private let session: URLSession = .shared
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func fetch<T: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> T {
        var request = endpoint.urlRequest(baseURL: baseURL)
        if let token = KeychainHelper.shared.readToken(accessGroup: "group.com.funified.bandeja") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return try decoder.decode(T.self, from: data)
    }
}

enum APIError: Error {
    case httpError(Int)
    case noToken
    case decodingError(Error)
}
```

### 1.4 — Type-Safe Endpoints (`Endpoint.swift`)

```swift
enum Endpoint {
    case myGames
    case gameDetail(id: String)
    case updateGame(id: String, body: Encodable)
    case getResults(gameId: String)
    case syncResults(gameId: String, body: Encodable)
    case updateMatch(gameId: String, matchId: String, body: Encodable)
    case createRound(gameId: String, body: Encodable)
    case createMatch(gameId: String, roundId: String, body: Encodable)
    case recalculateOutcomes(gameId: String)

    func urlRequest(baseURL: URL) -> URLRequest { ... }
}
```

### 1.5 — Lightweight Models (`Codable & Sendable`)

```swift
struct WatchGame: Codable, Identifiable, Sendable {
    let id: String
    let title: String?
    let gameType: String
    let entityType: String
    let status: String
    let resultsStatus: String
    let startDate: Date?
    let endDate: Date?
    let winnerOfMatch: String?
    let winnerOfGame: String?
    let fixedNumberOfSets: Int?
    let maxTotalPointsPerSet: Int?
    let maxPointsPerTeam: Int?
    let ballsInGames: Int?
    let participants: [WatchParticipant]
    let club: WatchClub?
}

struct WatchParticipant: Codable, Identifiable, Sendable {
    let userId: String
    var id: String { userId }
    let role: String
    let user: WatchUser
}

struct WatchUser: Codable, Sendable {
    let id: String
    let firstName: String?
    let lastName: String?
    var displayName: String { "\(firstName ?? "") \(lastName?.prefix(1) ?? "")." }
}

struct WatchClub: Codable, Sendable {
    let id: String
    let name: String
    let isIndoor: Bool?
}

// Results
struct WatchRound: Codable, Identifiable, Sendable {
    let id: String
    var matches: [WatchMatch]
}

struct WatchMatch: Codable, Identifiable, Sendable {
    let id: String
    var teamA: [String]
    var teamB: [String]
    var sets: [WatchSet]
    var winnerId: String?
}

struct WatchSet: Codable, Sendable {
    var teamA: Int
    var teamB: Int
    var isTieBreak: Bool?
}
```

### 1.6 — Type-Safe Navigation Router (`Router.swift`)

```swift
@Observable
@MainActor
final class Router {
    var path = NavigationPath()

    enum Destination: Hashable {
        case gameDetail(id: String)
        case scoring(gameId: String)
        case finishGame(gameId: String)
        case outcomes(gameId: String)
    }

    func navigate(to destination: Destination) {
        path.append(destination)
    }

    func popToRoot() {
        path.removeLast(path.count)
    }
}
```

---

## Phase 2 — Game List Screen {#phase-2}

### `GameListViewModel.swift`

```swift
@Observable
@MainActor
final class GameListViewModel {
    var games: [WatchGame] = []
    var isLoading = false
    var error: Error?
    private let api = APIClient()

    func loadGames() async {
        isLoading = true
        defer { isLoading = false }
        do {
            games = try await api.fetch(.myGames)
        } catch {
            self.error = error
        }
    }

    var grouped: [(title: String, games: [WatchGame])] {
        // Group into Today / Upcoming / Recent using game.startDate
        ...
    }
}
```

### `GameListView.swift`

- Sections: **Today**, **Upcoming**, **Recent**.
- Each `GameRowView` shows:
  - Game title or club name.
  - Relative time ("in 2h", "Tomorrow 18:00").
  - Game type icon.
  - Player count badge (e.g., "3/4").
  - Status dot (green = started, yellow = announced, gray = finished).
- Pull to refresh via `.refreshable`.
- Not authenticated → `NotAuthenticatedView` ("Open Bandeja on your iPhone to sign in").
- Empty state → "No upcoming games."
- Error state → retry button.

---

## Phase 3 — Game Detail Screen {#phase-3}

### `GameDetailViewModel.swift`

- Fetches `GET /games/:id`.
- Polls every 30s when `resultsStatus == IN_PROGRESS` (another user may be editing).
- Determines contextual action button state.

### `GameDetailView.swift`

Scrollable sections:
1. **Header** — game type icon, title, date/time, club.
2. **Status banner** — "Announced" / "In Progress" / "Results Final".
3. **Participants** — compact chip list or 2-column team grid for fixed teams.
4. **Action button** (contextual):

| Condition | Button |
|-----------|--------|
| `ANNOUNCED` + is owner/admin | **Start Game** |
| `STARTED` + `resultsStatus == NONE` + can edit | **Enter Results** |
| `resultsStatus == IN_PROGRESS` | **Continue Scoring** |
| `resultsStatus == FINAL` | → Outcomes view (no button) |

---

## Phase 4 — Scoring Flow {#phase-4}

### 4.1 — `ScoringViewModel.swift`

Central state machine managing the full scoring session.

```swift
enum ScoringState: Equatable {
    case idle
    case settingUpRound(roundIndex: Int)
    case scoringSet(roundIndex: Int, matchIndex: Int, setIndex: Int)
    case matchComplete(roundIndex: Int, matchIndex: Int)
    case roundComplete(roundIndex: Int)
    case reviewing
    case finalizing
    case finished
    case error(String)
}

@Observable
@MainActor
final class ScoringViewModel {
    let game: WatchGame
    var rounds: [WatchRound] = []
    var state: ScoringState = .idle
    var isAmericano: Bool { game.winnerOfMatch == "BY_SCORES" && game.maxTotalPointsPerSet != nil }
    
    private let api = APIClient()
    private let haptics = HapticManager()

    // Derived from game config
    var maxSets: Int { game.fixedNumberOfSets ?? 3 }
    var maxPointsPerSet: Int { game.maxTotalPointsPerSet ?? 0 }
    var tieBreakPoints: Int { game.ballsInGames ?? 7 }

    func startResultsEntry() async throws { ... }
    func confirmSet(roundIdx: Int, matchIdx: Int, setIdx: Int, teamA: Int, teamB: Int, isTieBreak: Bool) async throws { ... }
    func finishMatch(roundIdx: Int, matchIdx: Int) async throws { ... }
    func addRound() async throws { ... }
    func syncToServer() async throws { ... }
    func finalizeResults() async throws { ... }
}
```

**Starting results entry:**
1. `PUT /games/:id` with `{ resultsStatus: "IN_PROGRESS" }`.
2. `POST /results/game/:gameId/rounds` → first round.
3. `POST /results/game/:gameId/rounds/:roundId/matches` → first match.
4. Navigate to scoring.

**Per set confirmation:**
- Validate set score (see validation rules below).
- `PUT /results/game/:gameId/matches/:matchId` with updated sets array.
- Haptic feedback on success.

### 4.2 — Set Score Validation

```swift
func validateSet(teamA: Int, teamB: Int, isTieBreak: Bool, game: WatchGame) -> Bool {
    if isTieBreak {
        let target = game.ballsInGames ?? 7
        let winner = max(teamA, teamB)
        let loser = min(teamA, teamB)
        return winner >= target && winner - loser >= 2
    }
    if let maxTotal = game.maxTotalPointsPerSet {
        return teamA + teamB == maxTotal          // Americano: must sum exactly
    }
    if let maxPerTeam = game.maxPointsPerTeam {
        return max(teamA, teamB) == maxPerTeam    // Classic: winner must hit max
    }
    return true
}
```

### 4.3 — `SetScoringView.swift` — Digital Crown Interaction

Used for **standard set scoring** (CLASSIC, MEXICANO, ROUND_ROBIN):

- Two large score numerals side by side.
- Digital Crown rotates the **focused team's** score.
- Tap left → focus Team A. Tap right → focus Team B.
- `WorkoutMetricsBar` at top (calories, HR, elapsed time).
- Hint text below: "Set 2 of 3 · Match 2 of 4 · Team A leads 1-0".
- "Confirm" button at bottom.
- Tie-break toggle (switches to `TieBreakScoringView`).

```swift
struct SetScoringView: View {
    @State var teamAScore: Int = 0
    @State var teamBScore: Int = 0
    @State var focused: Team = .A
    @FocusState var crownFocused: Bool

    var body: some View {
        VStack {
            WorkoutMetricsBar(...)
            ScoreHintBanner(...)
            HStack {
                ScoreButton(score: $teamAScore, isSelected: focused == .A)
                    .onTapGesture { focused = .A }
                Text("–")
                ScoreButton(score: $teamBScore, isSelected: focused == .B)
                    .onTapGesture { focused = .B }
            }
            .focusable(true)
            .digitalCrownRotation(
                focused == .A ? $teamAScore : $teamBScore,
                from: 0, through: 99, by: 1,
                sensitivity: .medium, isContinuous: false
            )
            Button("Confirm") { ... }
        }
    }
}
```

### 4.4 — `AmericanoScoringView.swift`

Used when `winnerOfMatch == BY_SCORES` with a `maxTotalPointsPerSet`:

- Team A score via Digital Crown.
- Team B auto-calculates: `maxTotalPointsPerSet - teamAScore`.
- Single confirm button.
- No tie-break toggle.

### 4.5 — `MatchSummaryView.swift`

Shown after the final set of a match:
- Set scores list (e.g., 6-4, 7-5).
- Winner highlight.
- Calories burned this match (delta from match start timestamp).
- "Next Match" → advance, "Add Round" → after all matches in round.

### 4.6 — `ScoreHintBanner.swift`

Adaptive hint text displayed during scoring:

| Context | Hint |
|---------|------|
| During set | "Set 2 of 3 · Match 2 of 6" |
| Team leader | "Team A leads 1-0 sets" |
| Last set | "Final set!" |
| Tie-break | "Tie-break — first to 7, win by 2" |
| Americano | "Total: 32 points per match" |

### 4.7 — Navigation During Scoring

- `NavigationStack` with programmatic `Router.path`.
- Confirm dialog on accidental back-swipe ("Your scores are saved — continue?").
- Leaving the app mid-scoring is safe — every set is synced to server.
- Re-entering: loads existing rounds from `GET /results/game/:gameId`, resumes from last incomplete set.

---

## Phase 5 — Finish Game & Outcomes {#phase-5}

### `FinishGameView.swift`

- Summary list of all rounds/matches/scores (scrollable).
- Total duration, match count.
- **"Finalize Results"** button:
  1. `syncToServer()` — ensure all sets are synced.
  2. `POST /results/game/:gameId/recalculate` — backend computes outcomes.
  3. Loading indicator.
  4. Navigate to `OutcomesView`.
- **"Edit Scores"** button — back into scoring.

### `OutcomesView.swift`

Fetches updated game from `GET /games/:id` after recalculate.

Displays:
- Position/ranking per player.
- Win/Loss/Tie indicator.
- Points earned (if `winnerOfGame == BY_POINTS`).
- Level change arrow + delta (if `affectsRating`).
- Full workout summary card (from `WorkoutManager`).
- Haptic celebration for the winning team.

### `WorkoutSummaryCard.swift`

Displayed at the bottom of `OutcomesView`:

| Metric | Value |
|--------|-------|
| Total calories | 342 kcal |
| Avg heart rate | 138 bpm |
| Max heart rate | 172 bpm |
| Duration | 1h 23m |

---

## Phase 6 — HealthKit: Calories & Workout Tracking {#phase-6}

### 6.1 — Permissions Setup (`HealthKitPermissions.swift`)

```swift
struct HealthKitPermissions {
    static let typesToShare: Set<HKSampleType> = [
        HKObjectType.workoutType()
    ]
    static let typesToRead: Set<HKObjectType> = [
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.heartRate),
        HKQuantityType(.basalEnergyBurned),
        HKObjectType.workoutType()
    ]
    static func requestAuthorization(store: HKHealthStore) async throws {
        try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
    }
}
```

Prompt on first "Enter Results" tap, before creating the workout session. Cache authorization status.

### 6.2 — `WorkoutManager.swift`

```swift
@Observable
@MainActor
final class WorkoutManager: NSObject {
    var isActive = false
    var activeCalories: Double = 0
    var heartRate: Double = 0
    var elapsedSeconds: TimeInterval = 0
    var matchStartCalories: Double = 0   // snapshot at match start for per-match delta

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
}
```

**Lifecycle tied to game events:**

| Game Event | Workout Action |
|------------|---------------|
| "Enter Results" tapped | `startWorkout(isIndoor:)` |
| Scoring in progress | Live metrics update via delegate |
| "Finalize Results" tapped | `endWorkout()` → saves `HKWorkout` |
| Game cancelled / reset | `discardWorkout()` — no save |
| Crash / relaunch | `recoverWorkout()` via `HKHealthStore.recoverActiveWorkoutSession()` |

**`startWorkout(isIndoor:)`:**
```swift
func startWorkout(isIndoor: Bool) async throws {
    let config = HKWorkoutConfiguration()
    config.activityType = .paddleSports
    config.locationType = isIndoor ? .indoor : .outdoor

    let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
    let builder = session.associatedWorkoutBuilder()
    builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
    session.delegate = self
    builder.delegate = self

    session.startActivity(with: .now)
    try await builder.beginCollection(at: .now)
    session.startMirroringToCompanionDevice()   // WWDC25 — mirrors to iPhone

    self.session = session
    self.builder = builder
    self.isActive = true
}
```

**Metrics collection (`HKLiveWorkoutBuilderDelegate`):**
```swift
extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ builder: HKLiveWorkoutBuilder,
                                     didCollectDataOf types: Set<HKSampleType>) {
        Task { @MainActor in
            if let e = builder.statistics(for: HKQuantityType(.activeEnergyBurned)) {
                activeCalories = e.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            }
            if let hr = builder.statistics(for: HKQuantityType(.heartRate)) {
                heartRate = hr.mostRecentQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) ?? 0
            }
            elapsedSeconds = builder.elapsedTime
        }
    }
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
```

**`endWorkout()`:**
```swift
func endWorkout() async throws {
    guard let session, let builder else { return }
    session.stopActivity(with: .now)
    try await builder.endCollection(at: .now)
    try await builder.finishWorkout()    // saves HKWorkout to HealthKit
    isActive = false
    self.session = nil
    self.builder = nil
}
```

**Crash recovery:**
```swift
func recoverWorkout() async {
    if let recoveredSession = try? await healthStore.recoverActiveWorkoutSession() {
        self.session = recoveredSession
        self.builder = recoveredSession.associatedWorkoutBuilder()
        self.isActive = true
    }
}
```

### 6.3 — `WorkoutMetricsBar.swift`

Compact bar displayed at the top of all scoring views:

```swift
struct WorkoutMetricsBar: View {
    let calories: Double
    let heartRate: Double
    let elapsed: TimeInterval

    var body: some View {
        HStack(spacing: 12) {
            Label(String(format: "%.0f", calories), systemImage: "flame.fill")
                .foregroundStyle(.orange)
            Label(String(format: "%.0f", heartRate), systemImage: "heart.fill")
                .foregroundStyle(.red)
            Label(elapsed.formatted(.time(pattern: .hourMinute)), systemImage: "timer")
                .foregroundStyle(.green)
        }
        .font(.caption2)
        .padding(.horizontal, 8)
    }
}
```

Hidden if HealthKit permission was denied.

### 6.4 — Indoor/Outdoor Detection

```swift
let isIndoor = game.club?.isIndoor ?? true   // default to indoor
try await workoutManager.startWorkout(isIndoor: isIndoor)
```

`.indoor` → no GPS, lower battery drain (~5-8% per hour on Watch Series 10).  
`.outdoor` → GPS-assisted calorie model.

### 6.5 — iPhone Workout Mirroring (`WorkoutMirrorHandler.swift`)

Add to the iOS App target (native Swift, not Capacitor):

```swift
// Called once in AppDelegate / native setup
healthStore.workoutSessionMirroringStartHandler = { [weak self] mirroredSession in
    DispatchQueue.main.async {
        // Optionally: start a Live Activity showing current score + calories
        // WorkoutLiveActivity.start(mirroredSession)
    }
}
```

This surfaces live workout data on the iPhone Lock Screen while the user is playing.

### 6.6 — Optional: Sync to Backend

After `endWorkout()`, optionally POST a summary to the Bandeja backend:

**New endpoint:** `POST /api/games/:id/workout`

```swift
struct WorkoutSummary: Codable, Sendable {
    let gameId: String
    let totalCalories: Double
    let avgHeartRate: Double
    let maxHeartRate: Double
    let durationSeconds: Int
    let workoutStartDate: Date
    let workoutEndDate: Date
}
```

Requires a new field on `GameOutcome` schema (optional — workout data lives in HealthKit regardless).

### 6.7 — Edge Cases

| Scenario | Behavior |
|----------|----------|
| HealthKit permission denied | Scoring works normally; `WorkoutMetricsBar` hidden |
| Watch disconnects mid-workout | Session continues locally; syncs to HealthKit on reconnect |
| App crash during workout | `recoverActiveWorkoutSession()` on relaunch |
| Multiple back-to-back games | `endWorkout()` on finalize, new session for next game |
| Game cancelled | `discardWorkout()` — no HKWorkout saved |

---

## Phase 7 — Complications, Widgets & Control Widgets {#phase-7}

All complications use **WidgetKit** (ClockKit is fully deprecated).

### 7.1 — Next Game Complication (`NextGameWidget.swift`)

```swift
struct NextGameWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nextGame", provider: NextGameTimelineProvider()) { entry in
            NextGameWidgetView(entry: entry)
        }
        .configurationDisplayName("Next Game")
        .description("Shows your next Bandeja game.")
        .supportedFamilies([
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline
        ])
    }
}
```

**Families:**
- `.accessoryRectangular` — title + time + club name.
- `.accessoryCircular` — hours until game countdown.
- `.accessoryInline` — "Bandeja: Game in 2h".

**RelevanceKit (watchOS 26):** Surface the complication in the Smart Stack when the user is near the padel club (Points of Interest signal).

### 7.2 — `NextGameTimelineProvider.swift`

- Fetches upcoming games using the shared JWT from `KeychainHelper`.
- Returns a 1-hour timeline. Refreshes via `WidgetCenter.shared.reloadAllTimelines()` after game list loads in the Watch app.

### 7.3 — Control Widget: Start Scoring (`StartScoringControl.swift`)

New in watchOS 26: **Control Widgets** — actionable tiles in Smart Stack and Control Center.

```swift
struct StartScoringControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlWidgetConfiguration(kind: "startScoring") {
            ControlWidgetButton(action: OpenBandejaIntent()) {
                Label("Bandeja", systemImage: "sportscourt.fill")
            }
        }
        .displayName("Start Scoring")
        .description("Jump into your current game.")
    }
}
```

iOS Control Widgets automatically share to watchOS 26 — define once, get both platforms.

---

## Phase 8 — WatchConnectivity Sync & Offline Resilience {#phase-8}

### 8.1 — `WatchSessionManager.swift` (Watch side)

```swift
@Observable
@MainActor
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()
    private let session = WCSession.default

    func activate() {
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    // Receive JWT from iPhone if Keychain is empty
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        if let token = userInfo["token"] as? String {
            KeychainHelper.shared.write(token: token, accessGroup: "group.com.funified.bandeja")
        }
    }

    // Notify iPhone that scoring was updated on Watch
    func notifyScoreUpdated(gameId: String) {
        session.transferUserInfo(["event": "scoreUpdated", "gameId": gameId])
    }
}
```

### 8.2 — Offline Queue

When the Watch cannot reach `bandeja.me` during scoring:

1. Scoring state is held in `ScoringViewModel` memory (not lost).
2. Failed `updateMatch` calls are queued in `UserDefaults(suiteName: "group.com.funified.bandeja")`.
3. A `Network.framework` monitor (`NWPathMonitor`) watches connectivity.
4. When reconnected, the queue flushes in order.
5. An "Offline" badge is shown in `WorkoutMetricsBar` when network is unavailable.

### 8.3 — Cache for Complications

Game list cached in `UserDefaults(suiteName: "group.com.funified.bandeja")` after every successful fetch:
- Key: `"cachedGames"`, value: encoded `[WatchGame]`.
- Used by `NextGameTimelineProvider` when network is unavailable.

---

## File Structure Reference {#file-structure}

```
Frontend/ios/App/
├── App/                                         # iOS Capacitor target
│   ├── AppDelegate.swift                        (existing)
│   ├── MainViewController.swift                 (existing)
│   ├── AuthBridgePlugin.swift                   NEW
│   ├── WatchSessionManager.swift                NEW
│   └── WorkoutMirrorHandler.swift               NEW
│
└── BandejaWatch/                                # watchOS target (new)
    ├── BandejaWatchApp.swift
    ├── Models/
    │   ├── WatchGame.swift
    │   ├── WatchRound.swift
    │   ├── WatchParticipant.swift
    │   └── ScoringState.swift
    ├── Services/
    │   ├── APIClient.swift
    │   ├── Endpoint.swift
    │   ├── KeychainHelper.swift
    │   ├── WatchSessionManager.swift
    │   ├── WorkoutManager.swift
    │   ├── HealthKitPermissions.swift
    │   └── HapticManager.swift
    ├── ViewModels/
    │   ├── Router.swift
    │   ├── GameListViewModel.swift
    │   ├── GameDetailViewModel.swift
    │   └── ScoringViewModel.swift
    ├── Views/
    │   ├── GameList/
    │   │   ├── GameListView.swift
    │   │   └── GameRowView.swift
    │   ├── GameDetail/
    │   │   ├── GameDetailView.swift
    │   │   └── ParticipantChipView.swift
    │   ├── Scoring/
    │   │   ├── ScoringView.swift
    │   │   ├── SetScoringView.swift
    │   │   ├── AmericanoScoringView.swift
    │   │   ├── MatchSummaryView.swift
    │   │   ├── ScoreHintBanner.swift
    │   │   └── WorkoutMetricsBar.swift
    │   ├── Finish/
    │   │   ├── FinishGameView.swift
    │   │   ├── OutcomesView.swift
    │   │   └── WorkoutSummaryCard.swift
    │   └── Auth/
    │       └── NotAuthenticatedView.swift
    ├── Widgets/
    │   ├── NextGameWidget.swift
    │   ├── NextGameTimelineProvider.swift
    │   ├── StartScoringControl.swift
    │   └── WidgetViews.swift
    └── Extensions/
        └── Color+Brand.swift

Frontend/src/services/
└── authBridge.ts                                NEW
```

---

## Effort Estimate Summary {#effort-estimate}

| Step | Scope | Days |
|------|-------|------|
| 0 | Xcode 26 target + App Groups + Keychain + HealthKit entitlements | 0.5 |
| 1 | Auth bridge (Capacitor plugin + Keychain write + Watch read) | 1.5 |
| 2 | `APIClient` + `Endpoint` + `Codable/Sendable` models | 1.0 |
| 3 | `GameListView` + `GameListViewModel` | 1.0 |
| 4 | `GameDetailView` + `GameDetailViewModel` | 1.0 |
| 5 | `ScoringViewModel` state machine + validation logic | 2.5 |
| 6 | `SetScoringView` (Digital Crown + Liquid Glass) | 1.5 |
| 7 | `AmericanoScoringView` (points mode) | 0.5 |
| 8 | Match/round flow + `Router` navigation | 1.5 |
| 9 | `FinishGameView` + `OutcomesView` | 1.0 |
| 10 | Hints, haptics, error states, `NotAuthenticatedView` | 1.0 |
| 11 | `WorkoutManager` (session lifecycle, delegates, crash recovery) | 1.5 |
| 12 | `WorkoutMetricsBar` + integration into scoring views | 0.5 |
| 13 | `WorkoutSummaryCard` in outcomes | 0.5 |
| 14 | iPhone workout mirroring handler | 0.5 |
| 15 | HealthKit edge cases (offline, crash recovery, cancel) | 0.5 |
| 16 | WidgetKit complications + RelevanceKit | 1.5 |
| 17 | Control Widget (Smart Stack) | 0.5 |
| 18 | `WatchConnectivity` sync + offline queue | 1.5 |
| 19 | Backend workout endpoint (optional) | 0.5 |
| 20 | Device testing + edge cases + polish | 2.5 |
| **Total** | | **~23–25 days** |

---

## Key Technical Decisions {#key-decisions}

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | `@Observable @MainActor` | Swift 6 standard; property-level tracking saves battery on Watch |
| Networking | `struct APIClient: Sendable` + `async/await` | No Combine; pure Swift 6 concurrency |
| Auth sharing | Shared Keychain (primary) + WCSession (fallback) | Keychain works when iPhone is unreachable |
| Watch ↔ iPhone | `WCSession.transferUserInfo` | Reliable delivery, handles phone-offline |
| Workout type | `HKWorkoutActivityType.paddleSports` | Exact match for padel; correct metabolic model |
| Calorie model | `HKLiveWorkoutBuilder` auto-collection | Sensor fusion (heart rate + accelerometer); most accurate |
| Court type default | `.indoor` | Most padel courts are indoor; avoids GPS drain |
| Score sync frequency | Per **set** (not per point) | Matches `updateMatch` API contract; minimal network calls |
| Socket.IO | Not used on Watch | Too heavy; polling `getResults` every 10s during active co-editing |
| Complications | WidgetKit only | ClockKit fully deprecated |
| Minimum OS | watchOS 26 | New app — no backward compat needed; use all latest APIs |
| Design | Liquid Glass | Adopt system materials; `.glassEffect()` on toolbars and controls |
| Swift version | Swift 6, Strict Concurrency: Complete | Data-race safety by construction; compiler-enforced |
