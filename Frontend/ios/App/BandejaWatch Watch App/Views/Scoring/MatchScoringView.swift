import SwiftUI

struct MatchScoringView: View {
    let gameId: String
    let matchId: String
    @State private var vm: MatchScoringViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(WatchPreferencesStore.self) private var prefs
    @Environment(WatchServeHintsSettingsStore.self) private var hintsStore
    @State private var isReviewing = false
    @State private var forceServeGate = false
    @State private var page = 0

    init(gameId: String, matchId: String) {
        self.gameId = gameId
        self.matchId = matchId
        _vm = State(initialValue: MatchScoringViewModel(gameId: gameId, matchId: matchId))
    }

    private var lang: String { prefs.uiLanguageCode }

    private var needsServeSetup: Bool {
        guard vm.match != nil, !vm.isReadOnly, vm.usesTennisStyleServeGuide else { return false }
        if forceServeGate { return true }
        return vm.needsServeSetup
    }

    private var showServeGuidePage: Bool {
        WatchServeGuideSnapshot.showGuidePage(
            vm: vm,
            hintsMode: hintsStore.mode,
            needsServeSetup: needsServeSetup
        )
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.match == nil {
                ProgressView(WatchCopy.loadingEllipsis(lang))
            } else if let error = vm.error, vm.match == nil {
                Text(error.localizedDescription).font(.caption2)
            } else if vm.isReadOnly, vm.match != nil {
                readOnlyMatchContent
            } else if isReviewing {
                VStack(spacing: 6) {
                    MatchReviewView(
                        vm: vm,
                        onBack: { isReviewing = false },
                        onFinish: saveAndDismiss
                    )
                }
            } else {
                scoringPager
            }
        }
        .navigationTitle(scoringNavTitle)
        .toolbar {
            if !isReviewing, !vm.isReadOnly, vm.match != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(WatchCopy.finishMatch(lang)) {
                        finish()
                    }
                    .disabled(vm.isSaving)
                }
            }
        }
        .task { await vm.load() }
        .onChange(of: showServeGuidePage) { _, visible in
            if !visible, page == 1 {
                page = 0
            }
        }
        .onChange(of: hintsStore.mode) { _, mode in
            if mode == .off, page == 1 {
                page = 0
            }
        }
        .onChange(of: vm.serveGuideSkipped) { _, skipped in
            if skipped, page == 1 {
                page = 0
            }
        }
    }

    private var scoringPager: some View {
        TabView(selection: $page) {
            MatchScoringExperience(
                vm: vm,
                gameId: gameId,
                matchId: matchId,
                showMatchTimerBar: vm.game?.isMatchTimerEnabled == true,
                compactMatchTimerBar: true,
                showServeIndicator: showServeGuidePage,
                forceServeGate: $forceServeGate
            )
            .tag(0)

            if showServeGuidePage {
                WatchServeGuidePage(vm: vm)
                    .tag(1)
            }
        }
        .tabViewStyle(.page)
    }

    private var scoringNavTitle: String {
        if let r = vm.round?.roundNumber, let m = vm.match?.matchNumber {
            return WatchCopy.roundMatch(lang, round: r, match: m)
        }
        return WatchCopy.match(lang)
    }

    private var readOnlyMatchContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(readOnlyReason)
                .font(.caption2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .foregroundStyle(.secondary)
            if let m = vm.match {
                ForEach(m.sortedTeams, id: \.id) { team in
                    HStack(alignment: .top, spacing: 6) {
                        HStack(spacing: 3) {
                            ForEach(team.players, id: \.userId) { p in
                                WatchPlayerAvatarView(user: p.user, size: 20, role: nil, levelSport: vm.game?.resolvedSport)
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
                    Text(m.sets.watchDisplayScoresLine())
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            Button(WatchCopy.close(lang)) { dismiss() }
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)
        }
        .padding(.vertical, 4)
    }

    private var readOnlyReason: String {
        if vm.game?.resultsStatus == "FINAL" {
            return WatchCopy.viewOnlyFinal(lang)
        }
        return WatchCopy.viewOnlyNotOnMatch(lang)
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
