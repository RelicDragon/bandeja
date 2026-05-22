import Foundation

/// Sport-specific serve-guide overrides — mirrors `computeServeGuideSnapshotByPlugin` in FE registry.
enum ServeGuideSportRules {
    static func pickleballCourtSide(serverScore: Int) -> CourtServeSide {
        serverScore % 2 == 0 ? .rightDeuce : .leftAd
    }

    static func pickleballChangeEnds(teamA: Int, teamB: Int, pointsPerGame: Int) -> Bool {
        let intervalAt = pointsPerGame >= 15 ? 8 : 6
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        return maxScore == intervalAt && minScore < intervalAt
    }

    static func pickleballDoublesSlot(serverPlayerIndex: Int) -> TieBreakServeSlot {
        serverPlayerIndex == 0 ? .serveOne : .serveTwo
    }

    static func badmintonCourtSide(serverScore: Int) -> CourtServeSide {
        serverScore % 2 == 0 ? .rightDeuce : .leftAd
    }

    static func badmintonChangeEnds(teamA: Int, teamB: Int, pointsPerGame: Int) -> Bool {
        let intervalAt = pointsPerGame >= 21 ? 11 : pointsPerGame >= 15 ? 8 : 6
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        return maxScore == intervalAt && minScore < intervalAt
    }

    /// PAR: change ends when a player reaches 11, except at 11–10.
    static func squashChangeEnds(teamA: Int, teamB: Int) -> Bool {
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        return maxScore == 11 && minScore < 10
    }
}
