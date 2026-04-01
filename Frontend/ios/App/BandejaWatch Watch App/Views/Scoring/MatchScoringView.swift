import SwiftUI

struct MatchScoringView: View {
    let gameId: String
    let matchId: String
    @State private var vm: MatchScoringViewModel
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
                MatchReviewView(
                    vm: vm,
                    onBack: { isReviewing = false },
                    onFinish: saveAndDismiss
                )
            } else if vm.isAmericano {
                AmericanoScoringView(vm: vm, onFinish: finish)
            } else {
                ClassicScoringView(vm: vm, onFinish: finish)
            }
        }
        .navigationTitle(scoringNavTitle)
        .task { await vm.load() }
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
                        HStack(alignment: .center, spacing: 6) {
                            HStack(spacing: 3) {
                                ForEach(team.players, id: \.userId) { p in
                                    WatchPlayerAvatarView(user: p.user, size: 20, role: nil)
                                }
                            }
                            Text(team.players.map(\.user.displayName).joined(separator: " / "))
                                .font(.caption2)
                                .lineLimit(2)
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
        isReviewing = true
    }

    private func saveAndDismiss() {
        Task {
            await vm.saveCurrentSets()
            if vm.error == nil { dismiss() }
        }
    }
}
