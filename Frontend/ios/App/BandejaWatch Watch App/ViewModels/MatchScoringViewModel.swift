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
    /// 6–6 games: tie-break points until set is stored as 7–6 / 6–7 with isTieBreak false.
    var withinSetTieBreakMode = false
    /// When set, user must pick normal set vs super tie-break before advancing (index = next set).
    var pendingSetFormatChoiceIndex: Int?

    var pendingGameWinConfirmSide: TeamSide?

    private let api = APIClient()

    private static let tennisGamesPerSet = 6

    private var usesTennisSetRules: Bool {
        game?.ballsInGames == true
    }

    private var gamesScoreForTieBreak: Int {
        usesTennisSetRules ? Self.tennisGamesPerSet : max(game?.maxPointsPerTeam ?? Self.tennisGamesPerSet, 1)
    }

    private var withinSetTieBreakTarget: Int {
        let t = game?.maxTotalPointsPerSet ?? 0
        return t > 0 ? t : 7
    }

    private var superTieBreakTarget: Int {
        let t = game?.maxTotalPointsPerSet ?? 0
        return t > 0 ? t : 10
    }

    private var rawFixedNumberOfSets: Int {
        game?.fixedNumberOfSets ?? 0
    }

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

    /// Match-deciding super tie-break set (points only, isTieBreak on row).
    var activeSetIsSuperTieBreak: Bool {
        usesTennisSetRules && (sets[safe: activeSetIndex]?.isTieBreak == true)
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
            for r in results.rounds {
                if let m = r.matches.first(where: { $0.id == matchId }) {
                    round = r
                    match = m
                    let onMatch = currentUserId.map { uid in
                        m.teams.contains { team in
                            team.players.contains { $0.userId == uid }
                        }
                    } ?? false
                    isReadOnly = (game?.resultsStatus == "FINAL") || !onMatch
                    sets = m.sets.sorted { $0.setNumber < $1.setNumber }.map {
                        WatchSetWrite(teamA: $0.teamAScore, teamB: $0.teamBScore, isTieBreak: $0.isTieBreak)
                    }
                    if sets.isEmpty { sets = [WatchSetWrite(teamA: 0, teamB: 0)] }
                    activeSetIndex = max(0, min(sets.count - 1, nextEditableSetIndex()))
                    pendingGameWinConfirmSide = nil
                    pendingSetFormatChoiceIndex = nil
                    tieBreakA = 0
                    tieBreakB = 0
                    syncWithinSetTieBreakForActiveSet()
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
        if activeSetIsSuperTieBreak {
            ensureSetExists(activeSetIndex)
            if side == .teamA { return sets[activeSetIndex].teamA > 0 }
            return sets[activeSetIndex].teamB > 0
        }
        if withinSetTieBreakMode {
            if side == .teamA, tieBreakA > 0 { return true }
            if side == .teamB, tieBreakB > 0 { return true }
            if tieBreakA == 0, tieBreakB == 0 {
                let s = sets[safe: activeSetIndex]
                guard let s else { return false }
                return s.teamA == gamesScoreForTieBreak && s.teamB == gamesScoreForTieBreak
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
        if activeSetIsSuperTieBreak {
            ensureSetExists(activeSetIndex)
            if side == .teamA, sets[activeSetIndex].teamA > 0 {
                sets[activeSetIndex].teamA -= 1
            } else if side == .teamB, sets[activeSetIndex].teamB > 0 {
                sets[activeSetIndex].teamB -= 1
            }
            return
        }
        if withinSetTieBreakMode {
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
                if side == .teamA, sets[activeSetIndex].teamA == gamesScoreForTieBreak,
                   sets[activeSetIndex].teamB == gamesScoreForTieBreak,
                   sets[activeSetIndex].teamA > 0 {
                    sets[activeSetIndex].teamA -= 1
                    withinSetTieBreakMode = false
                } else if side == .teamB, sets[activeSetIndex].teamA == gamesScoreForTieBreak,
                          sets[activeSetIndex].teamB == gamesScoreForTieBreak,
                          sets[activeSetIndex].teamB > 0 {
                    sets[activeSetIndex].teamB -= 1
                    withinSetTieBreakMode = false
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

    func cancelPendingGameWinConfirm() {
        pendingGameWinConfirmSide = nil
    }

    func pendingGameWinAlertMessage(lang: String) -> String {
        guard let side = pendingGameWinConfirmSide else { return "" }
        let users = side == .teamA ? teamAUsers : teamBUsers
        let names = users
            .map { $0.displayName.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " * ")
        let visibleUserCount = users.filter {
            !$0.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }.count
        let balls = game?.ballsInGames == true
        let projA: Int?
        let projB: Int?
        if balls {
            projA = (sets[safe: activeSetIndex]?.teamA ?? 0) + (side == .teamA ? 1 : 0)
            projB = (sets[safe: activeSetIndex]?.teamB ?? 0) + (side == .teamB ? 1 : 0)
        } else {
            projA = nil
            projB = nil
        }
        return WatchCopy.gameWonConfirmFullMessage(
            lang,
            names: names,
            playerCount: visibleUserCount,
            projectedTeamA: projA,
            projectedTeamB: projB,
            ballsInGames: balls
        )
    }

    func confirmPendingGameWin() {
        guard let side = pendingGameWinConfirmSide else { return }
        pendingGameWinConfirmSide = nil
        scorePoint(side, skipGameWinConfirm: true)
    }

    func cancelSetFormatChoice() {
        pendingSetFormatChoiceIndex = nil
    }

    func confirmSetFormatNormal() {
        guard let idx = pendingSetFormatChoiceIndex else { return }
        pendingSetFormatChoiceIndex = nil
        advanceToSet(index: idx, superTieBreak: false)
    }

    func confirmSetFormatSuper() {
        guard let idx = pendingSetFormatChoiceIndex else { return }
        pendingSetFormatChoiceIndex = nil
        advanceToSet(index: idx, superTieBreak: true)
    }

    /// Call from Next Set — may set `pendingSetFormatChoiceIndex` instead of advancing.
    func beginAdvanceToNextSet() {
        guard !isReadOnly else { return }
        guard canAdvanceToNextSet() else { return }
        let next = activeSetIndex + 1
        if shouldOfferSuperTieBreakChoice(nextIndex: next) {
            pendingSetFormatChoiceIndex = next
        } else {
            advanceToSet(index: next, superTieBreak: false)
        }
    }

    private func advanceToSet(index: Int, superTieBreak: Bool) {
        activeSetIndex = index
        ensureSetExists(activeSetIndex)
        let empty = sets[activeSetIndex].teamA == 0 && sets[activeSetIndex].teamB == 0
        if empty {
            sets[activeSetIndex].isTieBreak = superTieBreak
        }
        classicPointState = .regular(a: .zero, b: .zero)
        tieBreakA = 0
        tieBreakB = 0
        syncWithinSetTieBreakForActiveSet()
    }

    /// After load or changing active set: resume 6–6 (or N–N) within-set tie-break scoring.
    private func syncWithinSetTieBreakForActiveSet() {
        withinSetTieBreakMode = false
        if isAmericano { return }
        if activeSetIsSuperTieBreak { return }
        guard let s = sets[safe: activeSetIndex] else { return }
        if s.teamA == gamesScoreForTieBreak && s.teamB == gamesScoreForTieBreak {
            withinSetTieBreakMode = true
            tieBreakA = 0
            tieBreakB = 0
        }
    }

    private func shouldOfferSuperTieBreakChoice(nextIndex: Int) -> Bool {
        guard usesTennisSetRules, !isAmericano else { return false }
        let allowedIndices = [2, 4, 6, 8]
        guard allowedIndices.contains(nextIndex) else { return false }
        guard arePreviousSetsTiedForSuper(nextIndex: nextIndex) else { return false }
        if rawFixedNumberOfSets > 0 {
            return nextIndex == rawFixedNumberOfSets - 1
        }
        // Dynamic formats: only when this set is the last slot in the row list (Bo3 vs Bo5 from API).
        return nextIndex >= sets.count - 1
    }

    private func arePreviousSetsTiedForSuper(nextIndex: Int) -> Bool {
        guard nextIndex >= 2 else { return false }
        var aWins = 0
        var bWins = 0
        for i in 0..<nextIndex {
            guard let s = sets[safe: i] else { continue }
            guard s.teamA > 0 || s.teamB > 0 else { continue }
            guard s.teamA != s.teamB else { continue }
            if s.isTieBreak {
                if s.teamA > s.teamB { aWins += 1 } else { bWins += 1 }
            } else if s.teamA > s.teamB {
                aWins += 1
            } else {
                bWins += 1
            }
        }
        return aWins == bWins && aWins > 0
    }

    private func tapWouldAwardCurrentGame(_ side: TeamSide) -> Bool {
        guard usesTennisSetRules, !withinSetTieBreakMode, !activeSetIsSuperTieBreak, !isAmericano else { return false }
        switch classicPointState {
        case .regular(let a, let b):
            if side == .teamA { return a == .forty && b != .forty }
            return b == .forty && a != .forty
        case .deuce:
            return false
        case .advantage(let adv):
            return adv == side
        }
    }

    func scorePoint(_ side: TeamSide, skipGameWinConfirm: Bool = false) {
        guard !isReadOnly else { return }
        if activeSetIsSuperTieBreak {
            ensureSetExists(activeSetIndex)
            let a = sets[activeSetIndex].teamA
            let b = sets[activeSetIndex].teamB
            guard !superTieBreakPointRaceCompleted(teamA: a, teamB: b) else { return }
            if side == .teamA {
                sets[activeSetIndex].teamA += 1
            } else {
                sets[activeSetIndex].teamB += 1
            }
            return
        }
        if withinSetTieBreakMode {
            if side == .teamA { tieBreakA += 1 } else { tieBreakB += 1 }
            if withinSetTieBreakPointRaceCompleted() {
                finishWithinSetTieBreakAsGames()
            }
            return
        }

        if usesTennisSetRules, !isAmericano, !skipGameWinConfirm, tapWouldAwardCurrentGame(side) {
            pendingGameWinConfirmSide = side
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
        if sets[activeSetIndex].teamA == gamesScoreForTieBreak && sets[activeSetIndex].teamB == gamesScoreForTieBreak {
            withinSetTieBreakMode = true
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
        withinSetTieBreakMode = false
    }

    private func withinSetTieBreakPointRaceCompleted() -> Bool {
        let target = withinSetTieBreakTarget
        let winner = max(tieBreakA, tieBreakB)
        let loser = min(tieBreakA, tieBreakB)
        return winner >= target && (winner - loser) >= 2
    }

    private func finishWithinSetTieBreakAsGames() {
        let n = gamesScoreForTieBreak
        let aWon = tieBreakA > tieBreakB
        tieBreakA = 0
        tieBreakB = 0
        withinSetTieBreakMode = false
        if aWon {
            commitSet(teamA: n + 1, teamB: n, isTieBreak: false)
        } else {
            commitSet(teamA: n, teamB: n + 1, isTieBreak: false)
        }
    }

    private func superTieBreakPointRaceCompleted(teamA: Int, teamB: Int) -> Bool {
        let target = superTieBreakTarget
        let winner = max(teamA, teamB)
        let loser = min(teamA, teamB)
        return winner >= target && (winner - loser) >= 2
    }

    private func setCompleted(teamA: Int, teamB: Int) -> Bool {
        if usesTennisSetRules {
            let hi = max(teamA, teamB)
            let lo = min(teamA, teamB)
            if hi == Self.tennisGamesPerSet && lo == Self.tennisGamesPerSet { return false }
            if hi >= Self.tennisGamesPerSet && hi - lo >= 2 { return true }
            return false
        }
        let winner = max(teamA, teamB)
        let loser = min(teamA, teamB)
        let need = max(game?.maxPointsPerTeam ?? Self.tennisGamesPerSet, 1)
        return winner >= need && (winner - loser) >= 2
    }

    func nextSet() {
        beginAdvanceToNextSet()
    }

    func canAdvanceToNextSet() -> Bool {
        if isAmericano { return false }
        if rawFixedNumberOfSets > 0 {
            return activeSetIndex + 1 < rawFixedNumberOfSets
        }
        return true
    }

    private func nextEditableSetIndex() -> Int {
        for (idx, set) in sets.enumerated() where set.teamA == 0 && set.teamB == 0 {
            return idx
        }
        return max(0, sets.count - 1)
    }
}
