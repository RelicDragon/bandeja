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
    /// Mirrors web `LiveScoringState.optionalDeciderFormat` for PATCH / envelope merge.
    var optionalDeciderFormat: String?
    /// `GAMES` | `AMERICANO_POINTS` — CLASSIC_AUTOMATIC.
    var automaticRecordMode: String?
    var automaticEarlyFinish = false
    var automaticOpenEndedSetConfirmed = false
    /// Partial classic set locked at buzzer (mirrors `timedClassicSetLocked` in `core.ts`).
    var timedClassicSetLocked = false
    /// CLASSIC_AUTOMATIC: show continue vs end dialog.
    var showAutomaticContinueChoice = false
    /// CLASSIC_AUTOMATIC: show games vs americano dialog at match start.
    var showAutomaticRecordModeChoice = false

    /// Points completed in the current classic game (drives serve L/R); persisted for deuce accuracy.
    var classicPointsPlayedInGame = 0
    /// Returns to 40:40 from advantage in the current game (for golden point threshold).
    var deuceCount = 0

    /// Rally-cap sports: winner of each point (mirrors FE `pointWinnerLog`).
    var pointWinnerLog: [TeamSide] = []

    var firstServerTeam: TeamSide?
    var firstServerDoublesPlayerIndex: Int?
    var pointsServeRotation: String?
    var matchStartCourtEndsSwapped: Bool?
    var matchStartTeamASidesMirrored: Bool?
    var matchStartTeamBSidesMirrored: Bool?
    var serveGuideSkipped = false
    /// UI-only; persisted locally for coach toast, not in live PATCH.
    var showedFirstServeCoachToast = false
    /// Brief notice when a newer live session revision was written on another device.
    var showRemoteWriterAttribution = false
    /// Increments once per remote revision so UI can re-show while a prior toast is visible.
    var remoteWriterAttributionSignal = 0
    /// Strict officiating: let replay pending (mirrors FE `officiatingLetPending` in live blob).
    var officiatingLetPending = false

    private let api = APIClient()
    private var liveScoringRevision = 0
    private var matchResultsVersion: String?
    private var liveSaveHadConflict = false
    private var lastAttributedRemoteRevision = 0
    private var lastAcknowledgedOwnClientMessageId: String?
    private var inFlightClientMessageId: String?
    private var suppressRemoteWriterAttribution = false
    /// When false, in-flight poll/relay/outbox merges must not overwrite local score (finish/review/save).
    private var allowsRemoteLiveScoringMerge = false
    private var liveSaveTask: Task<Void, Never>?
    private var remoteLivePollTask: Task<Void, Never>?
    private var relayObserveTask: Task<Void, Never>?
    private var lastObservedRelayTick = 0
    /// Bumps on every local score mutation so ACK envelopes cannot wipe newer points.
    private var localScoreGeneration = 0
    /// Last generation successfully acknowledged / merged from remote.
    private var ackedScoreGeneration = 0

    /// Local point mutations not yet acknowledged by the server. When a newer remote
    /// revision lands while these are pending, the remote state is applied and the
    /// ops are replayed on top of it, so neither writer's points are lost.
    private enum LocalScoreOp {
        case score(TeamSide)
        case unscore(TeamSide)
        case rallyIncrement(TeamSide)
        case rallyDecrement(TeamSide)
    }
    private var pendingLocalOps: [(generation: Int, op: LocalScoreOp)] = []
    private var isReplayingLocalOps = false
    /// Serializes PATCHes: a second save while one is in flight waits (explicit) or defers (background).
    private var liveSaveInFlightTask: Task<Void, Never>?

    private var hasUnackedLocalEdits: Bool {
        localScoreGeneration > ackedScoreGeneration
    }

    private func recordLocalOp(_ op: LocalScoreOp) {
        guard !isReplayingLocalOps else { return }
        pendingLocalOps.append((generation: localScoreGeneration + 1, op: op))
    }

    private func dropLocalOps(through generation: Int) {
        pendingLocalOps.removeAll { $0.generation <= generation }
    }

    private func replayPendingLocalOps() {
        let ops = pendingLocalOps.map(\.op)
        pendingLocalOps.removeAll()
        guard !ops.isEmpty else { return }
        isReplayingLocalOps = true
        WatchScoreHaptics.suppressed = true
        defer {
            isReplayingLocalOps = false
            WatchScoreHaptics.suppressed = false
        }
        for op in ops {
            switch op {
            case .score(let side): scorePoint(side)
            case .unscore(let side): unscorePoint(side)
            case .rallyIncrement(.teamA): incrementAmericanoTeamA()
            case .rallyIncrement(.teamB): incrementAmericanoTeamB()
            case .rallyDecrement(.teamA): decrementAmericanoTeamA()
            case .rallyDecrement(.teamB): decrementAmericanoTeamB()
            }
        }
    }

    var rules: WatchScoringRules { WatchScoringRulebook.rules(for: game) }

    private var usesTennisSetRules: Bool { rules.isClassic }

    private var gamesScoreForTieBreak: Int {
        let r = rules
        if r.isClassic { return r.gamesScoreForTieBreak }
        return max(r.maxPointsPerTeam, 1)
    }

    var rawFixedNumberOfSets: Int {
        game?.fixedNumberOfSets ?? 0
    }

    /// Pickleball open-ended CUSTOM: weak live — local scoring only (parity with `TIMED_CUSTOM_WEAK_LIVE_SPORTS`).
    private var openEndedPresetBlocksLivePatch: Bool {
        guard game?.resolvedSport == .pickleball else { return false }
        let p = WatchScoringPreset(rawValue: game?.scoringPreset?.uppercased() ?? "")
        if p == .timed { return true }
        if p == .custom, rules.isOpenEndedPointsPreset { return true }
        return false
    }

    init(gameId: String, matchId: String) {
        self.gameId = gameId
        self.matchId = matchId
        NetworkDeliveryOutbox.shared.registerSink(self)
    }

    static func initialLiveScoringRevision(hasSupportedEnvelope: Bool) -> Int {
        hasSupportedEnvelope ? -1 : 0
    }

    private func splitOfficialSupplementalSets(_ rows: [WatchSetWrite]) -> (official: [WatchSetWrite], supplemental: [WatchSetWrite]) {
        if let idx = rows.firstIndex(where: { $0.resolvedRole != .official }) {
            return (Array(rows[..<idx]), Array(rows[idx...]))
        }
        return (rows, [])
    }

    private func officialDeciderIndex() -> Int? {
        let (official, _) = splitOfficialSupplementalSets(sets)
        guard official.count >= 3 else { return nil }
        return official.count - 1
    }

    private func deciderRowPristineForOptionalChoice(deciderIdx: Int) -> Bool {
        guard WatchLiveScoringEngine.optionalDeciderChoicePending(state: liveScoringEngineState(), rules: rules) else {
            return false
        }
        guard let row = sets[safe: deciderIdx] else { return false }
        if row.teamA > 0 || row.teamB > 0 { return false }
        if row.isTieBreak { return true }
        if usesBallCapPerSetUI { return true }
        if withinSetTieBreakMode { return false }
        switch classicPointState {
        case .regular(let a, let b):
            return a == .zero && b == .zero
        default:
            return false
        }
    }

    private func optionalDeciderChoicePending() -> Bool {
        WatchLiveScoringEngine.optionalDeciderChoicePending(state: liveScoringEngineState(), rules: rules)
    }

    private func syncOptionalDeciderPendingAfterEnvelopeMerge() {
        if optionalDeciderFormat != nil {
            pendingSetFormatChoiceIndex = nil
            return
        }
        guard let decIdx = officialDeciderIndex(),
              deciderRowPristineForOptionalChoice(deciderIdx: decIdx) else {
            pendingSetFormatChoiceIndex = nil
            return
        }
        pendingSetFormatChoiceIndex = decIdx
    }

    private func normalizeLiveSetsAfterDecisionIfNeeded() {
        guard usesTennisSetRules, !isAmericano else { return }
        let normalized = WatchLiveScoringEngine.normalizeLiveSetsAfterDecision(
            state: liveScoringEngineState(),
            rules: rules
        )
        applyLiveScoringEngineState(normalized)
    }

    var isAmericano: Bool {
        rules.isBallBudgetPoints
    }

    private var nonRallyOutcomeBlocksScoring: Bool {
        let v = match?.metadata?.nonRallyOutcome?.uppercased() ?? ""
        return v == "WALKOVER" || v == "DEFAULT" || v == "RETIRED"
    }

    /// Official row: no more + taps (match winner, or points ball budget full).
    private func blocksFurtherOfficialTaps() -> Bool {
        if activeSetIsSupplemental { return false }
        if nonRallyOutcomeBlocksScoring { return true }
        if WatchAutomaticFlexible.automaticRecordModeChoicePending(
            state: liveScoringEngineState(),
            rules: rules
        ) { return true }
        if optionalDeciderChoicePending() { return true }
        if WatchLiveScoringEngine.optionalContinueSetChoicePending(
            state: liveScoringEngineState(),
            rules: rules
        ) { return true }
        if WatchAutomaticFlexible.isAutomaticLiveMatchComplete(
            state: liveScoringEngineState(),
            rules: rules
        ) { return true }
        if timedClassicSetLocked { return true }
        if officiatingLetReplayBlocksScoring { return true }
        if !rules.isClassicAutomaticRelaxed,
           WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: sets, rules: rules) {
            return true
        }
        if isAmericano,
           WatchComputeMatchWinner.isPointsOfficialBudgetExhausted(activeSet: sets[safe: activeSetIndex], rules: rules) {
            return true
        }
        if rules.usesRallyPointCap,
           let row = sets[safe: activeSetIndex],
           rules.pointRaceCompleted(teamA: row.teamA, teamB: row.teamB) {
            return true
        }
        return false
    }

    var classicOfficialScoringLocked: Bool {
        serveSeedBlocksScoring
            || strictBadmintonServeBlocksUserScoring
            || (!activeSetIsSupplemental && blocksFurtherOfficialTaps())
    }

    var pointsOfficialIncrementDisabled: Bool {
        isReadOnly
            || serveSeedBlocksScoring
            || strictBadmintonServeBlocksUserScoring
            || (!activeSetIsSupplemental && blocksFurtherOfficialTaps())
    }

    var needsServeSetup: Bool {
        guard usesTennisStyleServeGuide, !isReadOnly else { return false }
        return WatchServeSetup.needsServeSetup(state: currentLiveScoringStateSnapshot(), rules: rules)
    }

    /// Blocks scoring until first server is chosen (or hints skipped), including mid-match recovery.
    private var serveSeedBlocksScoring: Bool {
        needsServeSetup
    }

    var pointsOfficialDecrementDisabled: Bool {
        if isReadOnly { return true }
        if activeSetIsSupplemental { return false }
        // CLASSIC_AUTOMATIC can have a standings winner after one set while entry continues.
        if rules.isClassicAutomaticRelaxed {
            return WatchAutomaticFlexible.isAutomaticLiveMatchComplete(
                state: liveScoringEngineState(),
                rules: rules
            )
        }
        return WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: sets, rules: rules)
    }

    var usesBallCapPerSetUI: Bool {
        if automaticRecordMode == WatchAutomaticFlexible.RecordMode.americanoPoints.rawValue {
            return true
        }
        if isAmericano { return true }
        guard game?.usesRallySetScoring == true else { return false }
        return !rules.isClassic
    }

    /// Rally / points-per-set sports using `pointsCapStrip` (mirrors FE `rally-points` engine).
    var usesRallyPointsServeGuide: Bool {
        guard !rules.isBallBudgetPoints else { return false }
        guard rules.usesRallyPointCap, game?.usesRallySetScoring == true else { return false }
        return true
    }

    var usesTennisStyleServeGuide: Bool {
        // Open-ended Automatic americano points has no tennis game/point serve model.
        if usesAutomaticAmericanoPointsUI { return false }
        if rules.isBallBudgetPoints { return false }
        if game?.resolvedSport == .tennis, !isAmericano { return true }
        if usesRallyPointsServeGuide { return true }
        return usesTennisSetRules
    }

    var officiatingHintsEnabled: Bool {
        game?.resolvedOfficiatingLevel.showsHonorHints ?? false
    }

    var officiatingIsStrict: Bool {
        game?.resolvedOfficiatingLevel.isStrict ?? false
    }

    private var officiatingLetReplayBlocksScoring: Bool {
        WatchOfficiatingEnforcement.isLetReplayBlockingScore(
            letPending: officiatingLetPending,
            level: game?.resolvedOfficiatingLevel ?? .none
        )
    }

    private var strictBadmintonServeBlocksUserScoring: Bool {
        guard officiatingIsStrict, game?.resolvedSport == .badminton else { return false }
        let inputs = ServeGuideInputs.from(vm: self, hintsMode: .on)
        guard let snap = ServeGuideEngine.compute(inputs) else { return false }
        let set = sets[safe: activeSetIndex]
        let serverScore = snap.serverTeam == .teamA ? (set?.teamA ?? 0) : (set?.teamB ?? 0)
        return WatchOfficiatingEnforcement.strictBadmintonServeBlocksUserScoring(
            level: game?.resolvedOfficiatingLevel ?? .none,
            sport: game?.resolvedSport,
            serverScore: serverScore,
            courtSide: snap.courtSide
        )
    }

    var strictOfficiatingActionsDisabled: Bool {
        if isReadOnly || isSaving { return true }
        if nonRallyOutcomeBlocksScoring { return true }
        if optionalDeciderChoicePending() { return true }
        if timedClassicSetLocked { return true }
        if serveSeedBlocksScoring { return true }
        if !activeSetIsSupplemental {
            if rules.isClassicAutomaticRelaxed {
                if WatchAutomaticFlexible.isAutomaticLiveMatchComplete(
                    state: liveScoringEngineState(),
                    rules: rules
                ) { return true }
            } else if WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: sets, rules: rules) {
                return true
            }
        }
        return false
    }

    var liveScoringUiId: WatchLiveScoringUiId {
        WatchLiveScoringRegistry.resolve(
            game: game,
            rules: rules,
            automaticRecordMode: automaticRecordMode
        )
    }

    var canAutomaticFinishSet: Bool {
        !isReadOnly
            && WatchAutomaticFlexible.canConfirmAutomaticOpenEndedSet(
                state: liveScoringEngineState(),
                rules: rules,
                deciderPending: WatchLiveScoringEngine.optionalDeciderChoicePending
            )
    }

    func ballCapScoringTitle(lang: String) -> String {
        switch liveScoringUiId {
        case .tableTennisBoard:
            return WatchCopy.tableTennisScoring(lang)
        case .rallyPointsBoard:
            switch game?.resolvedSport {
            case .badminton: return WatchCopy.badmintonScoring(lang)
            case .pickleball: return WatchCopy.pickleballScoring(lang)
            case .squash: return WatchCopy.squashScoring(lang)
            default: return WatchCopy.americano(lang)
            }
        case .americanoPoints:
            return WatchCopy.americano(lang)
        case .classicCourt:
            return WatchCopy.americano(lang)
        }
    }

    var fixedNumberOfSets: Int {
        let n = game?.fixedNumberOfSets ?? 0
        return max(n, 1)
    }

    var maxPointsPerSet: Int {
        let t = rules.totalPointsPerSet
        if t > 0 { return t }
        return game?.maxTotalPointsPerSet ?? 0
    }

    var activeSetIsSupplemental: Bool {
        sets[safe: activeSetIndex].map { $0.resolvedRole != .official } ?? false
    }

    /// Match-deciding super tie-break set (points only, isTieBreak on row).
    var activeSetIsSuperTieBreak: Bool {
        usesTennisSetRules && !activeSetIsSupplemental && (sets[safe: activeSetIndex]?.isTieBreak == true)
    }

    var teamAUsers: [WatchUser] {
        let users = match?.sortedTeams.first { $0.teamNumber == 1 }?.players.map(\.user) ?? []
        return WatchMatchFormat.capUsers(users, max: WatchMatchFormat.maxPlayersPerTeam(for: game))
    }

    var teamBUsers: [WatchUser] {
        let users = match?.sortedTeams.first { $0.teamNumber == 2 }?.players.map(\.user) ?? []
        return WatchMatchFormat.capUsers(users, max: WatchMatchFormat.maxPlayersPerTeam(for: game))
    }

    var isDoublesMatch: Bool {
        game?.isDoublesMatch ?? false
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
                    if (m.metadata?.liveScoring?.revision ?? 0) < liveScoringRevision { return }
                    round = r
                    match = m
                    matchResultsVersion = m.resultsVersion
                    let onMatch = currentUserId.map { uid in
                        m.teams.contains { team in
                            team.players.contains { $0.userId == uid }
                        }
                    } ?? false
                    let nro = (m.metadata?.nonRallyOutcome).map { $0.uppercased() } ?? ""
                    let nonRally = nro == "WALKOVER" || nro == "DEFAULT" || nro == "RETIRED"
                    // Server authorization (`canModifyResults`): owner/admin may score any court,
                    // `resultsByAnyone` players only their own. Otherwise the board is view-only,
                    // exactly like the web, instead of failing every PATCH with 403.
                    let isPlatformAdmin = KeychainHelper.shared.readIsPlatformAdmin()
                    let mayModify = game.map {
                        WatchResultsPermissions.canModifyResults(game: $0, userId: currentUserId, isPlatformAdmin: isPlatformAdmin)
                    } ?? false
                    let organizer = game.map {
                        isPlatformAdmin || WatchResultsPermissions.isOwnerOrAdmin(game: $0, userId: currentUserId)
                    } ?? false
                    let mayScoreThisMatch = mayModify && (onMatch || organizer)
                    isReadOnly = (game?.resultsStatus == "FINAL") || !mayScoreThisMatch || nonRally
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
                    optionalDeciderFormat = nil
                    timedClassicSetLocked = false
                    officiatingLetPending = false
                    pendingSetFormatChoiceIndex = nil
                    tieBreakA = 0
                    tieBreakB = 0
                    syncWithinSetTieBreakForActiveSet()
                    let supportedLive = m.metadata?.liveScoring.flatMap { $0.isSupported ? $0 : nil }
                    liveScoringRevision = Self.initialLiveScoringRevision(
                        hasSupportedEnvelope: supportedLive != nil
                    )
                    if let live = supportedLive {
                        suppressRemoteWriterAttribution = true
                        applyLiveScoringEnvelopeIfNewer(live, force: true)
                        suppressRemoteWriterAttribution = false
                    } else {
                        if let metaMode = m.metadata?.automaticRecordMode,
                           metaMode == WatchAutomaticFlexible.RecordMode.games.rawValue
                            || metaMode == WatchAutomaticFlexible.RecordMode.americanoPoints.rawValue {
                            automaticRecordMode = metaMode
                        }
                        hydrateServeSeedFromOfflineCache()
                        syncClassicPointsPlayedFromState()
                        syncAutomaticChoiceSheets()
                    }
                    normalizeClassicPointStateForGoldenPointRules()
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
        deuceCount = 0
        scheduleLiveScoringSave()
    }

    func flushLiveScoringSnapshot() async {
        guard !isReadOnly else { return }
        await NetworkDeliveryOutbox.shared.flush(matchId: matchId)
        await saveLiveScoringNow(background: false)
    }

    private static let liveScoringRemotePollIntervalNs: UInt64 = 1_750_000_000

    func startLiveScoringRemotePolling() {
        guard !isReadOnly else { return }
        allowsRemoteLiveScoringMerge = true
        NetworkDeliveryOutbox.shared.registerSink(self)
        remoteLivePollTask?.cancel()
        startLiveScoringRelayObserver()
        remoteLivePollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if !WatchLiveScoringRelayStore.shared.suppressesRemotePoll(
                    gameId: self.gameId,
                    matchId: self.matchId,
                    currentRevision: self.liveScoringRevision
                ) {
                    await self.pollLiveScoringEnvelopeFromServer()
                }
                try? await Task.sleep(nanoseconds: Self.liveScoringRemotePollIntervalNs)
            }
        }
    }

    func stopLiveScoringRemotePolling() {
        allowsRemoteLiveScoringMerge = false
        liveSaveTask?.cancel()
        liveSaveTask = nil
        remoteLivePollTask?.cancel()
        remoteLivePollTask = nil
        relayObserveTask?.cancel()
        relayObserveTask = nil
        lastObservedRelayTick = 0
        NetworkDeliveryOutbox.shared.unregisterSink(gameId: gameId, matchId: matchId)
    }

    private func startLiveScoringRelayObserver() {
        relayObserveTask?.cancel()
        lastObservedRelayTick = WatchLiveScoringRelayStore.shared.tick
        relayObserveTask = Task { [weak self] in
            self?.consumePendingLiveScoringRelayIfNeeded()
            let stream = NotificationCenter.default.notifications(named: .watchLiveScoringRelayDidUpdate)
            for await _ in stream {
                guard !Task.isCancelled else { return }
                self?.consumePendingLiveScoringRelayIfNeeded()
            }
        }
    }

    private func consumePendingLiveScoringRelayIfNeeded() {
        let store = WatchLiveScoringRelayStore.shared
        guard store.tick != lastObservedRelayTick else { return }
        lastObservedRelayTick = store.tick
        guard let message = store.lastMessage else { return }
        applyLiveScoringRelay(message)
    }

    func applyLiveScoringRelay(_ message: WatchLiveScoringRelayMessage) {
        guard allowsRemoteLiveScoringMerge else { return }
        guard message.gameId == gameId, message.matchId == matchId else { return }
        if message.isExplicitClear {
            Task { await pollLiveScoringEnvelopeFromServer() }
            return
        }
        if let envelope = message.envelope {
            applyLiveScoringEnvelopeIfNewer(envelope)
            WatchLiveScoringRelayStore.shared.markApplied(
                gameId: gameId,
                matchId: matchId,
                revision: envelope.revision
            )
            return
        }
        let hintRevision = message.revisionHint
        if hintRevision > liveScoringRevision {
            Task { await pollLiveScoringEnvelopeFromServer() }
        }
    }

    private func pollLiveScoringEnvelopeFromServer(requireNewer: Bool = true) async {
        guard !isReadOnly, allowsRemoteLiveScoringMerge else { return }
        do {
            let results: WatchResultsGame = try await api.fetch(.gameResults(gameId: gameId))
            guard allowsRemoteLiveScoringMerge else { return }
            for r in results.rounds {
                if let m = r.matches.first(where: { $0.id == matchId }),
                   let live = m.metadata?.liveScoring, live.isSupported {
                    applyLiveScoringEnvelope(live, force: false, requireNewer: requireNewer)
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
        error = nil
        isSaving = true
        defer { isSaving = false }
        let persistedSets = sets
        allowsRemoteLiveScoringMerge = false
        liveSaveTask?.cancel()
        liveSaveTask = nil
        await NetworkDeliveryOutbox.shared.flush(matchId: matchId)
        liveSaveHadConflict = false
        await saveLiveScoringNow(applyEnvelope: false)
        if liveSaveHadConflict { self.error = APIError.httpError(409); return }
        let sortedTeams = match.sortedTeams
        let maxPerTeam = WatchMatchFormat.maxPlayersPerTeam(for: game)
        let teamAIds = WatchMatchFormat.capUserIds(
            sortedTeams.first(where: { $0.teamNumber == 1 })?.players.map(\.userId) ?? [],
            max: maxPerTeam
        )
        let teamBIds = WatchMatchFormat.capUserIds(
            sortedTeams.first(where: { $0.teamNumber == 2 })?.players.map(\.userId) ?? [],
            max: maxPerTeam
        )
        do {
            let body = WatchUpdateMatchBody(
                teamA: teamAIds,
                teamB: teamBIds,
                sets: persistedSets,
                baseVersion: matchResultsVersion
            )
            try await api.sendVoid(.updateMatch(gameId: gameId, matchId: match.id), body: body)
            sets = persistedSets
            self.error = nil
            WatchSessionManager.shared.notifyScoreUpdated(
                gameId: gameId,
                matchId: match.id
            )
            NetworkDeliveryOutbox.shared.removeMatchPut(matchId: match.id)
        } catch {
            if Self.shouldQueueSaveForLater(error) {
                NetworkDeliveryOutbox.shared.enqueueMatchPut(
                    gameId: gameId,
                    matchId: match.id,
                    teamA: teamAIds,
                    teamB: teamBIds,
                    sets: persistedSets,
                    baseVersion: matchResultsVersion
                )
                self.error = nil
            } else {
                self.error = error
            }
        }
    }

    private static func shouldQueueSaveForLater(_ error: Error) -> Bool {
        APIError.warrantsDeliveryRetry(error)
    }

    private var usesAutomaticAmericanoPointsUI: Bool {
        rules.isClassicAutomaticRelaxed
            && automaticRecordMode == WatchAutomaticFlexible.RecordMode.americanoPoints.rawValue
    }

    func incrementAmericanoTeamA() {
        guard !isReadOnly, !isSaving else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if usesAutomaticAmericanoPointsUI {
            scorePoint(.teamA)
            return
        }
        recordLocalOp(.rallyIncrement(.teamA))
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
        if maxTotal <= 0, rules.isOpenEndedPointsPreset {
            if blocksFurtherOfficialTaps() { return }
            ensureSetExists(activeSetIndex)
            let prev = sets[activeSetIndex].teamA
            sets[activeSetIndex].teamA = min(99, sets[activeSetIndex].teamA + 1)
            if sets[activeSetIndex].teamA != prev {
                WatchScoreHaptics.point()
                scheduleLiveScoringSave()
            }
            return
        }
        guard maxTotal > 0 else { return }
        if blocksFurtherOfficialTaps() { return }
        var a = sets[activeSetIndex].teamA
        let b = sets[activeSetIndex].teamB
        let prevA = a
        let na = a + 1
        if !rules.usesRallyPointCap, na + b > maxTotal { return }
        if rules.maxPointsPerTeam > 0, na > rules.maxPointsPerTeam { return }
        a = na
        if a != prevA {
            sets[activeSetIndex].teamA = a
            sets[activeSetIndex].teamB = b
            appendRallyPointWinner(.teamA)
            WatchScoreHaptics.point()
            scheduleLiveScoringSave()
            applyRallyAutoAdvanceAfterMutation()
        }
    }

    func decrementAmericanoTeamA() {
        guard !isReadOnly, !isSaving else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if usesAutomaticAmericanoPointsUI {
            unscorePoint(.teamA)
            return
        }
        recordLocalOp(.rallyDecrement(.teamA))
        if timedClassicSetLocked, !activeSetIsSupplemental { return }
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
        if WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: sets, rules: rules) { return }
        let prev = sets[activeSetIndex].teamA
        guard prev > 0 else { return }
        sets[activeSetIndex].teamA = prev - 1
        undoRallyPointWinner(.teamA)
        WatchScoreHaptics.undo()
        scheduleLiveScoringSave()
    }

    func incrementAmericanoTeamB() {
        guard !isReadOnly, !isSaving else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if usesAutomaticAmericanoPointsUI {
            scorePoint(.teamB)
            return
        }
        recordLocalOp(.rallyIncrement(.teamB))
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
        if maxTotal <= 0, rules.isOpenEndedPointsPreset {
            if blocksFurtherOfficialTaps() { return }
            ensureSetExists(activeSetIndex)
            let prev = sets[activeSetIndex].teamB
            sets[activeSetIndex].teamB = min(99, sets[activeSetIndex].teamB + 1)
            if sets[activeSetIndex].teamB != prev {
                WatchScoreHaptics.point()
                scheduleLiveScoringSave()
            }
            return
        }
        guard maxTotal > 0 else { return }
        if blocksFurtherOfficialTaps() { return }
        let a = sets[activeSetIndex].teamA
        var b = sets[activeSetIndex].teamB
        let prevB = b
        let nb = b + 1
        if !rules.usesRallyPointCap, a + nb > maxTotal { return }
        if rules.maxPointsPerTeam > 0, nb > rules.maxPointsPerTeam { return }
        b = nb
        if b != prevB {
            sets[activeSetIndex].teamA = a
            sets[activeSetIndex].teamB = b
            appendRallyPointWinner(.teamB)
            WatchScoreHaptics.point()
            scheduleLiveScoringSave()
            applyRallyAutoAdvanceAfterMutation()
        }
    }

    func decrementAmericanoTeamB() {
        guard !isReadOnly, !isSaving else { return }
        guard usesBallCapPerSetUI, activeSetIndex < sets.count else { return }
        if usesAutomaticAmericanoPointsUI {
            unscorePoint(.teamB)
            return
        }
        recordLocalOp(.rallyDecrement(.teamB))
        if timedClassicSetLocked, !activeSetIsSupplemental { return }
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
        if WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: sets, rules: rules) { return }
        let prev = sets[activeSetIndex].teamB
        guard prev > 0 else { return }
        sets[activeSetIndex].teamB = prev - 1
        undoRallyPointWinner(.teamB)
        WatchScoreHaptics.undo()
        scheduleLiveScoringSave()
    }

    func canUnscore(_ side: TeamSide) -> Bool {
        guard !isReadOnly else { return false }
        if usesBallCapPerSetUI, !usesAutomaticAmericanoPointsUI { return false }
        return WatchLiveScoringEngine.canUnscore(state: liveScoringEngineState(), side: side, rules: rules)
    }

    func unscorePoint(_ side: TeamSide) {
        guard !isReadOnly, !isSaving else { return }
        if usesBallCapPerSetUI, !usesAutomaticAmericanoPointsUI { return }
        let engineState = liveScoringEngineState()
        guard WatchLiveScoringEngine.canUnscore(state: engineState, side: side, rules: rules) else { return }
        recordLocalOp(.unscore(side))
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
        let result = WatchLiveScoringEngine.unscorePoint(state: engineState, side: side, rules: rules)
        guard result.changed else { return }
        applyLiveScoringEngineState(result.state)
        WatchScoreHaptics.undo()
        syncAutomaticChoiceSheets()
    }

    /// Clears modal scoring state before the review screen; flushes pending live save first.
    func prepareForMatchReview() async {
        pendingSetFormatChoiceIndex = nil
        allowsRemoteLiveScoringMerge = false
        await flushLiveScoringSnapshot()
        stopLiveScoringRemotePolling()
    }

    func resumeAfterMatchReview() {
        syncOptionalDeciderPendingAfterEnvelopeMerge()
        startLiveScoringRemotePolling()
        scheduleLiveScoringSave()
    }

    func cancelSetFormatChoice() {
        pendingSetFormatChoiceIndex = nil
        // Mandatory optional-decider: restore pending so scoring stays gated and dialog can reopen.
        syncOptionalDeciderPendingAfterEnvelopeMerge()
    }

    func confirmSetFormatNormal() {
        let pendingIdx = pendingSetFormatChoiceIndex
        pendingSetFormatChoiceIndex = nil
        let result = WatchLiveScoringEngine.applyOptionalDeciderFormat(
            state: liveScoringEngineState(),
            rules: rules,
            format: "REGULAR_SET"
        )
        if result.changed {
            applyLiveScoringEngineState(result.state)
            scheduleLiveScoringSave()
            return
        }
        // Pre-advance Bo3 prompt (index = next set before stepping onto it).
        guard let idx = pendingIdx else { return }
        optionalDeciderFormat = "REGULAR_SET"
        advanceToSet(index: idx, superTieBreak: false)
    }

    func confirmSetFormatSuper() {
        let pendingIdx = pendingSetFormatChoiceIndex
        pendingSetFormatChoiceIndex = nil
        let result = WatchLiveScoringEngine.applyOptionalDeciderFormat(
            state: liveScoringEngineState(),
            rules: rules,
            format: "SUPER_TIEBREAK"
        )
        if result.changed {
            applyLiveScoringEngineState(result.state)
            scheduleLiveScoringSave()
            return
        }
        guard let idx = pendingIdx else { return }
        optionalDeciderFormat = "SUPER_TIEBREAK"
        advanceToSet(index: idx, superTieBreak: true)
    }

    /// Call from Next Set — may set `pendingSetFormatChoiceIndex` instead of advancing.
    func beginAdvanceToNextSet() {
        guard !isReadOnly else { return }
        guard canAdvanceToNextSet() else { return }
        let next = activeSetIndex + 1
        if WatchLiveScoringEngine.shouldPromptOptionalDeciderBeforeAdvancing(
            to: next,
            state: liveScoringEngineState(),
            rules: rules
        ) {
            advanceToSet(index: next, superTieBreak: false)
            pendingSetFormatChoiceIndex = next
        } else {
            advanceToSet(index: next, superTieBreak: ruleMandatesSuperTieBreak(nextIndex: next))
        }
    }

    private func advanceToSet(index: Int, superTieBreak: Bool) {
        activeSetIndex = index
        timedClassicSetLocked = false
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
        pointWinnerLog = []
        scheduleLiveScoringSave()
    }

    private func appendRallyPointWinner(_ side: TeamSide) {
        guard usesRallyPointsServeGuide else { return }
        pointWinnerLog.append(side)
    }

    private func undoRallyPointWinner(_ side: TeamSide) {
        guard usesRallyPointsServeGuide else { return }
        if let last = pointWinnerLog.last, last == side {
            pointWinnerLog.removeLast()
        } else {
            pointWinnerLog = []
        }
    }

    /// Timer **STOPPED**: freeze partial classic set or open-ended points row (parity with web `freezeTimedSetAtPartialScore`).
    func lockTimedSetAtPartialScore() {
        guard !isReadOnly else { return }
        guard !activeSetIsSupplemental else { return }
        if usesBallCapPerSetUI, rules.isOpenEndedPointsPreset {
            ensureSetExists(activeSetIndex)
            let row = sets[activeSetIndex]
            guard row.teamA > 0 || row.teamB > 0 else { return }
            timedClassicSetLocked = true
            scheduleLiveScoringSave()
            return
        }
        lockTimedClassicSetAtPartialScore()
    }

    /// Mirrors `freezeTimedClassicSetAtPartialScore` in `core.ts`: no-op when nothing was
    /// played, already locked, or inside a (super) tie-break; resets the point state to 0:0.
    func lockTimedClassicSetAtPartialScore() {
        guard !isReadOnly else { return }
        guard rules.allowIncompleteRegularSetGames else { return }
        guard usesTennisSetRules, !isAmericano, !activeSetIsSupplemental else { return }
        guard !timedClassicSetLocked, !withinSetTieBreakMode else { return }
        guard let row = sets[safe: activeSetIndex], !row.isTieBreak else { return }
        let hasGameProgress = row.teamA > 0 || row.teamB > 0
        let hasPointProgress: Bool
        switch classicPointState {
        case .regular(let a, let b): hasPointProgress = a != .zero || b != .zero
        default: hasPointProgress = true
        }
        guard hasGameProgress || hasPointProgress else { return }
        timedClassicSetLocked = true
        classicPointState = .regular(a: .zero, b: .zero)
        classicPointsPlayedInGame = 0
        tieBreakA = 0
        tieBreakB = 0
        scheduleLiveScoringSave()
    }

    func clearTimedClassicSetLock() {
        guard !isReadOnly else { return }
        timedClassicSetLocked = false
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

    /// Matches `normalizePointState` in `liveScoring/core.ts`: legacy `deuce` is not used when GP is active.
    private func normalizeClassicPointStateForGoldenPointRules() {
        guard rules.isGoldenPointActive(deuceCount: deuceCount), usesTennisSetRules, !usesBallCapPerSetUI else { return }
        if case .deuce = classicPointState {
            classicPointState = .regular(a: .forty, b: .forty)
        }
    }

    /// True when the rule mandates a super-TB decider at `nextIndex` and the prerequisite
    /// (previous official sets tied with > 0 wins) is met — no user prompt needed.
    private func ruleMandatesSuperTieBreak(nextIndex: Int) -> Bool {
        guard usesTennisSetRules, !usesBallCapPerSetUI else { return false }
        if sets[safe: nextIndex].map({ $0.resolvedRole != .official }) ?? false { return false }
        guard let mandated = rules.superTieBreakReplacesDeciderAtIndex, mandated == nextIndex else {
            return false
        }
        return WatchLiveScoringEngine.previousOfficialSetsTiedBeforeIndex(
            nextIndex,
            state: liveScoringEngineState()
        )
    }

    private func liveScoringEngineState() -> WatchLiveScoringState {
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
            deuceCount: deuceCount
        )

        return WatchLiveScoringState(
            activeSetIndex: activeSetIndex,
            mode: usesBallCapPerSetUI ? .points : .classic,
            sets: sets,
            classic: usesBallCapPerSetUI ? nil : classic,
            firstServerTeam: firstServerTeam,
            firstServerDoublesPlayerIndex: firstServerDoublesPlayerIndex,
            pointsServeRotation: pointsServeRotation,
            matchStartCourtEndsSwapped: matchStartCourtEndsSwapped == true ? true : nil,
            matchStartTeamASidesMirrored: matchStartTeamASidesMirrored == true ? true : nil,
            matchStartTeamBSidesMirrored: matchStartTeamBSidesMirrored == true ? true : nil,
            serveGuideSkipped: serveGuideSkipped ? true : nil,
            optionalDeciderFormat: optionalDeciderFormat,
            automaticRecordMode: automaticRecordMode,
            automaticEarlyFinish: automaticEarlyFinish ? true : nil,
            automaticOpenEndedSetConfirmed: automaticOpenEndedSetConfirmed ? true : nil,
            timedClassicSetLocked: timedClassicSetLocked ? true : nil,
            pointWinnerLog: pointWinnerLog.isEmpty ? nil : pointWinnerLog,
            officiatingLetPending: officiatingLetPending ? true : nil
        )
    }

    private func applyLiveScoringEngineState(_ state: WatchLiveScoringState) {
        sets = state.sets
        activeSetIndex = state.activeSetIndex
        optionalDeciderFormat = state.optionalDeciderFormat
        automaticRecordMode = state.automaticRecordMode
        automaticEarlyFinish = state.automaticEarlyFinish == true
        automaticOpenEndedSetConfirmed = state.automaticOpenEndedSetConfirmed == true
        timedClassicSetLocked = state.timedClassicSetLocked == true
        pointWinnerLog = state.pointWinnerLog ?? []
        syncAutomaticChoiceSheets()

        if let classic = state.classic {
            classicPointState = classic.pointState.padelPointState
            withinSetTieBreakMode = classic.withinSetTieBreak
            tieBreakA = classic.tieBreakA
            tieBreakB = classic.tieBreakB
            classicPointsPlayedInGame = classic.classicPointsPlayedInGame
            deuceCount = classic.deuceCount
            normalizeClassicPointStateForGoldenPointRules()
        } else {
            classicPointState = .regular(a: .zero, b: .zero)
            withinSetTieBreakMode = false
            tieBreakA = 0
            tieBreakB = 0
            classicPointsPlayedInGame = 0
            deuceCount = 0
        }
    }

    func scorePoint(_ side: TeamSide) {
        guard !isReadOnly, !isSaving else { return }
        if !activeSetIsSupplemental, blocksFurtherOfficialTaps() { return }
        if usesTennisSetRules, !activeSetIsSupplemental, timedClassicSetLocked { return }
        recordLocalOp(.score(side))
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
        let result = WatchLiveScoringEngine.scorePoint(
            state: liveScoringEngineState(),
            side: side,
            rules: rules
        )
        guard result.changed else { return }
        applyLiveScoringEngineState(result.state)
        WatchScoreHaptics.point()
        applyEngineAutoAdvanceAfterMutation()
        syncAutomaticChoiceSheets()
    }

    func nextSet() {
        beginAdvanceToNextSet()
    }

    func canAdvanceToNextSet() -> Bool {
        // Automatic uses Continue/End sheet instead of Next set.
        if rules.isClassicAutomaticRelaxed { return false }
        if WatchComputeMatchWinner.isMatchDecidedForLiveScoring(sets: sets, rules: rules) { return false }
        let next = activeSetIndex + 1
        let cap = max(rules.maxSetsPlayed, 1)
        if next >= cap { return false }
        if isAmericano { return next < sets.count }
        let row = sets[safe: activeSetIndex]
        let supplemental = row.map { $0.resolvedRole != .official } ?? false
        if !supplemental, !activeSetIsCompleted() { return false }
        if rawFixedNumberOfSets > 0, next >= rawFixedNumberOfSets {
            return sets[safe: next].map { $0.resolvedRole != .official } ?? false
        }
        return true
    }

    /// Mirrors `canAdvanceLiveSet` from `core.ts`. Validates the active set is actually finished.
    private func activeSetIsCompleted() -> Bool {
        if isAmericano {
            return WatchComputeMatchWinner.isPointsOfficialBudgetExhausted(
                activeSet: sets[safe: activeSetIndex],
                rules: rules
            )
        }
        if usesBallCapPerSetUI, rules.isOpenEndedPointsPreset {
            guard let set = sets[safe: activeSetIndex] else { return false }
            return timedClassicSetLocked && (set.teamA > 0 || set.teamB > 0)
        }
        return WatchLiveScoringEngine.activeSetIsCompleted(state: liveScoringEngineState(), rules: rules)
    }

    private func applyEngineAutoAdvanceAfterMutation() {
        if rules.isClassicAutomaticRelaxed { return }
        guard usesTennisSetRules, !isAmericano else { return }
        if sets[safe: activeSetIndex].map({ $0.resolvedRole != .official }) ?? false { return }
        let outcome = WatchLiveScoringEngine.autoAdvanceCompletedSetsAllowingOptionalDeciderPrompt(
            state: liveScoringEngineState(),
            rules: rules
        )
        applyLiveScoringEngineState(outcome.state)
        if let idx = outcome.pendingOptionalDeciderAtSetIndex {
            // Parity with `core.ts` `autoAdvanceCompletedSets`: the server steps onto the empty
            // decider row and gates scoring there, so the PATCHed state must already be on it.
            advanceToSet(index: idx, superTieBreak: false)
            pendingSetFormatChoiceIndex = idx
        }
    }

    /// Rally best-of sets (`isRallyGame`): the backend auto-advances a completed game
    /// (`core.ts` `autoAdvanceCompletedSets`), so mirror it or the PATCH leaves the graph.
    private func applyRallyAutoAdvanceAfterMutation() {
        guard rules.isRallyGame, !activeSetIsSupplemental else { return }
        var guardCount = 0
        while guardCount < 8, canAdvanceToNextSet() {
            guardCount += 1
            let next = activeSetIndex + 1
            if WatchLiveScoringEngine.shouldPromptOptionalDeciderBeforeAdvancing(
                to: next,
                state: liveScoringEngineState(),
                rules: rules
            ) {
                advanceToSet(index: next, superTieBreak: false)
                pendingSetFormatChoiceIndex = next
                return
            }
            advanceToSet(index: next, superTieBreak: ruleMandatesSuperTieBreak(nextIndex: next))
        }
    }

    private func syncAutomaticChoiceSheets() {
        let state = liveScoringEngineState()
        showAutomaticRecordModeChoice = WatchAutomaticFlexible.automaticRecordModeChoicePending(
            state: state,
            rules: rules
        )
        let continuePending = WatchLiveScoringEngine.optionalContinueSetChoicePending(
            state: state,
            rules: rules
        )
        showAutomaticContinueChoice = continuePending && !optionalDeciderChoicePending()
        if optionalDeciderChoicePending(), let decIdx = officialDeciderIndex() {
            pendingSetFormatChoiceIndex = decIdx
        }
    }

    func confirmAutomaticRecordMode(_ mode: WatchAutomaticFlexible.RecordMode) {
        guard !isReadOnly, !isSaving else { return }
        let result = WatchLiveScoringEngine.applyAutomaticRecordMode(
            state: liveScoringEngineState(),
            rules: rules,
            mode: mode
        )
        guard result.changed else { return }
        applyLiveScoringEngineState(result.state)
        scheduleLiveScoringSave()
    }

    func confirmAutomaticContinue(_ choice: WatchAutomaticFlexible.ContinueChoice) {
        guard !isReadOnly, !isSaving else { return }
        let before = liveScoringEngineState()
        if choice == .continueSet {
            let next = before.activeSetIndex + 1
            if WatchLiveScoringEngine.shouldPromptOptionalDeciderBeforeAdvancing(
                to: next,
                state: before,
                rules: rules
            ) {
                // Advance onto empty decider via engine, then format sheet.
            }
        }
        let result = WatchLiveScoringEngine.applyAutomaticContinueChoice(
            state: before,
            rules: rules,
            choice: choice
        )
        guard result.changed else { return }
        applyLiveScoringEngineState(result.state)
        if choice == .continueSet, optionalDeciderChoicePending(), let decIdx = officialDeciderIndex() {
            pendingSetFormatChoiceIndex = decIdx
        }
        scheduleLiveScoringSave()
    }

    func confirmAutomaticOpenEndedSet() {
        guard !isReadOnly, !isSaving else { return }
        let result = WatchLiveScoringEngine.applyAutomaticOpenEndedSetConfirm(
            state: liveScoringEngineState(),
            rules: rules
        )
        guard result.changed else { return }
        applyLiveScoringEngineState(result.state)
        scheduleLiveScoringSave()
    }

    private func nextEditableSetIndex() -> Int {
        for (idx, set) in sets.enumerated() where set.teamA == 0 && set.teamB == 0 {
            return idx
        }
        return max(0, sets.count - 1)
    }

    /// Minimum rallies needed to reach this regular score (lower bound when counter is unknown).
    private static func minRalliesForRegularScore(_ a: PadelPoint, _ b: PadelPoint) -> Int {
        let sa: Int =
            switch a {
            case .zero: 0
            case .fifteen: 1
            case .thirty: 2
            case .forty: 3
            }
        let sb: Int =
            switch b {
            case .zero: 0
            case .fifteen: 1
            case .thirty: 2
            case .forty: 3
            }
        return sa + sb
    }

    func requestLiveScoringSave() {
        scheduleLiveScoringSave()
    }

    func applyLiveScoringEnvelopeIfNewer(_ envelope: WatchLiveScoringEnvelope?) {
        applyLiveScoringEnvelopeIfNewer(envelope, force: false)
    }

    func applyLiveScoringEnvelopeIfNewer(_ envelope: WatchLiveScoringEnvelope?, force: Bool) {
        applyLiveScoringEnvelope(envelope, force: force, requireNewer: true)
    }

    /// `requireNewer == false` re-syncs to the server even at the same revision (used after
    /// the server rejected a PATCH so the board never keeps a state the server refused).
    private func applyLiveScoringEnvelope(_ envelope: WatchLiveScoringEnvelope?, force: Bool, requireNewer: Bool) {
        guard force || allowsRemoteLiveScoringMerge else { return }
        guard let envelope, envelope.isSupported else { return }
        if envelope.revision < liveScoringRevision { return }
        if requireNewer, envelope.revision == liveScoringRevision { return }
        if envelope.state == nil {
            liveSaveTask?.cancel()
            liveSaveTask = nil
            pendingLocalOps.removeAll()
            ackedScoreGeneration = localScoreGeneration
            NetworkDeliveryOutbox.shared.removeLivePatch(matchId: matchId)
            if match?.metadata?.liveScoring?.revision == envelope.revision {
                liveScoringRevision = envelope.revision
            } else {
                Task { await load() }
            }
            return
        }

        // A foreign write wins over queued edits. Never silently rebase an old score
        // onto a newer revision; the scorer must make a fresh correction.
        if !force, hasUnackedLocalEdits {
            if let inFlightClientMessageId, envelope.lastClientMessageId == inFlightClientMessageId { return }
            liveSaveTask?.cancel()
            liveSaveTask = nil
            pendingLocalOps.removeAll()
            ackedScoreGeneration = localScoreGeneration
            NetworkDeliveryOutbox.shared.removeLivePatch(matchId: matchId)
            error = APIError.liveScoringRevisionMismatch(revision: envelope.revision, serverEnvelope: envelope)
        }

        guard let state = envelope.state else {
            liveScoringRevision = max(liveScoringRevision, envelope.revision)
            if force {
                ackedScoreGeneration = localScoreGeneration
                pendingLocalOps.removeAll()
            }
            return
        }
        maybeQueueRemoteWriterAttribution(envelope: envelope)
        liveScoringRevision = envelope.revision
        applyRemoteLiveScoringState(state)
    }

    private func applyRemoteLiveScoringState(_ state: WatchLiveScoringState) {

        sets = state.sets.isEmpty ? [WatchSetWrite(teamA: 0, teamB: 0)] : state.sets
        activeSetIndex = max(0, min(sets.count - 1, state.activeSetIndex))
        if let f = state.optionalDeciderFormat, f == "REGULAR_SET" || f == "SUPER_TIEBREAK" {
            optionalDeciderFormat = f
        } else {
            optionalDeciderFormat = nil
        }
        if let mode = state.automaticRecordMode,
           mode == WatchAutomaticFlexible.RecordMode.games.rawValue
            || mode == WatchAutomaticFlexible.RecordMode.americanoPoints.rawValue {
            automaticRecordMode = mode
        } else if let inferred = WatchAutomaticFlexible.inferAutomaticRecordMode(
            state: state,
            rules: rules
        ) {
            automaticRecordMode = inferred.rawValue
        } else if let metaMode = match?.metadata?.automaticRecordMode,
                  metaMode == WatchAutomaticFlexible.RecordMode.games.rawValue
                    || metaMode == WatchAutomaticFlexible.RecordMode.americanoPoints.rawValue {
            automaticRecordMode = metaMode
        } else {
            automaticRecordMode = nil
        }
        automaticEarlyFinish = state.automaticEarlyFinish == true
        automaticOpenEndedSetConfirmed = state.automaticOpenEndedSetConfirmed == true
        timedClassicSetLocked = state.timedClassicSetLocked == true
        syncOptionalDeciderPendingAfterEnvelopeMerge()
        syncAutomaticChoiceSheets()

        if let classic = state.classic {
            classicPointState = classic.pointState.padelPointState
            withinSetTieBreakMode = classic.withinSetTieBreak
            tieBreakA = classic.tieBreakA
            tieBreakB = classic.tieBreakB
            classicPointsPlayedInGame = classic.classicPointsPlayedInGame
            deuceCount = classic.deuceCount
            normalizeClassicPointStateForGoldenPointRules()
        } else {
            classicPointState = .regular(a: .zero, b: .zero)
            withinSetTieBreakMode = false
            tieBreakA = 0
            tieBreakB = 0
            classicPointsPlayedInGame = 0
            deuceCount = 0
        }

        if state.serveGuideSkipped == true {
            serveGuideSkipped = true
            firstServerTeam = nil
            firstServerDoublesPlayerIndex = nil
            pointsServeRotation = nil
            matchStartCourtEndsSwapped = nil
            matchStartTeamASidesMirrored = nil
            matchStartTeamBSidesMirrored = nil
        } else {
            if let skipped = state.serveGuideSkipped, !skipped {
                serveGuideSkipped = false
            }
            if let first = state.firstServerTeam {
                firstServerTeam = first
                serveGuideSkipped = false
            }
            if let idx = state.firstServerDoublesPlayerIndex { firstServerDoublesPlayerIndex = idx }
            if let rot = state.pointsServeRotation { pointsServeRotation = rot }
            matchStartCourtEndsSwapped = state.matchStartCourtEndsSwapped == true ? true : nil
            matchStartTeamASidesMirrored = state.matchStartTeamASidesMirrored == true ? true : nil
            matchStartTeamBSidesMirrored = state.matchStartTeamBSidesMirrored == true ? true : nil
        }
        pointWinnerLog = state.pointWinnerLog ?? []
        officiatingLetPending = state.officiatingLetPending == true
        cacheServeSeedToOfflineStore()
        normalizeLiveSetsAfterDecisionIfNeeded()
        ackedScoreGeneration = localScoreGeneration
        pendingLocalOps.removeAll()
    }

    func dismissRemoteWriterAttribution() {
        showRemoteWriterAttribution = false
    }

    private func maybeQueueRemoteWriterAttribution(envelope: WatchLiveScoringEnvelope) {
        guard !suppressRemoteWriterAttribution else { return }
        guard envelope.revision > lastAttributedRemoteRevision else { return }
        guard envelopeIsFromAnotherWriter(envelope) else { return }
        lastAttributedRemoteRevision = envelope.revision
        remoteWriterAttributionSignal += 1
        showRemoteWriterAttribution = true
    }

    private func envelopeIsFromAnotherWriter(_ envelope: WatchLiveScoringEnvelope) -> Bool {
        guard let current = KeychainHelper.shared.readUserId(), !current.isEmpty else { return false }
        if let writer = envelope.writerUserId, !writer.isEmpty, writer != current {
            return true
        }
        guard let remoteClientMessageId = envelope.lastClientMessageId, !remoteClientMessageId.isEmpty else {
            return false
        }
        if remoteClientMessageId == lastAcknowledgedOwnClientMessageId || remoteClientMessageId == inFlightClientMessageId { return false }
        if remoteClientMessageId == NetworkDeliveryOutbox.shared.pendingClientMessageId(forMatchId: matchId) {
            return false
        }
        return envelope.writerUserId == current
    }

    private func noteAcknowledgedOwnClientMessageId(_ envelope: WatchLiveScoringEnvelope?) {
        guard let clientMessageId = envelope?.lastClientMessageId, !clientMessageId.isEmpty else { return }
        lastAcknowledgedOwnClientMessageId = clientMessageId
    }

    func commitServeSetup(
        team: TeamSide,
        playerIndex: Int,
        pointsRotation: String?,
        courtEndsSwapped: Bool,
        teamASidesMirrored: Bool,
        teamBSidesMirrored: Bool
    ) {
        firstServerTeam = team
        firstServerDoublesPlayerIndex = playerIndex
        pointsServeRotation = pointsRotation
        matchStartCourtEndsSwapped = courtEndsSwapped ? true : nil
        matchStartTeamASidesMirrored = teamASidesMirrored ? true : nil
        matchStartTeamBSidesMirrored = teamBSidesMirrored ? true : nil
        serveGuideSkipped = false
        cacheServeSeedToOfflineStore()
        scheduleLiveScoringSave()
    }

    func skipServeGuide() {
        serveGuideSkipped = true
        firstServerTeam = nil
        firstServerDoublesPlayerIndex = nil
        pointsServeRotation = nil
        matchStartCourtEndsSwapped = nil
        matchStartTeamASidesMirrored = nil
        matchStartTeamBSidesMirrored = nil
        cacheServeSeedToOfflineStore()
        scheduleLiveScoringSave()
    }

    func hideServeGuideForMatch() {
        serveGuideSkipped = true
        cacheServeSeedToOfflineStore()
        scheduleLiveScoringSave()
    }

    func markServeCoachToastShown() {
        showedFirstServeCoachToast = true
        cacheServeSeedToOfflineStore()
    }

    private func hydrateServeSeedFromOfflineCache() {
        guard let cached = WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId) else { return }
        firstServerTeam = cached.firstServerTeam
        firstServerDoublesPlayerIndex = cached.firstServerDoublesPlayerIndex
        pointsServeRotation = cached.pointsServeRotation
        matchStartCourtEndsSwapped = cached.matchStartCourtEndsSwapped
        matchStartTeamASidesMirrored = cached.matchStartTeamASidesMirrored
        matchStartTeamBSidesMirrored = cached.matchStartTeamBSidesMirrored
        serveGuideSkipped = cached.skipped
        showedFirstServeCoachToast = cached.showedFirstServeCoachToast
        if let cpp = cached.classicPointsPlayedInGame {
            classicPointsPlayedInGame = cpp
        }
    }

    private func cacheServeSeedToOfflineStore() {
        WatchServeGuideSessionStore.shared.save(
            gameId: gameId,
            matchId: matchId,
            record: offlineServeSeedRecord()
        )
    }

    private func offlineServeSeedRecord() -> WatchServeGuideSessionRecord {
        WatchServeGuideSessionRecord(
            firstServerTeam: firstServerTeam,
            firstServerDoublesPlayerIndex: firstServerDoublesPlayerIndex,
            pointsServeRotation: pointsServeRotation,
            matchStartCourtEndsSwapped: matchStartCourtEndsSwapped,
            matchStartTeamASidesMirrored: matchStartTeamASidesMirrored,
            matchStartTeamBSidesMirrored: matchStartTeamBSidesMirrored,
            skipped: serveGuideSkipped,
            classicPointsPlayedInGame: classicPointsPlayedInGame,
            showedFirstServeCoachToast: showedFirstServeCoachToast
        )
    }

    private func currentLiveScoringStateSnapshot() -> WatchLiveScoringState {
        makeLiveScoringState()
    }

    private func scheduleLiveScoringSave() {
        guard !isReadOnly else { return }
        guard !openEndedPresetBlocksLivePatch else { return }
        localScoreGeneration += 1
        liveSaveTask?.cancel()
        liveSaveTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: 350_000_000)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            await self?.saveLiveScoringNow(background: true)
        }
    }

    private func saveLiveScoringNow(background: Bool = false, applyEnvelope: Bool = true) async {
        guard !isReadOnly else { return }
        guard !openEndedPresetBlocksLivePatch else { return }
        if let inFlight = liveSaveInFlightTask {
            // Background saves piggyback on the in-flight PATCH: its completion reschedules
            // when the generation moved on. Explicit flushes wait for it, then send.
            if background { return }
            await inFlight.value
        }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performLiveScoringSave(background: background, applyEnvelope: applyEnvelope)
        }
        liveSaveInFlightTask = task
        await task.value
        if liveSaveInFlightTask == task {
            liveSaveInFlightTask = nil
        }
    }

    private func performLiveScoringSave(background: Bool, applyEnvelope: Bool) async {
        liveSaveTask?.cancel()
        liveSaveTask = nil
        guard !isReadOnly else { return }
        let generationAtSend = localScoreGeneration
        let body = WatchPatchLiveScoringBody(
            state: makeLiveScoringState(),
            baseRevision: liveScoringRevision,
            clientMessageId: UUID().uuidString,
            opId: UUID().uuidString
        )
        inFlightClientMessageId = body.clientMessageId
        defer { if inFlightClientMessageId == body.clientMessageId { inFlightClientMessageId = nil } }
        do {
            let response = try await api.patchMatchLiveScoring(gameId: gameId, matchId: matchId, body: body)
            NetworkDeliveryOutbox.shared.removeLivePatch(matchId: matchId)
            if response.revision < liveScoringRevision { return }
            if response.revision >= liveScoringRevision { matchResultsVersion = response.resultsVersion }
            if let envelope = response.liveScoring {
                noteAcknowledgedOwnClientMessageId(envelope)
                if applyEnvelope {
                    if localScoreGeneration == generationAtSend {
                        applyLiveScoringEnvelopeIfNewer(envelope, force: true)
                        ackedScoreGeneration = generationAtSend
                        dropLocalOps(through: generationAtSend)
                    } else {
                        // Server holds exactly what we sent; newer local taps are a superset.
                        liveScoringRevision = max(liveScoringRevision, envelope.revision)
                        dropLocalOps(through: generationAtSend)
                        scheduleLiveScoringSave()
                    }
                } else {
                    liveScoringRevision = max(liveScoringRevision, envelope.revision)
                    ackedScoreGeneration = generationAtSend
                    dropLocalOps(through: generationAtSend)
                }
            } else {
                liveScoringRevision = max(liveScoringRevision, response.revision)
                dropLocalOps(through: generationAtSend)
                if applyEnvelope, localScoreGeneration != generationAtSend {
                    scheduleLiveScoringSave()
                } else {
                    ackedScoreGeneration = generationAtSend
                }
            }
            WatchSessionManager.shared.notifyScoreUpdated(
                gameId: gameId,
                matchId: matchId,
                revision: liveScoringRevision
            )
        } catch let api as APIError {
            if case .liveScoringRevisionMismatch(_, let serverEnvelope) = api {
                liveSaveHadConflict = true
                NetworkDeliveryOutbox.shared.removeLivePatch(matchId: matchId)
                guard let serverEnvelope else {
                    if applyEnvelope { await pollLiveScoringEnvelopeFromServer() }
                    return
                }
                if serverEnvelope.state == nil {
                    pendingLocalOps.removeAll()
                    ackedScoreGeneration = localScoreGeneration
                    await load()
                    return
                }
                if !applyEnvelope {
                    liveScoringRevision = max(liveScoringRevision, serverEnvelope.revision)
                    ackedScoreGeneration = generationAtSend
                    dropLocalOps(through: generationAtSend)
                    return
                }
                liveSaveTask?.cancel()
                liveSaveTask = nil
                pendingLocalOps.removeAll()
                ackedScoreGeneration = localScoreGeneration
                applyLiveScoringEnvelope(serverEnvelope, force: true, requireNewer: false)
                self.error = api
                return
            }
            if APIError.warrantsDeliveryRetry(api) {
                NetworkDeliveryOutbox.shared.enqueueLivePatch(gameId: gameId, matchId: matchId, body: body)
                return
            }
            await recoverFromRejectedLiveSave(error: api, background: background)
        } catch {
            if APIError.warrantsDeliveryRetry(error) {
                NetworkDeliveryOutbox.shared.enqueueLivePatch(gameId: gameId, matchId: matchId, body: body)
                return
            }
            await recoverFromRejectedLiveSave(error: error, background: background)
        }
    }

    /// The server refused the state (400 invalid sets / transition out of graph, 403…). Parity
    /// with the web (`persistLiveScoring.ts` → refresh): drop the rejected local edits and
    /// re-sync to the server envelope so remote merges are not blocked forever.
    private func recoverFromRejectedLiveSave(error: Error, background: Bool) async {
        NetworkDeliveryOutbox.shared.removeLivePatch(matchId: matchId)
        pendingLocalOps.removeAll()
        ackedScoreGeneration = localScoreGeneration
        if !background {
            self.error = error
        }
        await pollLiveScoringEnvelopeFromServer(requireNewer: false)
    }

    private func makeLiveScoringState() -> WatchLiveScoringState {
        liveScoringEngineState()
    }

    func markLetPending() {
        guard !isReadOnly, !isSaving, officiatingIsStrict else { return }
        guard !officiatingLetPending else { return }
        officiatingLetPending = true
        scheduleLiveScoringSave()
    }

    func confirmLetReplay() {
        guard !isReadOnly, !isSaving else { return }
        guard officiatingLetPending else { return }
        officiatingLetPending = false
        scheduleLiveScoringSave()
    }

    func kitchenFault(faultingTeam: TeamSide) {
        guard !isReadOnly, officiatingIsStrict else { return }
        guard !strictOfficiatingActionsDisabled else { return }
        let opponent = WatchOfficiatingEnforcement.opponentTeam(faultingTeam)
        awardStrictOfficiatingPoint(to: opponent)
    }

    func applyServiceFault() {
        guard !isReadOnly, officiatingIsStrict else { return }
        guard !strictOfficiatingActionsDisabled else { return }
        let server = resolvedServerTeamForOfficiating()
        awardStrictOfficiatingPoint(to: WatchOfficiatingEnforcement.opponentTeam(server))
    }

    private func resolvedServerTeamForOfficiating() -> TeamSide {
        let inputs = ServeGuideInputs.from(vm: self, hintsMode: .on)
        if let snap = ServeGuideEngine.compute(inputs) {
            return snap.serverTeam
        }
        return firstServerTeam ?? .teamA
    }

    private func awardStrictOfficiatingPoint(to side: TeamSide) {
        if usesBallCapPerSetUI {
            if side == .teamA {
                incrementAmericanoTeamA()
            } else {
                incrementAmericanoTeamB()
            }
        } else {
            scorePoint(side)
        }
    }

    func syncClassicPointsPlayedFromState() {
        guard usesTennisStyleServeGuide, !withinSetTieBreakMode, !activeSetIsSuperTieBreak, !activeSetIsSupplemental else {
            classicPointsPlayedInGame = 0
            return
        }
        switch classicPointState {
        case .regular(let a, let b):
            if a == .zero && b == .zero {
                classicPointsPlayedInGame = 0
            } else if classicPointsPlayedInGame > 0 {
                break
            } else {
                classicPointsPlayedInGame = Self.minRalliesForRegularScore(a, b)
            }
        case .deuce:
            classicPointsPlayedInGame = max(6, classicPointsPlayedInGame > 0 ? classicPointsPlayedInGame : 6)
        case .advantage:
            classicPointsPlayedInGame = max(7, classicPointsPlayedInGame > 0 ? classicPointsPlayedInGame : 7)
        }
    }

    @MainActor
    func liveWidgetTitleAndScoreLine() -> (String, String) {
        let title = String((game?.name ?? "Live").prefix(26))
        let row = sets[safe: activeSetIndex]
        let ga = row?.teamA ?? 0
        let gb = row?.teamB ?? 0
        let score: String
        if usesBallCapPerSetUI {
            score = "\(ga)-\(gb)"
        } else if withinSetTieBreakMode {
            score = "\(tieBreakA)-\(tieBreakB)"
        } else {
            score = "\(ga)-\(gb)"
        }
        return (title, score)
    }
}

extension MatchScoringViewModel: LiveScoringSessionSink {}
