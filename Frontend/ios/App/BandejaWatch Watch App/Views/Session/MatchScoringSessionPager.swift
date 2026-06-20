import SwiftUI

/// Horizontal session pager: workout (left) · main scoring · serve guide (right, when enabled).
struct MatchScoringSessionPager: View {
    let gameId: String
    let matchId: String

    @State private var vm: MatchScoringViewModel
    @State private var page = 1
    @State private var isReviewing = false
    @State private var lastFinishSignal = 0
    @State private var showReadOnlyFinishAlert = false
    @State private var forceServeGate = false

    @Environment(ActiveSessionManager.self) private var session
    @Environment(WatchPreferencesStore.self) private var prefs
    @Environment(WatchServeHintsSettingsStore.self) private var hintsStore

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
                readOnlyPager
            } else if isReviewing {
                MatchReviewView(
                    vm: vm,
                    onBack: { isReviewing = false },
                    onFinish: saveAndFinishSession
                )
            } else {
                scoringPager
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
        .onChange(of: showServeGuidePage) { _, visible in
            if !visible, page == 2 {
                page = 1
            }
        }
        .onChange(of: hintsStore.mode) { _, mode in
            if mode == .off, page == 2 {
                page = 1
            }
        }
        .onChange(of: vm.serveGuideSkipped) { _, skipped in
            if skipped, page == 2 {
                page = 1
            }
        }
        .alert(WatchCopy.finishMatch(lang), isPresented: $showReadOnlyFinishAlert) {
            Button(WatchCopy.close(lang), role: .cancel) {}
        } message: {
            Text(WatchCopy.sessionCannotFinishReadOnly(lang))
        }
    }

    private var scoringNavTitle: String {
        if let r = vm.round?.roundNumber, let m = vm.match?.matchNumber {
            return WatchCopy.roundMatch(lang, round: r, match: m)
        }
        return WatchCopy.match(lang)
    }

    private var scoringPager: some View {
        ZStack {
            TabView(selection: $page) {
                WorkoutControlPage(
                    mode: .matchActive,
                    gameId: gameId,
                    matchId: matchId,
                    timerGame: vm.game,
                    onMatchTimerStopped: { vm.lockTimedSetAtPartialScore() }
                )
                    .tag(0)

                MatchScoringExperience(
                    vm: vm,
                    gameId: gameId,
                    matchId: matchId,
                    showMatchTimerBar: false,
                    showServeIndicator: showServeGuidePage,
                    forceServeGate: $forceServeGate
                )
                .tag(1)

                if showServeGuidePage {
                    WatchServeGuidePage(vm: vm)
                        .tag(2)
                }
            }
            .tabViewStyle(.page)
        }
    }

    private var readOnlyPager: some View {
        TabView(selection: $page) {
            WorkoutControlPage(
                mode: .matchActive,
                gameId: gameId,
                matchId: matchId,
                timerGame: vm.game,
                onMatchTimerStopped: { vm.lockTimedSetAtPartialScore() }
            )
                .tag(0)
            readOnlyMatchContent
                .tag(1)
        }
        .tabViewStyle(.page)
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
        }
        .padding(.vertical, 4)
    }

    private var readOnlyReason: String {
        if vm.game?.resultsStatus == "FINAL" {
            return WatchCopy.viewOnlyFinal(lang)
        }
        return WatchCopy.viewOnlyNotOnMatch(lang)
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
