import Foundation
@testable import BandejaWatch_Watch_App

/// Shared serve-guide golden catalog loader for Watch `ServeGuideEngine` parity CI.
///
/// Fixture catalog: `Frontend/src/utils/liveScoring/fixtures/serveGuideGolden.json`.
/// How to add a fixture: see `Frontend/src/utils/liveScoring/serveGuideGolden.harness.ts`.
@MainActor
enum ServeGuideGoldenFixtures {
    struct CatalogEntry: Decodable, Sendable {
        struct RulesOverride: Decodable, Sendable {
            var hasGoldenPoint: Bool?
        }

        struct ServeSeed: Decodable, Sendable {
            var firstServerTeam: TeamSide?
            var firstServerDoublesPlayerIndex: Int?
            var pointsServeRotation: String?
            var matchStartCourtEndsSwapped: Bool?
            var matchStartTeamASidesMirrored: Bool?
            var matchStartTeamBSidesMirrored: Bool?
            var pointWinnerLog: [TeamSide]?
        }

        struct Expected: Decodable, Sendable {
            var serverTeam: TeamSide?
            var serverPlayerIndex: Int?
            var serverDisplayName: String?
            var courtSide: String?
            var tieBreakServeSlot: String?
            var changeEndsBeforeNextPoint: Bool?
            var courtEndsSwapped: Bool?
            var courtTeamASidesMirrored: Bool?
            var courtTeamBSidesMirrored: Bool?
            var motionToken: String?
            var motionTokenPrefix: String?
        }

        var name: String
        var sport: String
        var preset: String
        var teamAPlayerNames: [String]
        var teamBPlayerNames: [String]
        var matchDoubles: Bool
        var initialSets: [WatchSetWrite]?
        var actions: [TeamSide]?
        var serveSeed: ServeSeed?
        var state: WatchLiveScoringState?
        var rules: RulesOverride?
        var expectNull: Bool?
        var expected: Expected?
    }

    static func catalogURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("src/utils/liveScoring/fixtures/serveGuideGolden.json")
    }

    static func loadCatalog() throws -> [CatalogEntry] {
        let data = try Data(contentsOf: catalogURL())
        let entries = try JSONDecoder().decode([CatalogEntry].self, from: data)
        guard !entries.isEmpty else {
            throw NSError(domain: "ServeGuideGoldenFixtures", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "serveGuideGolden.json must be non-empty",
            ])
        }
        return entries
    }

    static func resolvedState(for entry: CatalogEntry) throws -> WatchLiveScoringState {
        if let actions = entry.actions, !actions.isEmpty {
            let preset = WatchScoringPreset(rawValue: entry.preset) ?? .classicBo3
            var rules = WatchScoringRulebook.skeleton(for: preset)
            if entry.rules?.hasGoldenPoint == true { rules.hasGoldenPoint = true }
            var state = WatchLiveScoringEngine.makeInitialState(
                rules: rules,
                initialSets: entry.initialSets
            )
            for side in actions {
                state = WatchLiveScoringEngine.scorePoint(state: state, side: side, rules: rules).state
            }
            if let seed = entry.serveSeed {
                state = merge(seed: seed, into: state)
            }
            if let overlay = entry.state {
                state = merge(overlay: overlay, into: state)
            }
            return state
        }
        if let overlay = entry.state {
            let preset = WatchScoringPreset(rawValue: entry.preset) ?? .classicBo3
            var rules = WatchScoringRulebook.skeleton(for: preset)
            if entry.rules?.hasGoldenPoint == true { rules.hasGoldenPoint = true }
            var state = WatchLiveScoringEngine.parseState(
                overlay,
                rules: rules,
                fallbackSets: entry.initialSets
            )
            if let seed = entry.serveSeed {
                state = merge(seed: seed, into: state)
            }
            return state
        }
        throw NSError(domain: "ServeGuideGoldenFixtures", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "fixture \(entry.name) needs state or actions",
        ])
    }

    static func inputs(for entry: CatalogEntry) throws -> ServeGuideInputs {
        let sport = WatchSport.resolved(from: entry.sport)
        let preset = WatchScoringPreset(rawValue: entry.preset) ?? .classicBo3
        var rules = WatchScoringRulebook.skeleton(for: preset)
        if entry.rules?.hasGoldenPoint == true { rules.hasGoldenPoint = true }

        let state = try resolvedState(for: entry)
        let usesTennisSetRules = sport == .tennis ? true : rules.ballsInGames
        let isAmericano = rules.isBallBudgetPoints
        let usesRally = !isAmericano && rules.usesRallyPointCap && sport.usesRallySetScoring
        let activeRow = state.sets[safe: state.activeSetIndex]
        let supplemental = activeRow.map { $0.resolvedRole != .official } ?? false
        let superTb = usesTennisSetRules && !supplemental && (activeRow?.isTieBreak == true)

        return ServeGuideInputs(
            matchFirstServerTeam: state.firstServerTeam,
            matchFirstDoublesPlayerIndex: state.firstServerDoublesPlayerIndex,
            seedSkipped: state.serveGuideSkipped == true,
            hintsMode: .on,
            resolvedSport: sport,
            usesTennisSetRules: usesTennisSetRules,
            isDoublesMatch: entry.matchDoubles,
            isAmericano: isAmericano,
            isReadOnly: false,
            activeSetIndex: state.activeSetIndex,
            sets: state.sets,
            activeSetIsSupplemental: supplemental,
            activeSetIsSuperTieBreak: superTb,
            withinSetTieBreakMode: state.classic?.withinSetTieBreak ?? false,
            tieBreakA: state.classic?.tieBreakA ?? 0,
            tieBreakB: state.classic?.tieBreakB ?? 0,
            classicPointsPlayedInGame: state.classic?.classicPointsPlayedInGame ?? 0,
            teamAPlayerNames: entry.teamAPlayerNames,
            teamBPlayerNames: entry.teamBPlayerNames,
            pendingSetFormatChoice: false,
            pointsServeRotation: state.pointsServeRotation,
            usesRallyPointsServeGuide: usesRally,
            rallyPointsSport: usesRally ? sport : nil,
            rallyPointsPerSet: rules.totalPointsPerSet,
            rallyFixedNumberOfSets: rules.fixedNumberOfSets,
            rallyWinBy: max(rules.winBy, 2),
            matchStartCourtEndsSwapped: state.matchStartCourtEndsSwapped == true,
            matchStartTeamASidesMirrored: state.matchStartTeamASidesMirrored == true,
            matchStartTeamBSidesMirrored: state.matchStartTeamBSidesMirrored == true,
            pointWinnerLog: state.pointWinnerLog ?? []
        )
    }

    static func assertSnapshot(_ snap: ServeGuideSnapshot?, matches entry: CatalogEntry) -> String? {
        if entry.expectNull == true {
            return snap == nil ? nil : "\(entry.name): expected nil snapshot"
        }
        guard let snap, let expected = entry.expected else {
            return "\(entry.name): expected snapshot"
        }
        if let team = expected.serverTeam, snap.serverTeam != team {
            return "\(entry.name): serverTeam"
        }
        if let idx = expected.serverPlayerIndex, snap.serverPlayerIndex != idx {
            return "\(entry.name): serverPlayerIndex"
        }
        if let name = expected.serverDisplayName, snap.serverDisplayName != name {
            return "\(entry.name): serverDisplayName"
        }
        if let side = expected.courtSide {
            let actual = snap.courtSide == .rightDeuce ? "rightDeuce" : "leftAd"
            if actual != side { return "\(entry.name): courtSide" }
        }
        if let slot = expected.tieBreakServeSlot {
            let actual: String? = snap.tieBreakServeSlot.map { $0 == .serveOne ? "serveOne" : "serveTwo" }
            if actual != slot { return "\(entry.name): tieBreakServeSlot" }
        } else if expected.tieBreakServeSlot == nil && entry.expected?.tieBreakServeSlot != nil {
            // explicit null in JSON decodes as missing; handled via optional key below
        }
        if let change = expected.changeEndsBeforeNextPoint, snap.changeEndsBeforeNextPoint != change {
            return "\(entry.name): changeEndsBeforeNextPoint"
        }
        if let swapped = expected.courtEndsSwapped, snap.courtEndsSwapped != swapped {
            return "\(entry.name): courtEndsSwapped"
        }
        if let mirrored = expected.courtTeamASidesMirrored, snap.courtTeamASidesMirrored != mirrored {
            return "\(entry.name): courtTeamASidesMirrored"
        }
        if let mirrored = expected.courtTeamBSidesMirrored, snap.courtTeamBSidesMirrored != mirrored {
            return "\(entry.name): courtTeamBSidesMirrored"
        }
        if let token = expected.motionToken, snap.motionToken != token {
            return "\(entry.name): motionToken"
        }
        if let prefix = expected.motionTokenPrefix, !snap.motionToken.hasPrefix(prefix) {
            return "\(entry.name): motionToken prefix"
        }
        return nil
    }

    private static func merge(seed: CatalogEntry.ServeSeed, into state: WatchLiveScoringState) -> WatchLiveScoringState {
        var copy = state
        if let v = seed.firstServerTeam { copy.firstServerTeam = v }
        if let v = seed.firstServerDoublesPlayerIndex { copy.firstServerDoublesPlayerIndex = v }
        if let v = seed.pointsServeRotation { copy.pointsServeRotation = v }
        if let v = seed.matchStartCourtEndsSwapped { copy.matchStartCourtEndsSwapped = v }
        if let v = seed.matchStartTeamASidesMirrored { copy.matchStartTeamASidesMirrored = v }
        if let v = seed.matchStartTeamBSidesMirrored { copy.matchStartTeamBSidesMirrored = v }
        if let v = seed.pointWinnerLog { copy.pointWinnerLog = v }
        return copy
    }

    private static func merge(overlay: WatchLiveScoringState, into state: WatchLiveScoringState) -> WatchLiveScoringState {
        var copy = state
        copy.activeSetIndex = overlay.activeSetIndex
        copy.mode = overlay.mode
        copy.sets = overlay.sets
        copy.classic = overlay.classic
        if let v = overlay.firstServerTeam { copy.firstServerTeam = v }
        if let v = overlay.firstServerDoublesPlayerIndex { copy.firstServerDoublesPlayerIndex = v }
        if let v = overlay.pointsServeRotation { copy.pointsServeRotation = v }
        if let v = overlay.matchStartCourtEndsSwapped { copy.matchStartCourtEndsSwapped = v }
        if let v = overlay.matchStartTeamASidesMirrored { copy.matchStartTeamASidesMirrored = v }
        if let v = overlay.matchStartTeamBSidesMirrored { copy.matchStartTeamBSidesMirrored = v }
        if let v = overlay.serveGuideSkipped { copy.serveGuideSkipped = v }
        if let v = overlay.pointWinnerLog { copy.pointWinnerLog = v }
        return copy
    }
}

private extension WatchSport {
    var usesRallySetScoring: Bool {
        switch self {
        case .tableTennis, .badminton, .pickleball, .squash:
            return true
        default:
            return false
        }
    }
}

/// Minimal live-scoring helpers for golden fixture action replay (parity with FE `core.ts`).
@MainActor
enum WatchLiveScoringEngine {
    static func makeInitialState(rules: WatchScoringRules, initialSets: [WatchSetWrite]?) -> WatchLiveScoringState {
        let sets = normalizedSets(initialSets)
        let mode: WatchLiveScoringMode = rules.isClassic ? .classic : .points
        var classic: WatchLiveClassicState?
        if mode == .classic {
            classic = WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: tieBreakActive(in: sets, index: 0, rules: rules),
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            )
        }
        return WatchLiveScoringState(
            activeSetIndex: 0,
            mode: mode,
            sets: sets,
            classic: classic,
            firstServerTeam: nil,
            firstServerDoublesPlayerIndex: nil,
            pointsServeRotation: nil,
            matchStartCourtEndsSwapped: nil,
            matchStartTeamASidesMirrored: nil,
            matchStartTeamBSidesMirrored: nil,
            serveGuideSkipped: nil,
            optionalDeciderFormat: nil,
            timedClassicSetLocked: nil,
            pointWinnerLog: nil
        )
    }

    static func parseState(
        _ raw: WatchLiveScoringState,
        rules: WatchScoringRules,
        fallbackSets: [WatchSetWrite]?
    ) -> WatchLiveScoringState {
        let sets = normalizedSets(raw.sets.isEmpty ? fallbackSets : raw.sets)
        let active = min(max(raw.activeSetIndex, 0), max(sets.count - 1, 0))
        let mode = raw.mode
        var classic = raw.classic
        if mode == .classic, classic == nil {
            classic = WatchLiveClassicState(
                pointState: .regular(teamA: .zero, teamB: .zero),
                withinSetTieBreak: tieBreakActive(in: sets, index: active, rules: rules),
                tieBreakA: 0,
                tieBreakB: 0,
                classicPointsPlayedInGame: 0
            )
        }
        return WatchLiveScoringState(
            activeSetIndex: active,
            mode: mode,
            sets: sets,
            classic: classic,
            firstServerTeam: raw.firstServerTeam,
            firstServerDoublesPlayerIndex: raw.firstServerDoublesPlayerIndex,
            pointsServeRotation: raw.pointsServeRotation,
            matchStartCourtEndsSwapped: raw.matchStartCourtEndsSwapped,
            matchStartTeamASidesMirrored: raw.matchStartTeamASidesMirrored,
            matchStartTeamBSidesMirrored: raw.matchStartTeamBSidesMirrored,
            serveGuideSkipped: raw.serveGuideSkipped,
            optionalDeciderFormat: raw.optionalDeciderFormat,
            timedClassicSetLocked: raw.timedClassicSetLocked,
            pointWinnerLog: raw.pointWinnerLog
        )
    }

    struct ScoreResult {
        var state: WatchLiveScoringState
    }

    static func scorePoint(state: WatchLiveScoringState, side: TeamSide, rules: WatchScoringRules) -> ScoreResult {
        var copy = state
        if rules.isClassic, var classic = copy.classic {
            if classic.withinSetTieBreak {
                if side == .teamA { classic.tieBreakA += 1 } else { classic.tieBreakB += 1 }
            } else {
                classic.classicPointsPlayedInGame += 1
                switch classic.pointState {
                case .regular(var a, var b):
                    if side == .teamA {
                        a = nextPadelPoint(a)
                    } else {
                        b = nextPadelPoint(b)
                    }
                    if wonClassicGame(a: a, b: b, rules: rules) {
                        incrementGame(on: &copy, side: side)
                        classic.pointState = .regular(teamA: .zero, teamB: .zero)
                        classic.classicPointsPlayedInGame = 0
                        classic.tieBreakA = 0
                        classic.tieBreakB = 0
                        classic.withinSetTieBreak = tieBreakActive(in: copy.sets, index: copy.activeSetIndex, rules: rules)
                    } else {
                        classic.pointState = .regular(teamA: a, teamB: b)
                    }
                case .deuce:
                    classic.pointState = .advantage(side)
                case .advantage(let adv):
                    if adv == side {
                        incrementGame(on: &copy, side: side)
                        classic.pointState = .regular(teamA: .zero, teamB: .zero)
                        classic.classicPointsPlayedInGame = 0
                        classic.withinSetTieBreak = tieBreakActive(in: copy.sets, index: copy.activeSetIndex, rules: rules)
                    } else {
                        classic.pointState = .regular(teamA: .forty, teamB: .forty)
                    }
                }
            }
            copy.classic = classic
            return ScoreResult(state: copy)
        }
        var sets = copy.sets
        guard var row = sets[safe: copy.activeSetIndex] else { return ScoreResult(state: copy) }
        if side == .teamA { row.teamA += 1 } else { row.teamB += 1 }
        sets[copy.activeSetIndex] = row
        copy.sets = sets
        var log = copy.pointWinnerLog ?? []
        log.append(side)
        copy.pointWinnerLog = log
        return ScoreResult(state: copy)
    }

    private static func normalizedSets(_ sets: [WatchSetWrite]?) -> [WatchSetWrite] {
        let input = sets ?? []
        if input.isEmpty {
            return [WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false)]
        }
        return input
    }

    private static func tieBreakActive(in sets: [WatchSetWrite], index: Int, rules: WatchScoringRules) -> Bool {
        guard rules.isClassic, let row = sets[safe: index], !row.isTieBreak else { return false }
        let tbAt = rules.gamesScoreForTieBreak
        return row.teamA == tbAt && row.teamB == tbAt
    }

    private static func nextPadelPoint(_ p: PadelPoint) -> PadelPoint {
        switch p {
        case .zero: return .fifteen
        case .fifteen: return .thirty
        case .thirty: return .forty
        case .forty: return .forty
        }
    }

    private static func wonClassicGame(a: PadelPoint, b: PadelPoint, rules: WatchScoringRules) -> Bool {
        if rules.hasGoldenPoint, a == .forty, b == .forty { return true }
        if a == .forty, b.rawValue <= PadelPoint.thirty.rawValue { return true }
        if b == .forty, a.rawValue <= PadelPoint.thirty.rawValue { return true }
        return false
    }

    private static func incrementGame(on state: inout WatchLiveScoringState, side: TeamSide) {
        guard var row = state.sets[safe: state.activeSetIndex] else { return }
        if side == .teamA { row.teamA += 1 } else { row.teamB += 1 }
        state.sets[state.activeSetIndex] = row
    }
}
