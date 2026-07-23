import SwiftUI

/// Shared match scoring container for browse navigation and active session entry paths.
struct MatchScoringShell: View {
    enum Entry {
        case browse
        case session
    }

    let gameId: String
    let matchId: String
    let entry: Entry

    @State private var vm: MatchScoringViewModel
    @State private var isReviewing = false
    @State private var forceServeGate = false
    @State private var page: Int
    @State private var lastFinishSignal = 0
    @State private var showReadOnlyFinishAlert = false

    @Environment(\.dismiss) private var dismiss
    @Environment(ActiveSessionManager.self) private var session
    @Environment(WatchPreferencesStore.self) private var prefs
    @Environment(WatchServeHintsSettingsStore.self) private var hintsStore

    init(gameId: String, matchId: String, entry: Entry) {
        self.gameId = gameId
        self.matchId = matchId
        self.entry = entry
        _vm = State(initialValue: MatchScoringViewModel(gameId: gameId, matchId: matchId))
        _page = State(initialValue: entry == .session ? 1 : 0)
    }

    private var lang: String { prefs.uiLanguageCode }
    private var includesWorkoutPage: Bool { entry == .session }
    private var scoringPageTag: Int { includesWorkoutPage ? 1 : 0 }
    private var serveGuidePageTag: Int { includesWorkoutPage ? 2 : 1 }

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
                VStack(spacing: 8) {
                    Text(error.localizedDescription)
                        .font(.caption2)
                        .multilineTextAlignment(.center)
                    Button(WatchCopy.retry(lang)) {
                        Task {
                            await vm.load()
                            if !vm.isReadOnly, vm.match != nil {
                                vm.startLiveScoringRemotePolling()
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                    if entry == .session {
                        Button(WatchCopy.backToMatches(lang)) {
                            Task { await session.returnToGameActiveFromMatch() }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.mini)
                    }
                }
            } else if vm.isReadOnly, vm.match != nil {
                readOnlyContent
            } else if isReviewing {
                MatchReviewView(
                    vm: vm,
                    onBack: {
                        isReviewing = false
                        vm.resumeAfterMatchReview()
                    },
                    onFinish: saveAndComplete
                )
            } else {
                scoringPager
            }
        }
        .navigationTitle(scoringNavTitle)
        .toolbar {
            if entry == .browse, !isReviewing, !vm.isReadOnly, vm.match != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(WatchCopy.finishMatch(lang)) {
                        beginReview()
                    }
                    .disabled(vm.isSaving)
                }
            }
        }
        .modifier(MatchScoringShellLoadModifier(entry: entry, matchId: matchId) {
            await vm.load()
            if !vm.isReadOnly, vm.match != nil {
                vm.startLiveScoringRemotePolling()
            }
        })
        .onDisappear {
            Task {
                await vm.flushLiveScoringSnapshot()
                vm.stopLiveScoringRemotePolling()
                WatchLiveActiveSnapshotStore.clear()
            }
        }
        .onChange(of: session.finishMatchSignal) { _, newVal in
            guard entry == .session else { return }
            guard newVal > lastFinishSignal else { return }
            lastFinishSignal = newVal
            if vm.isReadOnly || vm.match == nil {
                showReadOnlyFinishAlert = true
                return
            }
            beginReview()
        }
        .onChange(of: showServeGuidePage) { _, visible in
            resetPageIfGuideHidden(whenGuideHidden: !visible)
        }
        .onChange(of: hintsStore.mode) { _, mode in
            resetPageIfGuideHidden(whenGuideHidden: mode == .off)
        }
        .onChange(of: vm.serveGuideSkipped) { _, skipped in
            resetPageIfGuideHidden(whenGuideHidden: skipped)
        }
        .alert(WatchCopy.finishMatch(lang), isPresented: $showReadOnlyFinishAlert) {
            Button(WatchCopy.backToMatches(lang)) {
                Task { await session.returnToGameActiveFromMatch() }
            }
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

    @ViewBuilder
    private var scoringPager: some View {
        TabView(selection: $page) {
            if includesWorkoutPage {
                workoutPage.tag(0)
            }

            MatchScoringExperience(
                vm: vm,
                gameId: gameId,
                matchId: matchId,
                showMatchTimerBar: entry == .browse && vm.game?.isMatchTimerEnabled == true,
                compactMatchTimerBar: entry == .browse,
                showServeIndicator: showServeGuidePage,
                forceServeGate: $forceServeGate
            )
            .tag(scoringPageTag)

            if showServeGuidePage {
                WatchServeGuidePage(vm: vm)
                    .tag(serveGuidePageTag)
            }
        }
        .tabViewStyle(.page)
    }

    @ViewBuilder
    private var readOnlyContent: some View {
        if includesWorkoutPage {
            TabView(selection: $page) {
                workoutPage.tag(0)
                MatchReadOnlyContent(
                    vm: vm,
                    lang: lang,
                    showsCloseButton: false
                )
                .tag(1)
            }
            .tabViewStyle(.page)
        } else {
            MatchReadOnlyContent(
                vm: vm,
                lang: lang,
                showsCloseButton: true,
                onClose: { dismiss() }
            )
        }
    }

    private var workoutPage: some View {
        WorkoutControlPage(
            mode: .matchActive,
            gameId: gameId,
            matchId: matchId,
            timerGame: vm.game,
            onMatchTimerStopped: { vm.lockTimedSetAtPartialScore() }
        )
    }

    private func resetPageIfGuideHidden(whenGuideHidden: Bool) {
        guard whenGuideHidden, page == serveGuidePageTag else { return }
        page = scoringPageTag
    }

    private func beginReview() {
        Task {
            isReviewing = true
            await vm.prepareForMatchReview()
        }
    }

    private func saveAndComplete() {
        Task {
            await vm.saveCurrentSets()
            guard vm.error == nil else { return }
            switch entry {
            case .browse:
                dismiss()
            case .session:
                await session.finishMatchAfterSave()
            }
        }
    }
}

private struct MatchScoringShellLoadModifier: ViewModifier {
    let entry: MatchScoringShell.Entry
    let matchId: String
    let load: () async -> Void

    func body(content: Content) -> some View {
        switch entry {
        case .browse:
            content.task { await load() }
        case .session:
            content.task(id: matchId) { await load() }
        }
    }
}

private struct MatchReadOnlyContent: View {
    let vm: MatchScoringViewModel
    let lang: String
    var showsCloseButton: Bool = false
    var onClose: (() -> Void)? = nil

    private var readOnlyReason: String {
        if vm.game?.resultsStatus == "FINAL" {
            return WatchCopy.viewOnlyFinal(lang)
        }
        return WatchCopy.viewOnlyNotOnMatch(lang)
    }

    var body: some View {
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
            if showsCloseButton {
                Button(WatchCopy.close(lang), action: { onClose?() })
                    .buttonStyle(.borderedProminent)
                    .controlSize(.mini)
            }
        }
        .padding(.vertical, 4)
    }
}
