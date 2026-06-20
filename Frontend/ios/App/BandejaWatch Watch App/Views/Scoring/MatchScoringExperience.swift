import SwiftUI

struct MatchScoringExperience: View {
    @Bindable var vm: MatchScoringViewModel
    let gameId: String
    let matchId: String
    var showMatchTimerBar: Bool = false
    var compactMatchTimerBar: Bool = false
    var showServeIndicator: Bool = false
    @Binding var forceServeGate: Bool

    @Environment(WatchPreferencesStore.self) private var prefs

    @State private var coachToast = false
    @State private var coachToastTaskRunning = false
    @State private var remoteAttributionDismissTask: Task<Void, Never>?
    @State private var showFixServerConfirm = false

    private var lang: String { prefs.uiLanguageCode }

    private var showServeOverlay: Bool {
        guard vm.match != nil, !vm.isReadOnly, vm.usesTennisStyleServeGuide else { return false }
        if forceServeGate { return true }
        return vm.needsServeSetup
    }

    private var gamesInSet: Int {
        let s = vm.sets[safe: vm.activeSetIndex]
        return (s?.teamA ?? 0) + (s?.teamB ?? 0)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 4) {
                if showMatchTimerBar, let g = vm.game, g.isMatchTimerEnabled {
                    MatchTimerBarView(
                        gameId: gameId,
                        matchId: matchId,
                        game: g,
                        compact: compactMatchTimerBar,
                        onTimerStopped: {
                            vm.lockTimedSetAtPartialScore()
                        }
                    )
                }
                switch vm.liveScoringUiId {
                case .tableTennisBoard:
                    TableTennisScoringView(
                        vm: vm,
                        showServeIndicator: showServeIndicator,
                        onRequestFixStartingServer: requestFixServer
                    )
                case .americanoPoints, .rallyPointsBoard:
                    RallyPointsScoringView(
                        vm: vm,
                        showServeIndicator: showServeIndicator,
                        onRequestFixStartingServer: requestFixServer
                    )
                case .classicCourt:
                    ClassicScoringView(
                        vm: vm,
                        showServeIndicator: showServeIndicator,
                        onRequestFixStartingServer: requestFixServer
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

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

            if vm.showRemoteWriterAttribution {
                VStack {
                    Spacer()
                    Text(WatchCopy.liveScoringUpdatedFromPhone(lang))
                        .font(.caption2.weight(.medium))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 4)
                }
                .transition(.opacity)
            }

            if showServeOverlay {
                FirstServePickFlow(
                    vm: vm,
                    lang: lang,
                    onFinished: {
                        forceServeGate = false
                        vm.requestLiveScoringSave()
                        scheduleCoachToastIfNeeded()
                    }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: coachToast)
        .animation(.easeOut(duration: 0.2), value: vm.showRemoteWriterAttribution)
        .animation(.easeOut(duration: 0.22), value: showServeOverlay)
        .onChange(of: vm.remoteWriterAttributionSignal) { _, _ in
            scheduleRemoteAttributionDismiss()
        }
        .onAppear {
            vm.startLiveScoringRemotePolling()
            pushWidgetSnapshot()
        }
        .onDisappear {
            remoteAttributionDismissTask?.cancel()
            vm.stopLiveScoringRemotePolling()
            WatchLiveActiveSnapshotStore.clear()
        }
        .onChange(of: vm.sets) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.activeSetIndex) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.tieBreakA) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.tieBreakB) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.withinSetTieBreakMode) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.classicPointState) { _, _ in pushWidgetSnapshot() }
        .onChange(of: vm.classicPointsPlayedInGame) { _, _ in
            guard vm.liveScoringUiId == .classicCourt, vm.firstServerTeam != nil else { return }
            vm.requestLiveScoringSave()
        }
        .onChange(of: vm.firstServerTeam) { _, _ in
            if !vm.needsServeSetup { forceServeGate = false }
        }
        .onChange(of: vm.serveGuideSkipped) { _, _ in
            if !vm.needsServeSetup { forceServeGate = false }
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

    private func pushWidgetSnapshot() {
        let snap = vm.liveWidgetTitleAndScoreLine()
        WatchLiveActiveSnapshotStore.publish(
            gameId: gameId,
            matchId: matchId,
            titleLine: snap.0,
            scoreLine: snap.1,
            sport: vm.game?.sport
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
        guard vm.firstServerTeam != nil, !vm.serveGuideSkipped, !vm.showedFirstServeCoachToast else { return }
        guard !coachToastTaskRunning else { return }
        coachToastTaskRunning = true
        Task { @MainActor in
            defer { coachToastTaskRunning = false }
            coachToast = true
            try? await Task.sleep(for: .seconds(4))
            coachToast = false
            vm.markServeCoachToastShown()
        }
    }

    private func scheduleRemoteAttributionDismiss() {
        remoteAttributionDismissTask?.cancel()
        remoteAttributionDismissTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            vm.dismissRemoteWriterAttribution()
        }
    }
}
