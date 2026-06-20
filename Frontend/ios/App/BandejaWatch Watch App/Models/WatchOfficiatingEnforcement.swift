import Foundation

/// Mirrors `Frontend/shared/officiatingEnforcement.ts`.
enum WatchOfficiatingEnforcement {
    static func opponentTeam(_ side: TeamSide) -> TeamSide {
        side == .teamA ? .teamB : .teamA
    }

    static func isLetReplayBlockingScore(letPending: Bool, level: WatchOfficiatingLevel) -> Bool {
        level.isStrict && letPending
    }

    /// BWF: even server score → right service court, odd → left.
    static func expectedBadmintonCourtSide(serverScore: Int) -> CourtServeSide {
        serverScore.isMultiple(of: 2) ? .rightDeuce : .leftAd
    }

    static func validateStrictBadmintonServeCourt(serverScore: Int, courtSide: CourtServeSide) -> Bool {
        courtSide == expectedBadmintonCourtSide(serverScore: serverScore)
    }

    static func strictBadmintonServeBlocksUserScoring(
        level: WatchOfficiatingLevel,
        sport: WatchSport?,
        serverScore: Int,
        courtSide: CourtServeSide?
    ) -> Bool {
        guard level.isStrict, sport == .badminton, let courtSide else { return false }
        return !validateStrictBadmintonServeCourt(serverScore: serverScore, courtSide: courtSide)
    }
}
