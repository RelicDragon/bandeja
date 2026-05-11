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

    /// Points completed in the current classic game (drives serve L/R); persisted for deuce accuracy.
    var classicPointsPlayedInGame = 0

    private let api = APIClient()
    private var liveScoringRevision = 0
    private var liveSaveTask: Task<Void, Never>?
    private var remoteLivePollTask: Task<Void, Never>?

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

    var rawFixedNumberOfSets: Int {
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

    var usesBallCapPerSetUI: Bool {
        isAmericano
    }

    var usesTennisStyleServeGuide: Bool {
        game?.ballsInGames == true && !isAmericano
    }

    func ballCapScoringTitle(lang: String) -> String {
        WatchCopy.americano(lang)
    }

    var fixedNumberOfSets: Int {
        let n = game?.fixedNumberOfSets ?? 0
        return max(n, 1)
    }

    var maxPointsPerSet: Int {
        game?.maxTotalPointsPerSet ?? 0
    }

    var activeSetIsSupplemental: Bool {
        sets[safe: activeSetIndex].map { $0.resolvedRole != .official } ?? false
    }

    /// Match-deciding super tie-break set (points only, isTieBreak on row).
    var activeSetIsSuperTieBreak: Bool {
        usesTennisSetRules && !activeSetIsSupplemental && (sets[safe: activeSetIndex]?.isTieBreak == true)
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
                    sets = m.sets.sorted { $0.setNumber < $1.setNumber }.map { s in
                        let official = s.resolvedRole == .official
                        return WatchSetWrite(
                            teamA: s.teamAScore,
                            teamB: s.teamBScore,
                            isTieBreak: official && s.isTieBreak,
                            role: s.role
                        )
                    }
                    if sets.isEmpty { sets = [WatchSetWrite(teamA: 0, teamB: 0)] }
                    activeSetIndex = max(0, min(sets.count - 1, nextEditableSetIndex()))
                    pendingGameWinConfirmSide = nil
                    pendingSetFormatChoiceIndex = nil
                    tieBreakA = 0
                    tieBreakB = 0
                    syncWithinSetTieBreakForActiveSet()
                    liveScoringRevision = 0
                    if let live = m.metadata?.liveScoring, live.isSupported {
                        applyLiveScoringEnvelopeIfNewer(live)
                    } else {
                        syncClassicPointsPlayedFromState(mergingPersisted: WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId))
                    }
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
            sets.append(WatchSetWrite(teamA: 0, teamB: 0, role: .official))
        }
    }

    func appendSupplementalSet(kind: WatchMatchSetRole) {
        guard !isReadOnly else { return }
        guard kind == .extraGames || kind == .extraBalls else { return }
        sets.append(WatchSetWrite(teamA: 0, teamB: 0, isTieBreak: false, role: kind))
        activeSetIndex = sets.count - 1
        classicPointState = .regular(a: .zero, b: .zero)
        tieBreakA = 0
        tieBreakB = 0
        withinSetTieBreakMode = false
        classicPointsPlayedInGame = 0
        scheduleLiveScoringSave()
    }

    func flushLiveScoringSnapshot() async {
        guard !isReadOnly else { return }
        await saveLiveScoringNow(background: false)
    }

    func startLiveScoringRemotePolling() {
        guard !isReadOnly else { return }
        remoteLivePollTask?.cancel()
        remoteLivePollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                await self?.pollLiveScoringEnvelopeFromServer()
            }
        }
    }

    func stopLiveScoringRemotePolling() {
        remoteLivePollTask?.cancel()
        remoteLivePollTask = nil
    }

    private func pollLiveScoringEnvelopeFromServer() async {
        guard !isReadOnly else { return }
        do {
            let results: WatchResultsGame = try await api.fetch(.gameResults(gameId: gameId))
            for r in results.rounds {
                if let m = r.matches.first(where: { $0.id == matchId }),
                   let live = m.metadata?.liveScoring, live.isSupported {
                    applyLiveScoringEnvelopeIfNewer(live)
                    return
                }
            }
        } catch {
            // Polling is best-effort.
        }
    }

    func saveCurrentSets() async {
        guard !isReadOnly else { return }
        guard let match else { return }
        await saveLiveScoringNow()
        let sortedTeams = match.sortedTeams
        let teamAIds = sortedTeams.first(where: { $0.teamNumber == 1 })?.players.map(\.userId) ?? []
        let teamBIds = sortedTeams.first(where: { $0.teamNumber == 2 })?.players.map(\.userId) ?? []
        isSaving = true
        defer { isSaving = false }
        do {
            let body = WatchUpdateMatchBody(
                teamA: teamAIds,
                teamB: teamBIds,
                sets: sets
            )
            try await api.sendVoid(.updateMatch(gameId: gameId, matchId: match.id), body: body)
            WatchSessionManager.shared.notifyScoreUpdated(gameId: gameId)
            ScoringOutbox.shared.remove(matchId: match.id)
        } catch {
            if Self.shouldQueueSaveForLater(error) {
                ScoringOutbox.shared.enqueue(
                    ScoringOutbox.Entry(
                        gameId: gameId,
                        matchId: match.id,
                        teamA: teamAIds,
                        teamB: teamBIds,
                        sets: sets,
                        enqueuedAt: Date()
                    )
                )
            } else {
                self.error = error
            }
        }
    }

    private static func shouldQueueSaveForLater(_ error: Error) -> Bool {
        if let api = error as? APIError {
            switch api {
            case .httpError(let code):
                return APIError.httpStatusWarrantsOutboxRetry(code)
            case .noToken, .decodingError, .liveScoringRevisionMismatch:
                return false
            }
        }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain
    }

    func incrementAmericanoTeamA() {
        guard !isReadOnly else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            let prev = sets[activeSetIndex].teamA
            sets[activeSetIndex].teamA = min(99, sets[activeSetIndex].teamA + 1)
            if sets[activeSetIndex].teamA != prev {
                WatchScoreHaptics.point()
                scheduleLiveScoringSave()
            }
            return
        }
        let maxTotal = maxPointsPerSet
        guard maxTotal > 0 else { return }
        let prev = sets[activeSetIndex].teamA
        sets[activeSetIndex].teamA = min(maxTotal, sets[activeSetIndex].teamA + 1)
        sets[activeSetIndex].teamB = maxTotal - sets[activeSetIndex].teamA
        if sets[activeSetIndex].teamA != prev {
            WatchScoreHaptics.point()
            scheduleLiveScoringSave()
        }
    }

    func decrementAmericanoTeamA() {
        guard !isReadOnly else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            let prev = sets[activeSetIndex].teamA
            sets[activeSetIndex].teamA = max(0, sets[activeSetIndex].teamA - 1)
            if sets[activeSetIndex].teamA != prev {
                WatchScoreHaptics.undo()
                scheduleLiveScoringSave()
            }
            return
        }
        let maxTotal = maxPointsPerSet
        guard maxTotal > 0 else { return }
        let prev = sets[activeSetIndex].teamA
        sets[activeSetIndex].teamA = max(0, sets[activeSetIndex].teamA - 1)
        sets[activeSetIndex].teamB = maxTotal - sets[activeSetIndex].teamA
        if sets[activeSetIndex].teamA != prev {
            WatchScoreHaptics.undo()
            scheduleLiveScoringSave()
        }
    }

    func incrementAmericanoTeamB() {
        guard !isReadOnly else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            let prev = sets[activeSetIndex].teamB
            sets[activeSetIndex].teamB = min(99, sets[activeSetIndex].teamB + 1)
            if sets[activeSetIndex].teamB != prev {
                WatchScoreHaptics.point()
                scheduleLiveScoringSave()
            }
            return
        }
        let maxTotal = maxPointsPerSet
        guard maxTotal > 0 else { return }
        let prev = sets[activeSetIndex].teamB
        sets[activeSetIndex].teamB = min(maxTotal, sets[activeSetIndex].teamB + 1)
        sets[activeSetIndex].teamA = maxTotal - sets[activeSetIndex].teamB
        if sets[activeSetIndex].teamB != prev {
            WatchScoreHaptics.point()
            scheduleLiveScoringSave()
        }
    }

    func decrementAmericanoTeamB() {
        guard !isReadOnly else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            let prev = sets[activeSetIndex].teamB
            sets[activeSetIndex].teamB = max(0, sets[activeSetIndex].teamB - 1)
            if sets[activeSetIndex].teamB != prev {
                WatchScoreHaptics.undo()
                scheduleLiveScoringSave()
            }
            return
        }
        let maxTotal = maxPointsPerSet
        guard maxTotal > 0 else { return }
        let prev = sets[activeSetIndex].teamB
        sets[activeSetIndex].teamB = max(0, sets[activeSetIndex].teamB - 1)
        sets[activeSetIndex].teamA = maxTotal - sets[activeSetIndex].teamB
        if sets[activeSetIndex].teamB != prev {
            WatchScoreHaptics.undo()
            scheduleLiveScoringSave()
        }
    }

    func canUnscore(_ side: TeamSide) -> Bool {
        guard !isReadOnly, !usesBallCapPerSetUI else { return false }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            if side == .teamA { return sets[activeSetIndex].teamA > 0 }
            return sets[activeSetIndex].teamB > 0
        }
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
        guard !isReadOnly, !usesBallCapPerSetUI else { return }
        defer { scheduleLiveScoringSave() }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            if side == .teamA, sets[activeSetIndex].teamA > 0 {
                sets[activeSetIndex].teamA -= 1
                WatchScoreHaptics.undo()
            } else if side == .teamB, sets[activeSetIndex].teamB > 0 {
                sets[activeSetIndex].teamB -= 1
                WatchScoreHaptics.undo()
            }
            return
        }
        if activeSetIsSuperTieBreak {
            ensureSetExists(activeSetIndex)
            if side == .teamA, sets[activeSetIndex].teamA > 0 {
                sets[activeSetIndex].teamA -= 1
                WatchScoreHaptics.undo()
            } else if side == .teamB, sets[activeSetIndex].teamB > 0 {
                sets[activeSetIndex].teamB -= 1
                WatchScoreHaptics.undo()
            }
            return
        }
        if withinSetTieBreakMode {
            if side == .teamA, tieBreakA > 0 {
                tieBreakA -= 1
                WatchScoreHaptics.undo()
                return
            }
            if side == .teamB, tieBreakB > 0 {
                tieBreakB -= 1
                WatchScoreHaptics.undo()
                return
            }
            if tieBreakA == 0, tieBreakB == 0 {
                ensureSetExists(activeSetIndex)
                if side == .teamA, sets[activeSetIndex].teamA == gamesScoreForTieBreak,
                   sets[activeSetIndex].teamB == gamesScoreForTieBreak,
                   sets[activeSetIndex].teamA > 0 {
                    sets[activeSetIndex].teamA -= 1
                    withinSetTieBreakMode = false
                    WatchScoreHaptics.undo()
                    syncClassicPointsPlayedFromState(
                        mergingPersisted: WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId)
                    )
                } else if side == .teamB, sets[activeSetIndex].teamA == gamesScoreForTieBreak,
                          sets[activeSetIndex].teamB == gamesScoreForTieBreak,
                          sets[activeSetIndex].teamB > 0 {
                    sets[activeSetIndex].teamB -= 1
                    withinSetTieBreakMode = false
                    WatchScoreHaptics.undo()
                    syncClassicPointsPlayedFromState(
                        mergingPersisted: WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId)
                    )
                }
            }
            return
        }

        switch classicPointState {
        case .advantage:
            classicPointState = .deuce
            WatchScoreHaptics.undo()
        case .deuce:
            classicPointState = .regular(a: .forty, b: .forty)
            WatchScoreHaptics.undo()
        case .regular(let a, let b):
            if side == .teamA {
                if let p = a.previous {
                    classicPointState = .regular(a: p, b: b)
                    WatchScoreHaptics.undo()
                } else if sets[safe: activeSetIndex]?.teamA ?? 0 > 0 {
                    ensureSetExists(activeSetIndex)
                    sets[activeSetIndex].teamA -= 1
                    classicPointState = .regular(a: .forty, b: .forty)
                    WatchScoreHaptics.undo()
                }
            } else if let p = b.previous {
                classicPointState = .regular(a: a, b: p)
                WatchScoreHaptics.undo()
            } else if sets[safe: activeSetIndex]?.teamB ?? 0 > 0 {
                ensureSetExists(activeSetIndex)
                sets[activeSetIndex].teamB -= 1
                classicPointState = .regular(a: .forty, b: .forty)
                WatchScoreHaptics.undo()
            }
        }
        applyClassicPointsAfterUnscore()
    }

    func cancelPendingGameWinConfirm() {
        pendingGameWinConfirmSide = nil
        scheduleLiveScoringSave()
    }

    /// Clears modal scoring state before the review screen (avoids crown/stepper glitches stacking with pending confirms).
    func prepareForMatchReview() {
        pendingGameWinConfirmSide = nil
        pendingSetFormatChoiceIndex = nil
    }

    func pendingGameWinWinningUsers() -> [WatchUser] {
        guard let side = pendingGameWinConfirmSide else { return [] }
        return side == .teamA ? teamAUsers : teamBUsers
    }

    func pendingGameWinProjectedScoresIfBalls() -> (teamA: Int, teamB: Int)? {
        guard let side = pendingGameWinConfirmSide, game?.ballsInGames == true, !activeSetIsSupplemental else { return nil }
        let a = (sets[safe: activeSetIndex]?.teamA ?? 0) + (side == .teamA ? 1 : 0)
        let b = (sets[safe: activeSetIndex]?.teamB ?? 0) + (side == .teamB ? 1 : 0)
        return (a, b)
    }

    func confirmPendingGameWin() {
        guard let side = pendingGameWinConfirmSide else { return }
        pendingGameWinConfirmSide = nil
        scorePoint(side, skipGameWinConfirm: true)
    }

    func cancelSetFormatChoice() {
        pendingSetFormatChoiceIndex = nil
        scheduleLiveScoringSave()
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
        if sets[activeSetIndex].resolvedRole != .official {
            sets[activeSetIndex].isTieBreak = false
        } else if empty {
            sets[activeSetIndex].isTieBreak = superTieBreak
        }
        classicPointState = .regular(a: .zero, b: .zero)
        tieBreakA = 0
        tieBreakB = 0
        syncWithinSetTieBreakForActiveSet()
        classicPointsPlayedInGame = 0
        scheduleLiveScoringSave()
    }

    /// After load or changing active set: resume 6–6 (or N–N) within-set tie-break scoring.
    private func syncWithinSetTieBreakForActiveSet() {
        withinSetTieBreakMode = false
        if activeSetIsSupplemental { return }
        if usesBallCapPerSetUI { return }
        if activeSetIsSuperTieBreak { return }
        guard let s = sets[safe: activeSetIndex] else { return }
        if s.teamA == gamesScoreForTieBreak && s.teamB == gamesScoreForTieBreak {
            withinSetTieBreakMode = true
            tieBreakA = 0
            tieBreakB = 0
        }
    }

    private func shouldOfferSuperTieBreakChoice(nextIndex: Int) -> Bool {
        guard usesTennisSetRules, !usesBallCapPerSetUI else { return false }
        if sets[safe: nextIndex].map({ $0.resolvedRole != .official }) ?? false { return false }
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
            guard s.resolvedRole == .official else { continue }
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
        guard usesTennisSetRules, !activeSetIsSupplemental, !withinSetTieBreakMode, !activeSetIsSuperTieBreak, !usesBallCapPerSetUI else { return false }
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
        defer { scheduleLiveScoringSave() }
        if activeSetIsSupplemental {
            ensureSetExists(activeSetIndex)
            if side == .teamA {
                sets[activeSetIndex].teamA = min(99, sets[activeSetIndex].teamA + 1)
            } else {
                sets[activeSetIndex].teamB = min(99, sets[activeSetIndex].teamB + 1)
            }
            WatchScoreHaptics.point()
            return
        }
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
            WatchScoreHaptics.point()
            return
        }
        if withinSetTieBreakMode {
            if side == .teamA { tieBreakA += 1 } else { tieBreakB += 1 }
            if withinSetTieBreakPointRaceCompleted() {
                finishWithinSetTieBreakAsGames()
            }
            WatchScoreHaptics.point()
            return
        }

        if usesTennisSetRules, !usesBallCapPerSetUI, !skipGameWinConfirm, tapWouldAwardCurrentGame(side) {
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
                    WatchScoreHaptics.point()
                } else {
                    classicPointState = .regular(a: a.next ?? .forty, b: b)
                    WatchScoreHaptics.point()
                }
            } else {
                if b == .forty && a != .forty {
                    awardGame(.teamB)
                } else if a == .forty && b == .forty {
                    classicPointState = .deuce
                    WatchScoreHaptics.point()
                } else {
                    classicPointState = .regular(a: a, b: b.next ?? .forty)
                    WatchScoreHaptics.point()
                }
            }
        case .deuce:
            classicPointState = .advantage(side)
            WatchScoreHaptics.point()
        case .advantage(let adv):
            if adv == side {
                awardGame(side)
            } else {
                classicPointState = .deuce
                WatchScoreHaptics.point()
            }
        }
        applyClassicPointsAfterUserScore()
    }

    private func awardGame(_ side: TeamSide) {
        ensureSetExists(activeSetIndex)
        if side == .teamA {
            sets[activeSetIndex].teamA += 1
        } else {
            sets[activeSetIndex].teamB += 1
        }
        classicPointState = .regular(a: .zero, b: .zero)
        classicPointsPlayedInGame = 0
        WatchScoreHaptics.point()
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
        guard activeSetIndex + 1 < sets.count else { return false }
        if isAmericano { return true }
        if rawFixedNumberOfSets > 0 {
            if activeSetIndex + 1 < rawFixedNumberOfSets { return true }
            return sets[activeSetIndex + 1].resolvedRole != .official
        }
        return true
    }

    private func nextEditableSetIndex() -> Int {
        for (idx, set) in sets.enumerated() where set.teamA == 0 && set.teamB == 0 {
            return idx
        }
        return max(0, sets.count - 1)
    }

    private static func padelRank(_ p: PadelPoint) -> Int { p.rawValue }

    func requestLiveScoringSave() {
        scheduleLiveScoringSave()
    }

    func applyLiveScoringEnvelopeIfNewer(_ envelope: WatchLiveScoringEnvelope?) {
        guard let envelope, envelope.isSupported, envelope.revision > liveScoringRevision else { return }
        liveScoringRevision = envelope.revision
        guard let state = envelope.state else { return }

        sets = state.sets.isEmpty ? [WatchSetWrite(teamA: 0, teamB: 0)] : state.sets
        activeSetIndex = max(0, min(sets.count - 1, state.activeSetIndex))
        pendingGameWinConfirmSide = nil
        pendingSetFormatChoiceIndex = nil

        if let classic = state.classic {
            classicPointState = classic.pointState.padelPointState
            withinSetTieBreakMode = classic.withinSetTieBreak
            tieBreakA = classic.tieBreakA
            tieBreakB = classic.tieBreakB
            classicPointsPlayedInGame = classic.classicPointsPlayedInGame
            pendingGameWinConfirmSide = classic.pendingGameWinConfirmSide
        } else {
            classicPointState = .regular(a: .zero, b: .zero)
            withinSetTieBreakMode = false
            tieBreakA = 0
            tieBreakB = 0
            classicPointsPlayedInGame = 0
        }

        var serveRecord = WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId) ?? .empty
        if let first = state.firstServerTeam { serveRecord.firstServerTeam = first }
        if let idx = state.firstServerDoublesPlayerIndex { serveRecord.firstServerDoublesPlayerIndex = idx }
        if let skipped = state.serveGuideSkipped { serveRecord.skipped = skipped }
        serveRecord.classicPointsPlayedInGame = classicPointsPlayedInGame
        WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: serveRecord)
    }

    private func scheduleLiveScoringSave() {
        guard !isReadOnly else { return }
        liveSaveTask?.cancel()
        liveSaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            await self?.saveLiveScoringNow(background: true)
        }
    }

    private func saveLiveScoringNow(background: Bool = false) async {
        guard !isReadOnly else { return }
        liveSaveTask?.cancel()
        liveSaveTask = nil
        do {
            let body = WatchPatchLiveScoringBody(
                state: makeLiveScoringState(),
                baseRevision: liveScoringRevision,
                clientMessageId: UUID().uuidString
            )
            let response = try await api.patchMatchLiveScoring(gameId: gameId, matchId: matchId, body: body)
            if let envelope = response.liveScoring {
                applyLiveScoringEnvelopeIfNewer(envelope)
            } else {
                liveScoringRevision = response.revision
            }
            WatchSessionManager.shared.notifyScoreUpdated(gameId: gameId)
        } catch let api as APIError {
            if case .liveScoringRevisionMismatch(_, let serverEnvelope) = api {
                if let serverEnvelope {
                    applyLiveScoringEnvelopeIfNewer(serverEnvelope)
                } else {
                    await pollLiveScoringEnvelopeFromServer()
                }
                return
            }
            if !background {
                self.error = api
            }
        } catch {
            if !background {
                self.error = error
            }
        }
    }

    private func makeLiveScoringState() -> WatchLiveScoringState {
        let record = WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId)
        let pointState: WatchLivePointState
        switch classicPointState {
        case .regular(let a, let b):
            pointState = .regular(teamA: a, teamB: b)
        case .deuce:
            pointState = .deuce
        case .advantage(let side):
            pointState = .advantage(side)
        }

        let classic = WatchLiveClassicState(
            pointState: pointState,
            withinSetTieBreak: withinSetTieBreakMode,
            tieBreakA: tieBreakA,
            tieBreakB: tieBreakB,
            classicPointsPlayedInGame: classicPointsPlayedInGame,
            pendingGameWinConfirmSide: pendingGameWinConfirmSide
        )

        return WatchLiveScoringState(
            activeSetIndex: activeSetIndex,
            mode: usesBallCapPerSetUI ? .points : .classic,
            sets: sets,
            classic: usesBallCapPerSetUI ? nil : classic,
            firstServerTeam: record?.firstServerTeam,
            firstServerDoublesPlayerIndex: record?.firstServerDoublesPlayerIndex,
            serveGuideSkipped: record?.skipped
        )
    }

    private func applyClassicPointsAfterUserScore() {
        guard usesTennisStyleServeGuide, !withinSetTieBreakMode, !activeSetIsSuperTieBreak, !activeSetIsSupplemental else { return }
        switch classicPointState {
        case .regular(let a, let b):
            classicPointsPlayedInGame = Self.padelRank(a) + Self.padelRank(b)
        case .deuce, .advantage:
            classicPointsPlayedInGame += 1
        }
    }

    private func applyClassicPointsAfterUnscore() {
        guard usesTennisStyleServeGuide, !withinSetTieBreakMode, !activeSetIsSuperTieBreak, !activeSetIsSupplemental else { return }
        switch classicPointState {
        case .regular(let a, let b):
            classicPointsPlayedInGame = Self.padelRank(a) + Self.padelRank(b)
        case .deuce, .advantage:
            classicPointsPlayedInGame = max(0, classicPointsPlayedInGame - 1)
        }
    }

    func syncClassicPointsPlayedFromState(mergingPersisted record: WatchServeGuideSessionRecord?) {
        guard usesTennisStyleServeGuide, !withinSetTieBreakMode, !activeSetIsSuperTieBreak, !activeSetIsSupplemental else {
            classicPointsPlayedInGame = 0
            return
        }
        switch classicPointState {
        case .regular(let a, let b):
            classicPointsPlayedInGame = Self.padelRank(a) + Self.padelRank(b)
        case .deuce:
            classicPointsPlayedInGame = max(6, record?.classicPointsPlayedInGame ?? 6)
        case .advantage:
            classicPointsPlayedInGame = max(7, record?.classicPointsPlayedInGame ?? 7)
        }
    }
}
