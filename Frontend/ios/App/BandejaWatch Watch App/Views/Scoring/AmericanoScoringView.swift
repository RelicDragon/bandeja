import SwiftUI

struct RallyPointsScoringView: View {
    @Bindable var vm: MatchScoringViewModel
    let gameId: String
    let matchId: String
    @Binding var serveGuideRecord: WatchServeGuideSessionRecord
    let onRequestFixStartingServer: () -> Void
    let onFinish: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var showMoreActions = false

    var body: some View {
        let lang = prefs.uiLanguageCode
        VStack(spacing: 10) {
            Text(
                vm.sets[safe: vm.activeSetIndex].map { s in
                    s.resolvedRole == .official
                        ? vm.ballCapScoringTitle(lang: lang)
                        : WatchCopy.supplementalBanner(lang, role: s.resolvedRole)
                } ?? vm.ballCapScoringTitle(lang: lang)
            )
                .font(.caption)
                .foregroundStyle(.secondary)
            if vm.rawFixedNumberOfSets > 1, !vm.activeSetIsSupplemental {
                Text("\(WatchCopy.setWord(lang)) \(vm.activeSetIndex + 1)/\(vm.rawFixedNumberOfSets)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            if vm.usesTennisStyleServeGuide {
                ServeCoachStrip(
                    vm: vm,
                    record: $serveGuideRecord,
                    lang: lang,
                    gameId: gameId,
                    matchId: matchId
                )
            }
            if vm.game?.resolvedSport == .pickleball, vm.liveScoringUiId == .rallyPointsBoard {
                WatchPickleballCoachButtons(lang: lang)
            }
            let idx = vm.activeSetIndex
            let aScore = vm.sets[safe: idx]?.teamA ?? 0
            let bScore = vm.sets[safe: idx]?.teamB ?? 0
            HStack(alignment: .top, spacing: 8) {
                WatchScoringTeamColumn(
                    users: vm.teamAUsers,
                    scoreLabel: "\(aScore)",
                    action: { vm.incrementAmericanoTeamA() },
                    decrementAction: { vm.decrementAmericanoTeamA() },
                    disabled: vm.pointsOfficialIncrementDisabled,
                    decrementDisabled: aScore <= 0 || vm.pointsOfficialDecrementDisabled
                )
                WatchScoringTeamColumn(
                    users: vm.teamBUsers,
                    scoreLabel: "\(bScore)",
                    action: { vm.incrementAmericanoTeamB() },
                    decrementAction: { vm.decrementAmericanoTeamB() },
                    disabled: vm.pointsOfficialIncrementDisabled,
                    decrementDisabled: bScore <= 0 || vm.pointsOfficialDecrementDisabled
                )
            }
            if vm.canAdvanceToNextSet() {
                Button(WatchCopy.nextSet(lang)) {
                    vm.nextSet()
                }
                .buttonStyle(.bordered)
            }
            if !vm.isReadOnly {
                Button {
                    showMoreActions = true
                } label: {
                    Label(WatchCopy.moreScoringActions(lang), systemImage: "ellipsis.circle")
                }
                .buttonStyle(.bordered)
                .confirmationDialog(
                    WatchCopy.moreScoringActions(lang),
                    isPresented: $showMoreActions,
                    titleVisibility: .visible
                ) {
                    Button(WatchCopy.saveSet(lang)) {
                        Task { await vm.flushLiveScoringSnapshot() }
                    }
                    .disabled(vm.isSaving)
                    if vm.usesTennisStyleServeGuide {
                        Button(WatchCopy.serveHintsOn(lang)) {
                            WatchServeHintsSettingsStore.shared.setMode(.on)
                        }
                        Button(WatchCopy.serveHintsCompact(lang)) {
                            WatchServeHintsSettingsStore.shared.setMode(.compact)
                        }
                        Button(WatchCopy.serveHintsOff(lang)) {
                            WatchServeHintsSettingsStore.shared.setMode(.off)
                        }
                        Button(WatchCopy.fixStartingServer(lang)) {
                            onRequestFixStartingServer()
                        }
                    }
                    Button(WatchCopy.addExtraGamesRow(lang)) {
                        vm.appendSupplementalSet(kind: .extraGames)
                    }
                    Button(WatchCopy.addExtraBallsRow(lang)) {
                        vm.appendSupplementalSet(kind: .extraBalls)
                    }
                    if vm.canAdvanceToNextSet() {
                        Button(WatchCopy.nextSet(lang)) { vm.nextSet() }
                    }
                }
            }
            Button(vm.isSaving ? WatchCopy.saving(lang) : WatchCopy.finishMatch(lang)) {
                onFinish()
            }
            .disabled(vm.isSaving)
            .buttonStyle(.borderedProminent)
        }
    }
}
