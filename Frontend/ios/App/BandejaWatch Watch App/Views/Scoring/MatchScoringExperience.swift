import SwiftUI

struct MatchScoringExperience: View {
    @Bindable var vm: MatchScoringViewModel
    let gameId: String
    let matchId: String
    var showMatchTimerBar: Bool = false
    let onFinish: () -> Void

    @Environment(WatchPreferencesStore.self) private var prefs

    @State private var serveRecord = WatchServeGuideSessionRecord.empty
    @State private var coachToast = false
    @State private var coachToastTaskRunning = false
    @State private var forceServeGate = false
    @State private var showFixServerConfirm = false

    private var lang: String { prefs.uiLanguageCode }

    private var normalServeGate: Bool {
        vm.usesTennisStyleServeGuide && !vm.isReadOnly && vm.match != nil
            && !serveRecord.skipped && serveRecord.firstServerTeam == nil
    }

    private var showServeOverlay: Bool {
        vm.usesTennisStyleServeGuide && !vm.isReadOnly && vm.match != nil && (normalServeGate || forceServeGate)
    }

    private var gamesInSet: Int {
        let s = vm.sets[safe: vm.activeSetIndex]
        return (s?.teamA ?? 0) + (s?.teamB ?? 0)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 6) {
                if showMatchTimerBar, let g = vm.game, g.isMatchTimerEnabled {
                    MatchTimerBarView(gameId: gameId, matchId: matchId, game: g)
                }
                if vm.usesBallCapPerSetUI {
                    AmericanoScoringView(vm: vm, onFinish: onFinish)
                } else {
                    ClassicScoringView(
                        vm: vm,
                        gameId: gameId,
                        matchId: matchId,
                        serveGuideRecord: $serveRecord,
                        onRequestFixStartingServer: requestFixServer,
                        onFinish: onFinish
                    )
                }
            }

            if coachToast {
                VStack {
                    Text(WatchCopy.serveCoachToast(lang))
                        .font(.caption.weight(.medium))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.top, 4)
                    Spacer()
                }
                .transition(.opacity)
            }

            if showServeOverlay {
                FirstServePickFlow(
                    record: $serveRecord,
                    vm: vm,
                    lang: lang,
                    gameId: gameId,
                    matchId: matchId,
                    onFinished: {
                        forceServeGate = false
                        reloadServeRecord()
                        vm.requestLiveScoringSave()
                        scheduleCoachToastIfNeeded()
                    }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: coachToast)
        .animation(.easeOut(duration: 0.22), value: showServeOverlay)
        .onAppear {
            reloadServeRecord()
            vm.startLiveScoringRemotePolling()
            pushWidgetSnapshot()
        }
        .onDisappear {
            vm.stopLiveScoringRemotePolling()
            WatchLiveActiveSnapshotStore.clear()
        }
        .onChange(of: vm.sets) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.activeSetIndex) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.tieBreakA) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.tieBreakB) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.withinSetTieBreakMode) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.classicPointState) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.match?.id) { _, _ in reloadServeRecord() }
        .onChange(of: vm.classicPointsPlayedInGame) { _, v in
            guard !vm.usesBallCapPerSetUI, serveRecord.firstServerTeam != nil else { return }
            var r = serveRecord
            r.classicPointsPlayedInGame = v
            serveRecord = r
            WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: r)
            vm.requestLiveScoringSave()
        }
        .confirmationDialog(WatchCopy.fixStartingServer(lang), isPresented: $showFixServerConfirm, titleVisibility: .visible) {
            Button(WatchCopy.confirmAction(lang)) {
                forceServeGate = true
            }
            Button(WatchCopy.cancelAction(lang), role: .cancel) {}
        } message: {
            Text(WatchCopy.fixStartingServerConfirm(lang))
        }
    }

    private func reloadServeRecord() {
        serveRecord = WatchServeGuideSessionStore.shared.load(gameId: gameId, matchId: matchId) ?? .empty
    }

    private func pushWidgetSnapshot() {
        let snap = vm.liveWidgetTitleAndScoreLine()
        WatchLiveActiveSnapshotStore.publish(
            gameId: gameId,
            matchId: matchId,
            titleLine: snap.0,
            scoreLine: snap.1
        )
    }

    private func requestFixServer() {
        if gamesInSet > 0 {
            showFixServerConfirm = true
        } else {
            forceServeGate = true
        }
    }

    private func scheduleCoachToastIfNeeded() {
        guard serveRecord.firstServerTeam != nil, !serveRecord.skipped, !serveRecord.showedFirstServeCoachToast else { return }
        guard !coachToastTaskRunning else { return }
        coachToastTaskRunning = true
        Task { @MainActor in
            defer { coachToastTaskRunning = false }
            coachToast = true
            try? await Task.sleep(for: .seconds(4))
            coachToast = false
            var r = serveRecord
            r.showedFirstServeCoachToast = true
            serveRecord = r
            WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: r)
        }
    }
}
