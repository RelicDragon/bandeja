import Foundation

struct ServeGuideInputs: Sendable, Equatable {
    var matchFirstServerTeam: TeamSide?
    var matchFirstDoublesPlayerIndex: Int?
    var seedSkipped: Bool
    var hiddenForMatch: Bool
    var hintsMode: WatchServeHintsMode

    var usesTennisSetRules: Bool
    var isAmericano: Bool
    var isReadOnly: Bool

    var activeSetIndex: Int
    var sets: [WatchSetWrite]
    var activeSetIsSupplemental: Bool
    var activeSetIsSuperTieBreak: Bool
    var withinSetTieBreakMode: Bool
    var tieBreakA: Int
    var tieBreakB: Int

    var classicPointsPlayedInGame: Int

    var teamAPlayerNames: [String]
    var teamBPlayerNames: [String]

    var pendingSetFormatChoice: Bool

    /// `official` | `simple`; nil = official.
    var pointsServeRotation: String?
}

enum ServeGuideEngine {
    static func compute(_ i: ServeGuideInputs) -> ServeGuideSnapshot? {
        if i.isReadOnly || i.seedSkipped || i.hiddenForMatch { return nil }
        if i.hintsMode == .off { return nil }
        if i.pendingSetFormatChoice { return nil }
        if i.activeSetIsSupplemental { return nil }
        guard let first = i.matchFirstServerTeam else { return nil }

        let simple = i.pointsServeRotation == "simple"

        if i.isAmericano {
            return simple ? simplePointsStrip(i, matchFirst: first) : pointsCapStrip(i, matchFirst: first)
        }
        if !i.usesTennisSetRules { return nil }

        if i.activeSetIsSuperTieBreak {
            return simple ? simplePointsStrip(i, matchFirst: first) : superTieBreakStrip(i, matchFirst: first)
        }
        if i.withinSetTieBreakMode {
            return withinTieBreakStrip(i, matchFirst: first, gamesAtSixAll: gaPlusGbAtTieBreakEntry(i))
        }
        return classicGameStrip(i, matchFirst: first)
    }

    static func firstServerForPointsSet(
        setIndex: Int,
        sets: [WatchSetWrite],
        matchFirstServer: TeamSide
    ) -> TeamSide {
        if setIndex <= 0 { return matchFirstServer }
        var j = setIndex - 1
        while j >= 0 {
            let row = sets[safe: j]
            if row?.resolvedRole != .official {
                j -= 1
                continue
            }
            let ta = row?.teamA ?? 0
            let tb = row?.teamB ?? 0
            let total = ta + tb
            if total > 0 {
                let prevFirst = firstServerForPointsSet(setIndex: j, sets: sets, matchFirstServer: matchFirstServer)
                let lastServer = tbNextServerTeam(firstTBTeam: prevFirst, pointIndex: total - 1)
                return otherTeam(lastServer)
            }
            j -= 1
        }
        return matchFirstServer
    }

    private static func pointsCapStrip(_ i: ServeGuideInputs, matchFirst: TeamSide) -> ServeGuideSnapshot? {
        let set = i.sets[safe: i.activeSetIndex]
        let ta = set?.teamA ?? 0
        let tb = set?.teamB ?? 0
        let t = ta + tb
        let firstForSet = firstServerForPointsSet(setIndex: i.activeSetIndex, sets: i.sets, matchFirstServer: matchFirst)
        let nextTeam = tbNextServerTeam(firstTBTeam: firstForSet, pointIndex: t)
        let doubles = (nextTeam == .teamA ? i.teamAPlayerNames.count : i.teamBPlayerNames.count) >= 2
        let playerIdx = tbDoublesPlayerIndex(
            matchFirst: matchFirst,
            matchFirstPlayerIdx: i.matchFirstDoublesPlayerIndex ?? 0,
            nextServingTeam: nextTeam,
            pointIndex: t,
            gamesCompletedBeforeTB: 0
        )
        let names = nextTeam == .teamA ? i.teamAPlayerNames : i.teamBPlayerNames
        let display = doubles ? playerDisplay(names: names, index: playerIdx) : (names.first ?? "—")
        let slot = tieBreakServeSlotAtPoint(t)
        let side = courtSideForTieBreakPoint(t)
        let changeEnds = t > 0 && t % 6 == 0
        let slotWord = slot == .serveOne ? "Serve 1" : "Serve 2"
        let token = "pts-\(t)-\(nextTeam.rawValue)-\(playerIdx)-\(i.activeSetIndex)"
        return ServeGuideSnapshot(
            serverTeam: nextTeam,
            serverPlayerIndex: playerIdx,
            serverDisplayName: display,
            serverInitial: String(display.prefix(1)).uppercased(),
            courtSide: side,
            tieBreakServeSlot: slot,
            changeEndsBeforeNextPoint: changeEnds,
            accessibilityLine: "\(display), \(slotWord), \(side == .rightDeuce ? "right" : "left")",
            motionToken: token
        )
    }

    private static func changeEndsBeforeNextPointClassic(_ i: ServeGuideInputs, segmentPointCount: Int = 0) -> Bool {
        if segmentPointCount > 0 {
            return segmentPointCount > 0 && segmentPointCount % 6 == 0
        }
        if i.classicPointsPlayedInGame > 0 || i.withinSetTieBreakMode { return false }
        guard let set = i.sets[safe: i.activeSetIndex], set.resolvedRole == .official, !set.isTieBreak else {
            return false
        }
        let completedGames = set.teamA + set.teamB
        if completedGames > 0, completedGames % 2 == 1 { return true }
        if completedGames == 0, i.activeSetIndex > 0 {
            let prev = i.sets[safe: i.activeSetIndex - 1]
            if let prev, prev.resolvedRole == .official, !prev.isTieBreak {
                let prevTotal = prev.teamA + prev.teamB
                return prevTotal > 0 && prevTotal % 2 == 0
            }
        }
        return false
    }

    private static func classicGameStrip(_ i: ServeGuideInputs, matchFirst: TeamSide) -> ServeGuideSnapshot? {
        let set = i.sets[safe: i.activeSetIndex]
        let ga = set?.teamA ?? 0
        let gb = set?.teamB ?? 0
        let firstForSet = firstServerTeamForSet(
            setIndex: i.activeSetIndex,
            sets: i.sets,
            matchFirstServer: matchFirst
        )
        let completedGames = ga + gb
        let servingTeam = servingTeamForGame(firstServerInSet: firstForSet, completedGamesBeforeThisGame: completedGames)
        let playerIdx = doublesPlayerIndex(
            matchFirst: matchFirst,
            matchFirstPlayerIdx: i.matchFirstDoublesPlayerIndex ?? 0,
            servingTeam: servingTeam,
            completedGamesInSet: completedGames
        )
        let names = servingTeam == .teamA ? i.teamAPlayerNames : i.teamBPlayerNames
        let display = playerDisplay(names: names, index: playerIdx)
        let side: CourtServeSide = (i.classicPointsPlayedInGame % 2 == 0) ? .rightDeuce : .leftAd
        let a11y = "\(display), \(side == .rightDeuce ? "right" : "left")"
        let token = "\(servingTeam.rawValue)-\(playerIdx)-\(i.classicPointsPlayedInGame)-\(ga)-\(gb)"
        return ServeGuideSnapshot(
            serverTeam: servingTeam,
            serverPlayerIndex: playerIdx,
            serverDisplayName: display,
            serverInitial: String(display.prefix(1)).uppercased(),
            courtSide: side,
            tieBreakServeSlot: nil,
            changeEndsBeforeNextPoint: changeEndsBeforeNextPointClassic(i),
            accessibilityLine: a11y,
            motionToken: token
        )
    }

    private static func withinTieBreakStrip(_ i: ServeGuideInputs, matchFirst: TeamSide, gamesAtSixAll: Int) -> ServeGuideSnapshot? {
        let set = i.sets[safe: i.activeSetIndex]
        let ga = set?.teamA ?? 0
        let gb = set?.teamB ?? 0
        let firstForSet = firstServerTeamForSet(
            setIndex: i.activeSetIndex,
            sets: i.sets,
            matchFirstServer: matchFirst
        )
        let completedGames = ga + gb
        let firstTBTeam = servingTeamForGame(firstServerInSet: firstForSet, completedGamesBeforeThisGame: completedGames)
        let t = i.tieBreakA + i.tieBreakB
        let nextTeam = tbNextServerTeam(firstTBTeam: firstTBTeam, pointIndex: t)
        let doubles = (nextTeam == .teamA ? i.teamAPlayerNames.count : i.teamBPlayerNames.count) >= 2
        let playerIdx = tbDoublesPlayerIndex(
            matchFirst: matchFirst,
            matchFirstPlayerIdx: i.matchFirstDoublesPlayerIndex ?? 0,
            nextServingTeam: nextTeam,
            pointIndex: t,
            gamesCompletedBeforeTB: gamesAtSixAll
        )
        let names = nextTeam == .teamA ? i.teamAPlayerNames : i.teamBPlayerNames
        let display = doubles ? playerDisplay(names: names, index: playerIdx) : (names.first ?? "—")
        let slot = tieBreakServeSlotAtPoint(t)
        let side = courtSideForTieBreakPoint(t)
        let changeEnds = changeEndsBeforeNextPointClassic(i, segmentPointCount: t)
        let slotWord = slot == .serveOne ? "Serve 1" : "Serve 2"
        let a11y = "\(display), \(slotWord), \(side == .rightDeuce ? "right" : "left")"
        let token = "wtb-\(t)-\(nextTeam.rawValue)-\(playerIdx)"
        return ServeGuideSnapshot(
            serverTeam: nextTeam,
            serverPlayerIndex: playerIdx,
            serverDisplayName: display,
            serverInitial: String(display.prefix(1)).uppercased(),
            courtSide: side,
            tieBreakServeSlot: slot,
            changeEndsBeforeNextPoint: changeEnds,
            accessibilityLine: a11y,
            motionToken: token
        )
    }

    private static func superTieBreakStrip(_ i: ServeGuideInputs, matchFirst: TeamSide) -> ServeGuideSnapshot? {
        let set = i.sets[safe: i.activeSetIndex]
        let ta = set?.teamA ?? 0
        let tb = set?.teamB ?? 0
        let firstForSet = firstServerTeamForSet(
            setIndex: i.activeSetIndex,
            sets: i.sets,
            matchFirstServer: matchFirst
        )
        let firstTBTeam = firstForSet
        let t = ta + tb
        let nextTeam = tbNextServerTeam(firstTBTeam: firstTBTeam, pointIndex: t)
        let doubles = (nextTeam == .teamA ? i.teamAPlayerNames.count : i.teamBPlayerNames.count) >= 2
        let playerIdx = tbDoublesPlayerIndex(
            matchFirst: matchFirst,
            matchFirstPlayerIdx: i.matchFirstDoublesPlayerIndex ?? 0,
            nextServingTeam: nextTeam,
            pointIndex: t,
            gamesCompletedBeforeTB: 0
        )
        let names = nextTeam == .teamA ? i.teamAPlayerNames : i.teamBPlayerNames
        let display = doubles ? playerDisplay(names: names, index: playerIdx) : (names.first ?? "—")
        let slot = tieBreakServeSlotAtPoint(t)
        let side = courtSideForTieBreakPoint(t)
        let changeEnds = changeEndsBeforeNextPointClassic(i, segmentPointCount: t)
        let slotWord = slot == .serveOne ? "Serve 1" : "Serve 2"
        let token = "stb-\(t)-\(nextTeam.rawValue)"
        return ServeGuideSnapshot(
            serverTeam: nextTeam,
            serverPlayerIndex: playerIdx,
            serverDisplayName: display,
            serverInitial: String(display.prefix(1)).uppercased(),
            courtSide: side,
            tieBreakServeSlot: slot,
            changeEndsBeforeNextPoint: changeEnds,
            accessibilityLine: "\(display), \(slotWord), \(side == .rightDeuce ? "right" : "left")",
            motionToken: token
        )
    }

    private static func simplePointsStrip(_ i: ServeGuideInputs, matchFirst: TeamSide) -> ServeGuideSnapshot? {
        let set = i.sets[safe: i.activeSetIndex]
        let ta = set?.teamA ?? 0
        let tb = set?.teamB ?? 0
        let t = ta + tb
        let doubles = i.teamAPlayerNames.count >= 2 || i.teamBPlayerNames.count >= 2
        let firstForSet: TeamSide
        if i.isAmericano {
            firstForSet = firstServerForPointsSetSimple(
                setIndex: i.activeSetIndex,
                sets: i.sets,
                matchFirstServer: matchFirst,
                doubles: doubles
            )
        } else {
            firstForSet = firstServerTeamForSet(setIndex: i.activeSetIndex, sets: i.sets, matchFirstServer: matchFirst)
        }
        let nextTeam = simpleTeamServingAtPoint(firstForSet: firstForSet, pointIndex: t, doubles: doubles)
        let names = nextTeam == .teamA ? i.teamAPlayerNames : i.teamBPlayerNames
        let playerIdx = simpleDoublesPlayerIndex(
            matchFirst: matchFirst,
            matchFirstPlayerIdx: i.matchFirstDoublesPlayerIndex ?? 0,
            servingTeam: nextTeam,
            pointIndex: t,
            doubles: doubles
        )
        let display = doubles ? playerDisplay(names: names, index: playerIdx) : (names.first ?? "—")
        let side: CourtServeSide = (t % 2 == 0) ? .rightDeuce : .leftAd
        let a11y = "\(display), \(side == .rightDeuce ? "right" : "left")"
        let token = "pts-simple-\(t)-\(nextTeam.rawValue)-\(playerIdx)-\(i.activeSetIndex)"
        return ServeGuideSnapshot(
            serverTeam: nextTeam,
            serverPlayerIndex: playerIdx,
            serverDisplayName: display,
            serverInitial: String(display.prefix(1)).uppercased(),
            courtSide: side,
            tieBreakServeSlot: nil,
            changeEndsBeforeNextPoint: false,
            accessibilityLine: a11y,
            motionToken: token
        )
    }

    private static func simpleTeamServingAtPoint(firstForSet: TeamSide, pointIndex: Int, doubles: Bool) -> TeamSide {
        let cycle = doubles ? 4 : 2
        let block = (pointIndex / cycle) % 2
        return block == 0 ? firstForSet : otherTeam(firstForSet)
    }

    private static func simpleDoublesPlayerIndex(
        matchFirst: TeamSide,
        matchFirstPlayerIdx: Int,
        servingTeam: TeamSide,
        pointIndex: Int,
        doubles: Bool
    ) -> Int {
        guard doubles else { return 0 }
        let posInCycle = pointIndex % 4
        let playerSlot = posInCycle / 2
        if servingTeam == matchFirst {
            return (matchFirstPlayerIdx + playerSlot) % 2
        }
        return playerSlot % 2
    }

    static func firstServerForPointsSetSimple(
        setIndex: Int,
        sets: [WatchSetWrite],
        matchFirstServer: TeamSide,
        doubles: Bool
    ) -> TeamSide {
        if setIndex <= 0 { return matchFirstServer }
        var j = setIndex - 1
        while j >= 0 {
            let row = sets[safe: j]
            if row?.resolvedRole != .official {
                j -= 1
                continue
            }
            let total = (row?.teamA ?? 0) + (row?.teamB ?? 0)
            if total > 0 {
                let prevFirst = firstServerForPointsSetSimple(
                    setIndex: j,
                    sets: sets,
                    matchFirstServer: matchFirstServer,
                    doubles: doubles
                )
                return simpleTeamServingAtPoint(firstForSet: prevFirst, pointIndex: total, doubles: doubles)
            }
            j -= 1
        }
        return matchFirstServer
    }

    static func otherTeam(_ t: TeamSide) -> TeamSide {
        t == .teamA ? .teamB : .teamA
    }

    static func firstServerTeamForSet(
        setIndex: Int,
        sets: [WatchSetWrite],
        matchFirstServer: TeamSide
    ) -> TeamSide {
        if setIndex <= 0 { return matchFirstServer }
        var j = setIndex - 1
        while j >= 0 {
            let row = sets[safe: j]
            guard let row, row.resolvedRole == .official else {
                j -= 1
                continue
            }
            let total = row.teamA + row.teamB
            if total > 0 {
                let prevFirst = firstServerTeamForSet(setIndex: j, sets: sets, matchFirstServer: matchFirstServer)
                let lastServer: TeamSide
                if row.isTieBreak {
                    lastServer = tbNextServerTeam(firstTBTeam: prevFirst, pointIndex: total - 1)
                } else {
                    lastServer = servingTeamForGame(firstServerInSet: prevFirst, completedGamesBeforeThisGame: total - 1)
                }
                return otherTeam(lastServer)
            }
            j -= 1
        }
        return matchFirstServer
    }

    /// `completedGamesBeforeThisGame` = teamA + teamB while playing that game (games already finished in set).
    static func servingTeamForGame(firstServerInSet: TeamSide, completedGamesBeforeThisGame: Int) -> TeamSide {
        completedGamesBeforeThisGame % 2 == 0 ? firstServerInSet : otherTeam(firstServerInSet)
    }

    static func tbNextServerTeam(firstTBTeam: TeamSide, pointIndex: Int) -> TeamSide {
        if pointIndex == 0 { return firstTBTeam }
        let seg = (pointIndex - 1) / 2
        return seg % 2 == 0 ? otherTeam(firstTBTeam) : firstTBTeam
    }

    static func tieBreakServeSlotAtPoint(_ pointIndex: Int) -> TieBreakServeSlot {
        if pointIndex == 0 { return .serveOne }
        return ((pointIndex - 1) % 2 == 0) ? .serveOne : .serveTwo
    }

    static func courtSideForTieBreakPoint(_ pointIndex: Int) -> CourtServeSide {
        pointIndex % 2 == 0 ? .rightDeuce : .leftAd
    }

    static func doublesPlayerIndex(
        matchFirst: TeamSide,
        matchFirstPlayerIdx: Int,
        servingTeam: TeamSide,
        completedGamesInSet: Int
    ) -> Int {
        if servingTeam == matchFirst {
            let nth = completedGamesInSet / 2
            return (matchFirstPlayerIdx + nth) % 2
        }
        let nth = (completedGamesInSet - 1) / 2
        return nth % 2
    }

    /// Tie-break doubles: roster order slot 0 labels the team’s sequence; rotation across long TBs is assistive only.
    static func tbDoublesPlayerIndex(
        matchFirst: TeamSide,
        matchFirstPlayerIdx: Int,
        nextServingTeam: TeamSide,
        pointIndex: Int,
        gamesCompletedBeforeTB: Int
    ) -> Int {
        let base = doublesPlayerIndex(
            matchFirst: matchFirst,
            matchFirstPlayerIdx: matchFirstPlayerIdx,
            servingTeam: nextServingTeam,
            completedGamesInSet: max(0, gamesCompletedBeforeTB)
        )
        if pointIndex <= 1 { return base }
        let turn = (pointIndex - 1) / 2
        return (base + turn) % 2
    }

    private static func gaPlusGbAtTieBreakEntry(_ i: ServeGuideInputs) -> Int {
        let set = i.sets[safe: i.activeSetIndex]
        return (set?.teamA ?? 0) + (set?.teamB ?? 0)
    }

    private static func playerDisplay(names: [String], index: Int) -> String {
        guard !names.isEmpty else { return "—" }
        return names[safe: index] ?? names[0]
    }

}
