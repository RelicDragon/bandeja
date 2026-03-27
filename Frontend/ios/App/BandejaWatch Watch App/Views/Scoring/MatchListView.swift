import SwiftUI

struct MatchListView: View {
    let gameId: String
    @State private var vm: ScoringViewModel
    @Environment(Router.self) private var router
    @Environment(WatchPreferencesStore.self) private var prefs

    init(gameId: String) {
        self.gameId = gameId
        _vm = State(initialValue: ScoringViewModel(gameId: gameId))
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.results == nil {
                ProgressView(WatchCopy.loadingEllipsis(prefs.uiLanguageCode))
            } else if let error = vm.error, vm.results == nil {
                VStack(spacing: 8) {
                    Text(error.localizedDescription).font(.caption2).multilineTextAlignment(.center)
                    Button(WatchCopy.retry(prefs.uiLanguageCode)) { Task { await vm.load() } }
                }
            } else {
                content
            }
        }
        .navigationTitle(WatchCopy.matches(prefs.uiLanguageCode))
        .task { await vm.load() }
        .onDisappear { vm.stopPolling() }
    }

    private var content: some View {
        List {
            if vm.myMatches.isEmpty {
                Text(WatchCopy.waitingForRound(prefs.uiLanguageCode))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ForEach(vm.myMatches, id: \.match.id) { item in
                MatchResultCard(
                    roundNumber: item.round.roundNumber,
                    match: item.match,
                    isCurrent: vm.latestActiveMatchId == item.match.id,
                    isFinal: vm.isFinal,
                    canEdit: vm.canEditMatch(item.match)
                ) {
                    router.navigate(to: .scoringMatch(gameId: gameId, matchId: item.match.id))
                }
            }

            if vm.canFinalizeResults {
                Button(WatchCopy.finalizeResults(prefs.uiLanguageCode)) {
                    Task { await vm.finalizeResults() }
                }
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
        .refreshable { await vm.refresh() }
    }
}
