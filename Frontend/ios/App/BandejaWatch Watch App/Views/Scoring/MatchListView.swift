import SwiftUI

struct MatchListView: View {
    let gameId: String
    @State private var vm: ScoringViewModel
    @Bindable private var workoutManager = WorkoutManager.shared
    @Bindable private var workoutOutbox = WorkoutSyncOutbox.shared
    @Bindable private var scoringOutbox = ScoringOutbox.shared
    @Bindable private var networkMonitor = NetworkMonitor.shared
    @Environment(Router.self) private var router
    @Environment(WatchPreferencesStore.self) private var prefs

    init(gameId: String) {
        self.gameId = gameId
        _vm = State(initialValue: ScoringViewModel(gameId: gameId))
    }

    var body: some View {
        let lang = prefs.uiLanguageCode
        Group {
            if vm.isLoading && vm.results == nil {
                ProgressView(WatchCopy.loadingEllipsis(lang))
            } else if let error = vm.error, vm.results == nil {
                VStack(spacing: 8) {
                    Text(error.localizedDescription).font(.caption2).multilineTextAlignment(.center)
                    Button(WatchCopy.retry(lang)) { Task { await vm.load() } }
                }
            } else {
                content
            }
        }
        .navigationTitle(WatchCopy.matches(lang))
        .task(id: gameId) {
            await WorkoutManager.shared.recoverIfNeeded()
            await vm.load()
            if !vm.isFinal {
                await WorkoutManager.shared.startIfNeeded(gameId: gameId, isIndoor: true)
            }
        }
        .onDisappear { vm.stopPolling() }
        .safeAreaInset(edge: .top, spacing: 0) {
            if workoutManager.isActive, workoutManager.activeGameId == gameId, !workoutManager.authDenied {
                WorkoutMetricsBar(
                    lang: lang,
                    calories: workoutManager.activeCalories,
                    heartRate: workoutManager.heartRate,
                    elapsedSeconds: workoutManager.elapsedSeconds,
                    sessionState: workoutManager.sessionState,
                    isOffline: !networkMonitor.isConnected,
                    onTogglePause: { workoutManager.togglePauseResume() }
                )
                .frame(maxWidth: .infinity)
                .background(.ultraThinMaterial)
            }
        }
    }

    private var matchesByRound: [(round: WatchRound, matches: [WatchMatch])] {
        guard let rounds = vm.results?.rounds else { return [] }
        return rounds
            .sorted { $0.roundNumber < $1.roundNumber }
            .compactMap { r in
                let ms = vm.myMatches
                    .filter { $0.round.id == r.id }
                    .map(\.match)
                    .sorted { $0.matchNumber < $1.matchNumber }
                return ms.isEmpty ? nil : (r, ms)
            }
    }

    private var content: some View {
        List {
            if workoutOutbox.hasPending(forGameId: gameId) {
                Text(WatchCopy.workoutBandejaSyncPending(prefs.uiLanguageCode))
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .listRowBackground(Color.clear)
            }
            if scoringOutbox.hasPending(forGameId: gameId) {
                Text(WatchCopy.scoresSyncPending(prefs.uiLanguageCode))
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .listRowBackground(Color.clear)
            }
            if vm.postFinalizeHint == .refreshFailed {
                Text(WatchCopy.resultsRefreshFailed(prefs.uiLanguageCode))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
            if vm.postFinalizeHint == .serverNotYetFinal {
                Text(WatchCopy.resultsServerProcessing(prefs.uiLanguageCode))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }

            if vm.myMatches.isEmpty {
                Text(WatchCopy.waitingForRound(prefs.uiLanguageCode))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ForEach(matchesByRound, id: \.round.id) { group in
                Section(WatchCopy.roundSection(prefs.uiLanguageCode, number: group.round.roundNumber)) {
                    ForEach(group.matches, id: \.id) { match in
                        MatchResultCard(
                            roundNumber: group.round.roundNumber,
                            match: match,
                            isCurrent: vm.latestActiveMatchId == match.id,
                            isFinal: vm.isFinal
                        ) {
                            router.navigate(to: .scoringMatch(gameId: gameId, matchId: match.id))
                        }
                    }
                }
            }

            if vm.canFinalizeResults {
                Button(vm.isFinalizing ? WatchCopy.finalizingResults(prefs.uiLanguageCode) : WatchCopy.finalizeResults(prefs.uiLanguageCode)) {
                    Task { await vm.finalizeResults() }
                }
                .disabled(vm.isFinalizing)
                .buttonStyle(.borderedProminent)
            }

            if vm.isFinal, !vm.sortedOutcomes.isEmpty {
                Section(WatchCopy.outcomes(prefs.uiLanguageCode)) {
                    ForEach(Array(vm.sortedOutcomes.enumerated()), id: \.offset) { _, outcome in
                        HStack(spacing: 6) {
                            Text("#\(outcome.position ?? 0)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if let u = outcome.user {
                                WatchPlayerAvatarView(user: u, size: 22, role: nil)
                                Text(u.displayName)
                                    .font(.caption2)
                                    .lineLimit(1)
                            } else {
                                Text(outcome.userId)
                                    .font(.caption2)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Text("\(outcome.wins)-\(outcome.losses)-\(outcome.ties)")
                                .font(.caption2.monospacedDigit())
                        }
                    }
                }
            }
        }
        .refreshable {
            await vm.refresh()
            await ScoringOutbox.shared.flush()
            await WorkoutSyncOutbox.shared.flush()
        }
    }
}
