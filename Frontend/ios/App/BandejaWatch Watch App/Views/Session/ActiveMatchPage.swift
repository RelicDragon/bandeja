import SwiftUI

struct ActiveMatchPage: View {
    let gameId: String
    let matchId: String
    @State private var vm: MatchScoringViewModel
    @Environment(ActiveSessionManager.self) private var session
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var isReviewing = false
    @State private var lastFinishSignal = 0
    @State private var showReadOnlyFinishAlert = false

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
                    MatchReviewView(
                        vm: vm,
                        onBack: { isReviewing = false },
                        onFinish: saveAndFinishSession
                    )
                }
            } else {
                VStack(spacing: 6) {
                    if vm.isAmericano {
                        AmericanoScoringView(vm: vm, onFinish: finish)
                    } else {
                        ClassicScoringView(vm: vm, onFinish: finish)
                    }
                }
            }
        }
        .navigationTitle(scoringNavTitle)
        .task(id: matchId) { await vm.load() }
        .onChange(of: session.finishMatchSignal) { _, newVal in
            guard newVal > lastFinishSignal else { return }
            lastFinishSignal = newVal
            if vm.isReadOnly || vm.match == nil {
                showReadOnlyFinishAlert = true
                return
            }
            vm.prepareForMatchReview()
            isReviewing = true
        }
        .alert(WatchCopy.finishMatch(prefs.uiLanguageCode), isPresented: $showReadOnlyFinishAlert) {
            Button(WatchCopy.close(prefs.uiLanguageCode), role: .cancel) {}
        } message: {
            Text(WatchCopy.sessionCannotFinishReadOnly(prefs.uiLanguageCode))
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

    private func saveAndFinishSession() {
        Task {
            await vm.saveCurrentSets()
            if vm.error == nil {
                await session.finishMatchAfterSave()
            }
        }
    }
}
