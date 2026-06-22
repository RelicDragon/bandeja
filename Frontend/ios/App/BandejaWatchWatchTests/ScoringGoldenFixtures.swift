import Foundation
@testable import BandejaWatch_Watch_App

/// Shared live-scoring golden catalog loader for Watch scoring parity CI.
///
/// Fixture catalog: `Frontend/src/utils/liveScoring/fixtures/scoringGolden.json`.
/// How to add a fixture: see `Frontend/src/utils/liveScoring/scoringGolden.harness.ts`.
@MainActor
enum ScoringGoldenFixtures {
    struct RulesOverride: Decodable, Sendable {
        var deucesBeforeGoldenPoint: Int?
        var superTieBreakReplacesDeciderAtIndex: Int?
    }

    struct ExpectedClassic: Decodable, Sendable {
        var pointState: WatchLivePointState?
        var withinSetTieBreak: Bool?
        var tieBreakA: Int?
        var tieBreakB: Int?
        var classicPointsPlayedInGame: Int?
        var deuceCount: Int?
    }

    struct ExpectedSet: Decodable, Sendable {
        var teamA: Int?
        var teamB: Int?
        var isTieBreak: Bool?
    }

    struct Expected: Decodable, Sendable {
        var changed: Bool?
        var activeSetIndex: Int?
        var sets: [ExpectedSet]?
        var classic: ExpectedClassic?
        var canAdvanceLiveSet: Bool?
        var matchWinner: String?
        var optionalDeciderChoicePending: Bool?
    }

    struct StateOverlay: Decodable, Sendable {
        var activeSetIndex: Int?
        var mode: WatchLiveScoringMode?
        var sets: [WatchSetWrite]?
        var classic: WatchLiveClassicState?
        var optionalDeciderFormat: String?
        var timedClassicSetLocked: Bool?
    }

    struct CatalogEntry: Decodable, Sendable {
        var name: String
        var sport: String
        var preset: String
        var rules: RulesOverride?
        var initialSets: [WatchSetWrite]?
        var state: StateOverlay?
        var actions: [TeamSide]?
        var expected: Expected
    }

    static func catalogURL() throws -> URL {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            let candidate = dir.appendingPathComponent("src/utils/liveScoring/fixtures/scoringGolden.json")
            if FileManager.default.fileExists(atPath: candidate.path) {
                return candidate
            }
            dir = dir.deletingLastPathComponent()
        }
        throw NSError(domain: "ScoringGoldenFixtures", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "scoringGolden.json not found (walk up from \(#filePath))",
        ])
    }

    static func loadCatalog() throws -> [CatalogEntry] {
        let data = try Data(contentsOf: catalogURL())
        let entries = try JSONDecoder().decode([CatalogEntry].self, from: data)
        guard !entries.isEmpty else {
            throw NSError(domain: "ScoringGoldenFixtures", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "scoringGolden.json must be non-empty",
            ])
        }
        return entries
    }

    static func rules(for entry: CatalogEntry) -> WatchScoringRules {
        let preset = WatchScoringPreset(rawValue: entry.preset) ?? .classicBo3
        var rules = WatchScoringRulebook.skeleton(for: preset)
        if let gp = entry.rules?.deucesBeforeGoldenPoint {
            rules.deucesBeforeGoldenPoint = gp
        }
        if let override = entry.rules, override.superTieBreakReplacesDeciderAtIndex != nil {
            rules.superTieBreakReplacesDeciderAtIndex = override.superTieBreakReplacesDeciderAtIndex
        }
        return rules
    }

    static func buildState(for entry: CatalogEntry, rules: WatchScoringRules) -> WatchLiveScoringState {
        var state = WatchLiveScoringEngine.makeInitialState(rules: rules, initialSets: entry.initialSets)
        guard let overlay = entry.state else { return state }
        if let sets = overlay.sets { state.sets = sets }
        if let idx = overlay.activeSetIndex { state.activeSetIndex = idx }
        if let mode = overlay.mode { state.mode = mode }
        if let classic = overlay.classic { state.classic = classic }
        if let format = overlay.optionalDeciderFormat { state.optionalDeciderFormat = format }
        if let locked = overlay.timedClassicSetLocked { state.timedClassicSetLocked = locked }
        return WatchLiveScoringEngine.parseState(state, rules: rules, fallbackSets: entry.initialSets)
    }

    static func runFixture(_ entry: CatalogEntry) -> WatchLiveScoringEngine.ActionResult {
        let rules = rules(for: entry)
        var state = buildState(for: entry, rules: rules)
        var changed = false
        for side in entry.actions ?? [] {
            let result = WatchLiveScoringEngine.scorePoint(state: state, side: side, rules: rules)
            if result.changed { changed = true }
            state = WatchLiveScoringEngine.autoAdvanceCompletedSets(state: result.state, rules: rules)
        }
        return WatchLiveScoringEngine.ActionResult(state: state, changed: changed)
    }

    static func assertResult(_ result: WatchLiveScoringEngine.ActionResult, matches entry: CatalogEntry) -> String? {
        let rules = rules(for: entry)
        let expected = entry.expected
        let state = result.state

        if let exp = expected.changed, result.changed != exp {
            return "\(entry.name): changed expected \(exp) got \(result.changed)"
        }
        if let exp = expected.activeSetIndex, state.activeSetIndex != exp {
            return "\(entry.name): activeSetIndex expected \(exp) got \(state.activeSetIndex)"
        }
        if let expSets = expected.sets {
            for (i, exp) in expSets.enumerated() {
                guard let row = state.sets[safe: i] else { return "\(entry.name): missing set \(i)" }
                if let v = exp.teamA, row.teamA != v { return "\(entry.name): sets[\(i)].teamA" }
                if let v = exp.teamB, row.teamB != v { return "\(entry.name): sets[\(i)].teamB" }
                if let v = exp.isTieBreak, row.isTieBreak != v { return "\(entry.name): sets[\(i)].isTieBreak" }
            }
        }
        if let expClassic = expected.classic {
            guard let classic = state.classic else { return "\(entry.name): expected classic" }
            if let ps = expClassic.pointState, !pointStatesEqual(classic.pointState, ps) {
                return "\(entry.name): classic.pointState"
            }
            if let v = expClassic.withinSetTieBreak, classic.withinSetTieBreak != v {
                return "\(entry.name): classic.withinSetTieBreak"
            }
            if let v = expClassic.tieBreakA, classic.tieBreakA != v { return "\(entry.name): classic.tieBreakA" }
            if let v = expClassic.tieBreakB, classic.tieBreakB != v { return "\(entry.name): classic.tieBreakB" }
            if let v = expClassic.classicPointsPlayedInGame, classic.classicPointsPlayedInGame != v {
                return "\(entry.name): classic.classicPointsPlayedInGame"
            }
            if let v = expClassic.deuceCount, classic.deuceCount != v { return "\(entry.name): classic.deuceCount" }
        }
        if let exp = expected.canAdvanceLiveSet {
            let actual = WatchLiveScoringEngine.canAdvanceLiveSet(state: state, rules: rules)
            if actual != exp { return "\(entry.name): canAdvanceLiveSet" }
        }
        if let exp = expected.optionalDeciderChoicePending {
            let actual = WatchLiveScoringEngine.optionalDeciderChoicePending(state: state, rules: rules)
            if actual != exp { return "\(entry.name): optionalDeciderChoicePending" }
        }
        if let exp = expected.matchWinner {
            let winner = WatchComputeMatchWinner.computeMatchWinner(sets: state.sets, rules: rules)
            let label: String? =
                switch winner {
                case .teamA: "A"
                case .teamB: "B"
                case nil: nil
                }
            if label != exp { return "\(entry.name): matchWinner" }
        }
        return nil
    }

    private static func pointStatesEqual(_ a: WatchLivePointState, _ b: WatchLivePointState) -> Bool {
        switch (a, b) {
        case (.deuce, .deuce):
            return true
        case (.advantage(let sa), .advantage(let sb)):
            return sa == sb
        case (.regular(let aa, let ab), .regular(let ba, let bb)):
            return aa == ba && ab == bb
        default:
            return false
        }
    }
}
