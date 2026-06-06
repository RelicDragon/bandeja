import Foundation

/// Sport-specific serve-guide overrides — mirrors `computeServeGuideSnapshotByPlugin` in FE registry.
enum ServeGuideSportRules {
    static func pickleballMidpointScore(pointsPerGame: Int) -> Int {
        if pointsPerGame >= 21 { return 11 }
        if pointsPerGame >= 15 { return 8 }
        return 6
    }

    static func pickleballCourtSide(serverScore: Int) -> CourtServeSide {
        serverScore % 2 == 0 ? .rightDeuce : .leftAd
    }

    static func pickleballChangeEnds(
        teamA: Int,
        teamB: Int,
        pointsPerGame: Int,
        isDecidingGame: Bool,
        activeSetIndex: Int,
        totalPointsInGame: Int
    ) -> Bool {
        if totalPointsInGame == 0 && activeSetIndex > 0 { return true }
        if !isDecidingGame { return false }
        let intervalAt = pickleballMidpointScore(pointsPerGame: pointsPerGame)
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        return maxScore == intervalAt && minScore < intervalAt
    }

    static func pickleballMidGameEndsSwapped(
        teamA: Int,
        teamB: Int,
        pointsPerGame: Int,
        isDecidingGame: Bool
    ) -> Bool {
        if !isDecidingGame { return false }
        let intervalAt = pickleballMidpointScore(pointsPerGame: pointsPerGame)
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        if maxScore < intervalAt { return false }
        if maxScore == intervalAt && minScore >= intervalAt { return false }
        return true
    }

    static func pickleballCourtEndsSwapped(
        matchStartCourtEndsSwapped: Bool,
        activeSetIndex: Int,
        teamA: Int,
        teamB: Int,
        pointsPerGame: Int,
        isDecidingGame: Bool
    ) -> Bool {
        let betweenGameFlips = activeSetIndex % 2 == 1
        let midGameFlip = pickleballMidGameEndsSwapped(
            teamA: teamA,
            teamB: teamB,
            pointsPerGame: pointsPerGame,
            isDecidingGame: isDecidingGame
        )
        let flips = betweenGameFlips != midGameFlip
        return matchStartCourtEndsSwapped != flips
    }

    static func pickleballNextServerTeam(
        pointWinnerLog: [TeamSide],
        firstForSet: TeamSide
    ) -> TeamSide {
        pointWinnerLog.last ?? firstForSet
    }

    static func pickleballDoublesPlayerIndex(
        pointWinnerLog: [TeamSide],
        firstForSet: TeamSide,
        matchFirst: TeamSide,
        matchFirstPlayerIdx: Int,
        teamA: Int,
        teamB: Int
    ) -> Int {
        let serverTeam = pointWinnerLog.last ?? firstForSet
        let teamScore = serverTeam == .teamA ? teamA : teamB
        if pointWinnerLog.isEmpty {
            return pickleballSideOutServerIndex(
                serverTeam: serverTeam,
                teamScore: teamScore,
                matchFirst: matchFirst,
                matchFirstPlayerIdx: matchFirstPlayerIdx
            )
        }
        var a = 0
        var b = 0
        var currentServer = firstForSet
        var serverIdx = pickleballSideOutServerIndex(
            serverTeam: firstForSet,
            teamScore: 0,
            matchFirst: matchFirst,
            matchFirstPlayerIdx: matchFirstPlayerIdx
        )
        for winner in pointWinnerLog {
            if winner == .teamA { a += 1 } else { b += 1 }
            if winner == currentServer { continue }
            currentServer = winner
            let score = currentServer == .teamA ? a : b
            serverIdx = pickleballSideOutServerIndex(
                serverTeam: currentServer,
                teamScore: score,
                matchFirst: matchFirst,
                matchFirstPlayerIdx: matchFirstPlayerIdx
            )
        }
        return serverIdx
    }

    private static func pickleballSideOutServerIndex(
        serverTeam: TeamSide,
        teamScore: Int,
        matchFirst: TeamSide,
        matchFirstPlayerIdx: Int
    ) -> Int {
        let serveRight = teamScore % 2 == 0
        if serveRight {
            if serverTeam == matchFirst && teamScore == 0 { return matchFirstPlayerIdx }
            return 0
        }
        return 1
    }

    static func badmintonCourtSide(serverScore: Int) -> CourtServeSide {
        serverScore % 2 == 0 ? .rightDeuce : .leftAd
    }

    static func badmintonChangeEnds(teamA: Int, teamB: Int, pointsPerGame: Int) -> Bool {
        let intervalAt = pointsPerGame >= 21 ? 11 : pointsPerGame >= 15 ? 8 : 6
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        return maxScore == intervalAt && minScore < intervalAt - 1
    }

    static func badmintonMidGameEndsSwapped(teamA: Int, teamB: Int, pointsPerGame: Int) -> Bool {
        let intervalAt = pointsPerGame >= 21 ? 11 : pointsPerGame >= 15 ? 8 : 6
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        if maxScore < intervalAt { return false }
        if maxScore == intervalAt && minScore >= intervalAt - 1 { return false }
        return true
    }

    static func badmintonCourtEndsSwapped(
        matchStartCourtEndsSwapped: Bool,
        activeSetIndex: Int,
        teamA: Int,
        teamB: Int,
        pointsPerGame: Int
    ) -> Bool {
        let betweenGameFlips = activeSetIndex % 2 == 1
        let midGameFlip = badmintonMidGameEndsSwapped(teamA: teamA, teamB: teamB, pointsPerGame: pointsPerGame)
        let flips = betweenGameFlips != midGameFlip
        return matchStartCourtEndsSwapped != flips
    }

    static func badmintonNextServerTeam(
        pointWinnerLog: [TeamSide],
        firstForSet: TeamSide
    ) -> TeamSide {
        pointWinnerLog.last ?? firstForSet
    }

    private enum BdServiceCourt { case left, right }

    private struct BdTeamCourts {
        var p0: BdServiceCourt
        var p1: BdServiceCourt
    }

    private static func badmintonInitialTeamCourts(isFirstServerTeam: Bool, firstPlayerIdx: Int) -> BdTeamCourts {
        if isFirstServerTeam {
            return BdTeamCourts(
                p0: firstPlayerIdx == 0 ? .right : .left,
                p1: firstPlayerIdx == 1 ? .right : .left
            )
        }
        return BdTeamCourts(p0: .right, p1: .left)
    }

    private static func badmintonSwapTeamCourts(_ c: BdTeamCourts) -> BdTeamCourts {
        BdTeamCourts(p0: c.p1, p1: c.p0)
    }

    private static func badmintonServerIdxForScore(_ c: BdTeamCourts, teamScore: Int) -> Int {
        let need: BdServiceCourt = teamScore % 2 == 0 ? .right : .left
        if c.p0 == need { return 0 }
        if c.p1 == need { return 1 }
        return 0
    }

    static func badmintonDoublesPlayerIndex(
        pointWinnerLog: [TeamSide],
        firstForSet: TeamSide,
        matchFirst: TeamSide,
        matchFirstPlayerIdx: Int
    ) -> Int {
        var teamACourts = badmintonInitialTeamCourts(
            isFirstServerTeam: matchFirst == .teamA,
            firstPlayerIdx: matchFirst == .teamA ? matchFirstPlayerIdx : 0
        )
        var teamBCourts = badmintonInitialTeamCourts(
            isFirstServerTeam: matchFirst == .teamB,
            firstPlayerIdx: matchFirst == .teamB ? matchFirstPlayerIdx : 0
        )

        func courts(_ team: TeamSide) -> BdTeamCourts {
            team == .teamA ? teamACourts : teamBCourts
        }
        func setCourts(_ team: TeamSide, _ c: BdTeamCourts) {
            if team == .teamA { teamACourts = c } else { teamBCourts = c }
        }

        var a = 0
        var b = 0
        var serverTeam = firstForSet
        var serverIdx = badmintonServerIdxForScore(courts(serverTeam), 0)

        for winner in pointWinnerLog {
            if winner == .teamA { a += 1 } else { b += 1 }
            if winner == serverTeam {
                setCourts(serverTeam, badmintonSwapTeamCourts(courts(serverTeam)))
            } else {
                serverTeam = winner
                let score = serverTeam == .teamA ? a : b
                serverIdx = badmintonServerIdxForScore(courts(serverTeam), score)
            }
        }
        return serverIdx
    }

    /// WSF PAR: even server score → right service box, odd → left.
    static func squashCourtSide(serverScore: Int) -> CourtServeSide {
        serverScore % 2 == 0 ? .rightDeuce : .leftAd
    }

    /// PAR: change ends when a player reaches 11, except at 11–10.
    static func squashChangeEnds(teamA: Int, teamB: Int) -> Bool {
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        return maxScore == 11 && minScore < 10
    }

    static func squashMidGameEndsSwapped(teamA: Int, teamB: Int) -> Bool {
        let maxScore = max(teamA, teamB)
        let minScore = min(teamA, teamB)
        if maxScore < 11 { return false }
        if maxScore == 11 && minScore >= 10 { return false }
        return true
    }

    static func squashCourtEndsSwapped(
        matchStartCourtEndsSwapped: Bool,
        activeSetIndex: Int,
        teamA: Int,
        teamB: Int
    ) -> Bool {
        let betweenGameFlips = activeSetIndex % 2 == 1
        let midGameFlip = squashMidGameEndsSwapped(teamA: teamA, teamB: teamB)
        let flips = betweenGameFlips != midGameFlip
        return matchStartCourtEndsSwapped != flips
    }

    /// ITTF: after each game; once at 5 points in the deciding game only.
    static func tableTennisChangeEnds(pointIndex: Int, activeSetIndex: Int, isDecidingGame: Bool) -> Bool {
        if pointIndex == 0 && activeSetIndex > 0 { return true }
        return isDecidingGame && pointIndex == 5
    }

    static func tableTennisCourtEndsSwapped(
        matchStartCourtEndsSwapped: Bool,
        activeSetIndex: Int,
        pointIndex: Int,
        isDecidingGame: Bool
    ) -> Bool {
        let betweenGameFlips = activeSetIndex % 2 == 1
        let midDeciderFlip = isDecidingGame && pointIndex >= 5
        let flips = betweenGameFlips != midDeciderFlip
        return matchStartCourtEndsSwapped != flips
    }

    static func tableTennisIsDecidingGame(
        fixedNumberOfSets: Int,
        gamesWonA: Int,
        gamesWonB: Int
    ) -> Bool {
        if fixedNumberOfSets <= 1 { return true }
        return gamesWonA == gamesWonB && gamesWonA > 0
    }

    static func tableTennisGamesWonBeforeActive(
        activeSetIndex: Int,
        sets: [WatchSetWrite],
        pointsPerGame: Int,
        winBy: Int
    ) -> (teamA: Int, teamB: Int) {
        var teamA = 0
        var teamB = 0
        guard activeSetIndex > 0 else { return (0, 0) }
        for i in 0..<activeSetIndex {
            guard i < sets.count else { break }
            let row = sets[i]
            if row.resolvedRole != .official || row.isTieBreak { continue }
            let a = row.teamA
            let b = row.teamB
            let leader = max(a, b)
            let trailer = min(a, b)
            if leader < pointsPerGame || leader - trailer < winBy { continue }
            if a > b { teamA += 1 }
            else if b > a { teamB += 1 }
        }
        return (teamA, teamB)
    }
}
