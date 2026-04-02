import SwiftUI

struct MatchScoringView: View {
    let gameId: String
    let matchId: String
    @State private var vm: MatchScoringViewModel
    @Bindable private var workoutManager = WorkoutManager.shared
    @Bindable private var networkMonitor = NetworkMonitor.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var isReviewing = false

    init(gameId: String, matchId: String) {
        self.gameId = gameId
        self.matchId = matchId
        _vm = State(initialValue: MatchScoringViewModel(gameId: gameId, matchId: matchId))
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.match == nil {
                ProgressView(WatchCopy.loadingEllipsis(prefs.uiLanguageCode))
            } else if let error = vm.error, vm.match == nil {
                Text(error.localizedDescription).font(.caption2)
            } else if vm.isReadOnly, vm.match != nil {
                readOnlyMatchContent
            } else if isReviewing {
                VStack(spacing: 6) {
                    if !networkMonitor.isConnected {
                        Label(WatchCopy.offline(prefs.uiLanguageCode), systemImage: "wifi.slash")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                            .frame(maxWidth: .infinity)
                    }
                    MatchReviewView(
                        vm: vm,
                        onBack: { isReviewing = false },
                        onFinish: saveAndDismiss
                    )
                }
            } else {
                VStack(spacing: 6) {
                    if !networkMonitor.isConnected {
                        Label(WatchCopy.offline(prefs.uiLanguageCode), systemImage: "wifi.slash")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                            .frame(maxWidth: .infinity)
                    }
                    if vm.isAmericano {
                        AmericanoScoringView(vm: vm, onFinish: finish)
                    } else {
                        ClassicScoringView(vm: vm, onFinish: finish)
                    }
                }
            }
        }
        .navigationTitle(scoringNavTitle)
        .task { await vm.load() }
        .safeAreaInset(edge: .top, spacing: 0) {
            if workoutManager.isActive, workoutManager.activeGameId == gameId, !workoutManager.authDenied {
                WorkoutMetricsBar(
                    lang: prefs.uiLanguageCode,
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

    private var scoringNavTitle: String {
        let lang = prefs.uiLanguageCode
        if let r = vm.round?.roundNumber, let m = vm.match?.matchNumber {
            return WatchCopy.roundMatch(lang, round: r, match: m)
        }
        return WatchCopy.match(lang)
    }

    private var readOnlyMatchContent: some View {
        let lang = prefs.uiLanguageCode
        return ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(readOnlyReason(lang))
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(.secondary)
                if let m = vm.match {
                    ForEach(m.sortedTeams, id: \.id) { team in
                        HStack(alignment: .top, spacing: 6) {
                            HStack(spacing: 3) {
                                ForEach(team.players, id: \.userId) { p in
                                    WatchPlayerAvatarView(user: p.user, size: 20, role: nil)
                                }
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(team.players, id: \.userId) { p in
                                    Text(p.user.displayName)
                                        .font(.caption2)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.75)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    if !m.sets.isEmpty {
                        Text(readOnlySetsLine(m))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.tertiary)
                    }
                }
                Button(WatchCopy.close(lang)) { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 4)
        }
    }

    private func readOnlyReason(_ lang: String) -> String {
        if vm.game?.resultsStatus == "FINAL" {
            return WatchCopy.viewOnlyFinal(lang)
        }
        return WatchCopy.viewOnlyNotOnMatch(lang)
    }

    private func readOnlySetsLine(_ m: WatchMatch) -> String {
        m.sets
            .sorted { $0.setNumber < $1.setNumber }
            .map { "\($0.teamAScore)-\($0.teamBScore)" }
            .joined(separator: "  ")
    }

    private func finish() {
        vm.prepareForMatchReview()
        isReviewing = true
    }

    private func saveAndDismiss() {
        Task {
            await vm.saveCurrentSets()
            if vm.error == nil { dismiss() }
        }
    }
}
