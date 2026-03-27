import Foundation
import Observation

@Observable
@MainActor
final class MatchScoringViewModel {
    let gameId: String
    let matchId: String
    var game: WatchGame?
    var round: WatchRound?
    var match: WatchMatch?
    var sets: [WatchSetWrite] = []
    var activeSetIndex = 0
    var isLoading = false
    var isSaving = false
    var error: Error?
    var isReadOnly = false

    var classicPointState: PadelPointState = .regular(a: .zero, b: .zero)
    var tieBreakA = 0
    var tieBreakB = 0
    var isTieBreakMode = false

    private let api = APIClient()

    init(gameId: String, matchId: String) {
        self.gameId = gameId
        self.matchId = matchId
    }

    var isAmericano: Bool {
        guard let game else { return false }
        return (game.fixedNumberOfSets ?? 0) == 1 && (game.maxTotalPointsPerSet ?? 0) > 0
    }

    var fixedNumberOfSets: Int {
        let n = game?.fixedNumberOfSets ?? 0
        return max(n, 1)
    }

    var maxPointsPerSet: Int {
        game?.maxTotalPointsPerSet ?? 0
    }

    var maxGamesPerSet: Int {
        max(game?.maxPointsPerTeam ?? 6, 1)
    }

    var teamAUsers: [WatchUser] {
        match?.sortedTeams.first { $0.teamNumber == 1 }?.players.map(\.user) ?? []
    }

    var teamBUsers: [WatchUser] {
        match?.sortedTeams.first { $0.teamNumber == 2 }?.players.map(\.user) ?? []
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            game = try await api.fetch(.gameDetail(id: gameId))
            let results: WatchResultsGame = try await api.fetch(.gameResults(gameId: gameId))
            let currentUserId = KeychainHelper.shared.readUserId()
            let myMatches = results.rounds
                .sorted { $0.roundNumber < $1.roundNumber }
                .flatMap { round in
                    round.matches
                        .sorted { $0.matchNumber < $1.matchNumber }
                        .filter { match in
                            guard let currentUserId else { return false }
                            return match.teams.contains { team in
                                team.players.contains { $0.userId == currentUserId }
                            }
                        }
                }
            let latestEditableId = myMatches.last(where: { !isCompletedForGate($0) })?.id
            for r in results.rounds {
                if let m = r.matches.first(where: { $0.id == matchId }) {
                    round = r
                    match = m
                    isReadOnly = (game?.resultsStatus == "FINAL") || (latestEditableId != nil && latestEditableId != matchId)
                    sets = m.sets.sorted { $0.setNumber < $1.setNumber }.map {
                        WatchSetWrite(teamA: $0.teamAScore, teamB: $0.teamBScore, isTieBreak: $0.isTieBreak)
                    }
                    if sets.isEmpty { sets = [WatchSetWrite(teamA: 0, teamB: 0)] }
                    activeSetIndex = max(0, min(sets.count - 1, nextEditableSetIndex()))
                    return
                }
            }
            throw APIError.httpError(404)
        } catch {
            self.error = error
        }
    }

    func ensureSetExists(_ index: Int) {
        while sets.count <= index {
            sets.append(WatchSetWrite(teamA: 0, teamB: 0))
        }
    }

    func saveCurrentSets() async {
        guard !isReadOnly else { return }
        guard let match else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let sortedTeams = match.sortedTeams
            let teamAIds = sortedTeams.first(where: { $0.teamNumber == 1 })?.players.map(\.userId) ?? []
            let teamBIds = sortedTeams.first(where: { $0.teamNumber == 2 })?.players.map(\.userId) ?? []
            let body = WatchUpdateMatchBody(
                teamA: teamAIds,
                teamB: teamBIds,
                sets: sets
            )
            try await api.sendVoid(.updateMatch(gameId: gameId, matchId: match.id), body: body)
            WatchSessionManager.shared.notifyScoreUpdated(gameId: gameId)
        } catch {
            self.error = error
        }
    }

    func incrementAmericanoTeamA() {
        guard !isReadOnly else { return }
        guard isAmericano, activeSetIndex < sets.count else { return }
        let maxTotal = maxPointsPerSet
        guard maxTotal > 0 else { return }
        sets[activeSetIndex].teamA = min(maxTotal, sets[activeSetIndex].teamA + 1)
        sets[activeSetIndex].teamB = maxTotal - sets[activeSetIndex].teamA
    }

    func decrementAmericanoTeamA() {
        guard !isReadOnly else { return }
        guard isAmericano, activeSetIndex < sets.count else { return }
        let maxTotal = maxPointsPerSet
        guard maxTotal > 0 else { return }
        sets[activeSetIndex].teamA = max(0, sets[activeSetIndex].teamA - 1)
        sets[activeSetIndex].teamB = maxTotal - sets[activeSetIndex].teamA
    }

    func canUnscore(_ side: TeamSide) -> Bool {
        guard !isReadOnly, !isAmericano else { return false }
        if isTieBreakMode {
            if side == .teamA, tieBreakA > 0 { return true }
            if side == .teamB, tieBreakB > 0 { return true }
            if tieBreakA == 0, tieBreakB == 0 {
                let s = sets[safe: activeSetIndex]
                guard let s else { return false }
                return s.teamA == maxGamesPerSet && s.teamB == maxGamesPerSet
                    && (side == .teamA ? s.teamA > 0 : s.teamB > 0)
            }
            return false
        }
        switch classicPointState {
        case .advantage, .deuce:
            return true
        case .regular(let a, let b):
            if side == .teamA {
                if a != .zero { return true }
                return (sets[safe: activeSetIndex]?.teamA ?? 0) > 0
            }
            if b != .zero { return true }
            return (sets[safe: activeSetIndex]?.teamB ?? 0) > 0
        }
    }

    func unscorePoint(_ side: TeamSide) {
        guard !isReadOnly, !isAmericano else { return }
        if isTieBreakMode {
            if side == .teamA, tieBreakA > 0 {
                tieBreakA -= 1
                return
            }
            if side == .teamB, tieBreakB > 0 {
                tieBreakB -= 1
                return
            }
            if tieBreakA == 0, tieBreakB == 0 {
                ensureSetExists(activeSetIndex)
                if side == .teamA, sets[activeSetIndex].teamA == maxGamesPerSet,
                   sets[activeSetIndex].teamB == maxGamesPerSet,
                   sets[activeSetIndex].teamA > 0 {
                    sets[activeSetIndex].teamA -= 1
                    isTieBreakMode = false
                } else if side == .teamB, sets[activeSetIndex].teamA == maxGamesPerSet,
                          sets[activeSetIndex].teamB == maxGamesPerSet,
                          sets[activeSetIndex].teamB > 0 {
                    sets[activeSetIndex].teamB -= 1
                    isTieBreakMode = false
                }
            }
            return
        }

        switch classicPointState {
        case .advantage:
            classicPointState = .deuce
        case .deuce:
            classicPointState = .regular(a: .forty, b: .forty)
        case .regular(let a, let b):
            if side == .teamA {
                if let p = a.previous {
                    classicPointState = .regular(a: p, b: b)
                } else if sets[safe: activeSetIndex]?.teamA ?? 0 > 0 {
                    ensureSetExists(activeSetIndex)
                    sets[activeSetIndex].teamA -= 1
                    classicPointState = .regular(a: .forty, b: .forty)
                }
            } else if let p = b.previous {
                classicPointState = .regular(a: a, b: p)
            } else if sets[safe: activeSetIndex]?.teamB ?? 0 > 0 {
                ensureSetExists(activeSetIndex)
                sets[activeSetIndex].teamB -= 1
                classicPointState = .regular(a: .forty, b: .forty)
            }
        }
    }

    func scorePoint(_ side: TeamSide) {
        guard !isReadOnly else { return }
        if isTieBreakMode {
            if side == .teamA { tieBreakA += 1 } else { tieBreakB += 1 }
            if tieBreakSetCompleted() {
                commitSet(teamA: tieBreakA, teamB: tieBreakB, isTieBreak: true)
            }
            return
        }

        switch classicPointState {
        case .regular(let a, let b):
            if side == .teamA {
                if a == .forty && b != .forty {
                    awardGame(.teamA)
                } else if a == .forty && b == .forty {
                    classicPointState = .deuce
                } else {
                    classicPointState = .regular(a: a.next ?? .forty, b: b)
                }
            } else {
                if b == .forty && a != .forty {
                    awardGame(.teamB)
                } else if a == .forty && b == .forty {
                    classicPointState = .deuce
                } else {
                    classicPointState = .regular(a: a, b: b.next ?? .forty)
                }
            }
        case .deuce:
            classicPointState = .advantage(side)
        case .advantage(let adv):
            if adv == side {
                awardGame(side)
            } else {
                classicPointState = .deuce
            }
        }
    }

    private func awardGame(_ side: TeamSide) {
        ensureSetExists(activeSetIndex)
        if side == .teamA {
            sets[activeSetIndex].teamA += 1
        } else {
            sets[activeSetIndex].teamB += 1
        }
        classicPointState = .regular(a: .zero, b: .zero)
        if sets[activeSetIndex].teamA == maxGamesPerSet && sets[activeSetIndex].teamB == maxGamesPerSet {
            isTieBreakMode = true
            tieBreakA = 0
            tieBreakB = 0
            return
        }
        if setCompleted(teamA: sets[activeSetIndex].teamA, teamB: sets[activeSetIndex].teamB) {
            commitSet(teamA: sets[activeSetIndex].teamA, teamB: sets[activeSetIndex].teamB, isTieBreak: false)
        }
    }

    private func commitSet(teamA: Int, teamB: Int, isTieBreak: Bool) {
        ensureSetExists(activeSetIndex)
        sets[activeSetIndex].teamA = teamA
        sets[activeSetIndex].teamB = teamB
        sets[activeSetIndex].isTieBreak = isTieBreak
        isTieBreakMode = false
    }

    private func tieBreakSetCompleted() -> Bool {
        let winner = max(tieBreakA, tieBreakB)
        let loser = min(tieBreakA, tieBreakB)
        return winner >= 7 && (winner - loser) >= 2
    }

    private func setCompleted(teamA: Int, teamB: Int) -> Bool {
        let winner = max(teamA, teamB)
        let loser = min(teamA, teamB)
        return winner >= maxGamesPerSet && (winner - loser) >= 2
    }

    func nextSet() {
        guard !isReadOnly else { return }
        activeSetIndex += 1
        ensureSetExists(activeSetIndex)
        classicPointState = .regular(a: .zero, b: .zero)
        tieBreakA = 0
        tieBreakB = 0
        isTieBreakMode = false
    }

    func canAdvanceToNextSet() -> Bool {
        if isAmericano { return false }
        if fixedNumberOfSets > 0 {
            return activeSetIndex + 1 < fixedNumberOfSets
        }
        return true
    }

    private func nextEditableSetIndex() -> Int {
        for (idx, set) in sets.enumerated() where set.teamA == 0 && set.teamB == 0 {
            return idx
        }
        return max(0, sets.count - 1)
    }

    private func isCompletedForGate(_ match: WatchMatch) -> Bool {
        let scoredSets = match.sets.filter { $0.teamAScore > 0 || $0.teamBScore > 0 }
        guard !scoredSets.isEmpty else { return false }
        if match.winnerId != nil { return true }
        if let fixedSets = game?.fixedNumberOfSets, fixedSets > 0 {
            return scoredSets.count >= fixedSets
        }
        return true
    }
}
