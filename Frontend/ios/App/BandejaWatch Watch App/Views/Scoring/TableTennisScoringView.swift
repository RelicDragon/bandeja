import SwiftUI

struct TableTennisScoringView: View {
    @Bindable var vm: MatchScoringViewModel
    var showServeIndicator: Bool = false
    var onFinish: (() -> Void)? = nil
    let onRequestFixStartingServer: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var showMoreActions = false

    var body: some View {
        let lang = prefs.uiLanguageCode
        VStack(spacing: 4) {
            Text(
                vm.sets[safe: vm.activeSetIndex].map { s in
                    s.resolvedRole == .official
                        ? vm.ballCapScoringTitle(lang: lang)
                        : WatchCopy.supplementalBanner(lang, role: s.resolvedRole)
                } ?? vm.ballCapScoringTitle(lang: lang)
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)

            if vm.rawFixedNumberOfSets > 1, !vm.activeSetIsSupplemental {
                Text("\(WatchCopy.setWord(lang)) \(vm.activeSetIndex + 1)/\(vm.rawFixedNumberOfSets)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if showServeIndicator {
                WatchServeIndicatorRow(vm: vm, lang: lang)
            }

            Spacer(minLength: 0)

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
                    decrementDisabled: aScore <= 0 || vm.pointsOfficialDecrementDisabled,
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
                WatchScoringTeamColumn(
                    users: vm.teamBUsers,
                    scoreLabel: "\(bScore)",
                    action: { vm.incrementAmericanoTeamB() },
                    decrementAction: { vm.decrementAmericanoTeamB() },
                    disabled: vm.pointsOfficialIncrementDisabled,
                    decrementDisabled: bScore <= 0 || vm.pointsOfficialDecrementDisabled,
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
            }

            Spacer(minLength: 0)

            footerActions(lang)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func footerActions(_ lang: String) -> some View {
        if !vm.isReadOnly {
            Button {
                showMoreActions = true
            } label: {
                Label(WatchCopy.moreScoringActions(lang), systemImage: "ellipsis.circle")
            }
            .buttonStyle(.bordered)
            .controlSize(.mini)
            .confirmationDialog(
                WatchCopy.moreScoringActions(lang),
                isPresented: $showMoreActions,
                titleVisibility: .visible
            ) {
                moreActions(lang)
            }
        }
        if let onFinish {
            Button(vm.isSaving ? WatchCopy.saving(lang) : WatchCopy.finishMatch(lang)) {
                onFinish()
            }
            .disabled(vm.isSaving)
            .buttonStyle(.borderedProminent)
            .controlSize(.mini)
        }
    }

    @ViewBuilder
    private func moreActions(_ lang: String) -> some View {
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
