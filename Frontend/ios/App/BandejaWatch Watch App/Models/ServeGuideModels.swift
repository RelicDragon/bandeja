import Foundation

enum WatchServeHintsMode: String, Codable, Sendable, CaseIterable {
    case on
    case compact
    case off

    nonisolated var next: WatchServeHintsMode {
        switch self {
        case .on: return .compact
        case .compact: return .off
        case .off: return .on
        }
    }
}

enum CourtServeSide: Sendable, Equatable {
    case rightDeuce
    case leftAd

    var isRight: Bool {
        switch self {
        case .rightDeuce: return true
        case .leftAd: return false
        }
    }
}

struct ServeGuideSnapshot: Sendable, Equatable, Identifiable {
    var id: String { motionToken }
    var serverTeam: TeamSide
    var serverPlayerIndex: Int
    var serverDisplayName: String
    var serverInitial: String
    var courtSide: CourtServeSide
    var tieBreakServeSlot: TieBreakServeSlot?
    var changeEndsBeforeNextPoint: Bool
    /// Team A at diagram bottom when false; XOR match-start anchor and change-of-ends parity.
    var courtEndsSwapped: Bool
    var courtTeamASidesMirrored: Bool
    var courtTeamBSidesMirrored: Bool
    var accessibilityLine: String
    var motionToken: String

    func replacingMotionToken(_ motionToken: String) -> ServeGuideSnapshot {
        var copy = self
        copy.motionToken = motionToken
        return copy
    }
}

enum TieBreakServeSlot: Sendable, Equatable {
    case serveOne
    case serveTwo
}
