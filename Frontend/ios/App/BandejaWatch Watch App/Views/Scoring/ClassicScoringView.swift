import SwiftUI

struct ClassicScoringView: View {
    @Bindable var vm: MatchScoringViewModel
    var showServeIndicator: Bool = false
    var onFinish: (() -> Void)? = nil
    let onRequestFixStartingServer: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var showMoreActions = false

    var body: some View {
        let lang = prefs.uiLanguageCode
        VStack(spacing: 4) {
            statusCaption(lang)
            if showServeIndicator {
                WatchServeIndicatorRow(vm: vm, lang: lang)
            }
            if vm.officiatingIsStrict {
                WatchStrictOfficiatingButtons(vm: vm, lang: lang)
            }

            Spacer(minLength: 0)

            scoreColumns(lang)

            Spacer(minLength: 0)

            footerActions(lang)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .confirmationDialog(
            WatchCopy.setFormatChoiceTitle(lang),
            isPresented: Binding(
                get: { vm.pendingSetFormatChoiceIndex != nil },
                set: { if !$0 { vm.cancelSetFormatChoice() } }
            ),
            titleVisibility: .visible
        ) {
            Button(WatchCopy.normalSetChoice(lang)) {
                vm.confirmSetFormatNormal()
            }
            Button(WatchCopy.superTieBreakChoice(lang)) {
                vm.confirmSetFormatSuper()
            }
            Button(WatchCopy.cancelAction(lang), role: .cancel) {
                vm.cancelSetFormatChoice()
            }
        } message: {
            Text(WatchCopy.setFormatChoiceMessage(lang))
        }
    }

    @ViewBuilder
    private func statusCaption(_ lang: String) -> some View {
        if vm.activeSetIsSupplemental {
            Text(WatchCopy.supplementalBanner(
                lang,
                role: vm.sets[safe: vm.activeSetIndex]?.resolvedRole ?? .official
            ))
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        } else if vm.activeSetIsSuperTieBreak {
            Text(WatchCopy.superTieBreak(lang))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
        } else if vm.withinSetTieBreakMode {
            Text(WatchCopy.tieBreak(lang))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
        } else {
            HStack(spacing: 6) {
                Text(WatchCopy.setLabel(lang, number: vm.activeSetIndex + 1))
                    .font(.caption2.weight(.semibold))
                let set = vm.sets[safe: vm.activeSetIndex]
                Text("\(set?.teamA ?? 0)-\(set?.teamB ?? 0)")
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.secondary)
                if vm.rules.isGoldenPointActive(deuceCount: vm.deuceCount),
                   case .regular(let a, let b) = vm.classicPointState,
                   a == .forty, b == .forty {
                    Text("· \(WatchCopy.goldenPoint(lang))")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else if case .deuce = vm.classicPointState {
                    Text("· \(WatchCopy.deuce(lang))")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func scoreColumns(_ lang: String) -> some View {
        if vm.activeSetIsSupplemental || vm.activeSetIsSuperTieBreak {
            HStack(alignment: .top, spacing: 8) {
                WatchScoringTeamColumn(
                    users: vm.teamAUsers,
                    scoreLabel: "\(vm.sets[safe: vm.activeSetIndex]?.teamA ?? 0)",
                    action: { vm.scorePoint(.teamA) },
                    decrementAction: { vm.unscorePoint(.teamA) },
                    disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                    decrementDisabled: !vm.canUnscore(.teamA),
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
                WatchScoringTeamColumn(
                    users: vm.teamBUsers,
                    scoreLabel: "\(vm.sets[safe: vm.activeSetIndex]?.teamB ?? 0)",
                    action: { vm.scorePoint(.teamB) },
                    decrementAction: { vm.unscorePoint(.teamB) },
                    disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                    decrementDisabled: !vm.canUnscore(.teamB),
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
            }
        } else if vm.withinSetTieBreakMode {
            HStack(alignment: .top, spacing: 8) {
                WatchScoringTeamColumn(
                    users: vm.teamAUsers,
                    scoreLabel: "\(vm.tieBreakA)",
                    action: { vm.scorePoint(.teamA) },
                    decrementAction: { vm.unscorePoint(.teamA) },
                    disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                    decrementDisabled: !vm.canUnscore(.teamA),
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
                WatchScoringTeamColumn(
                    users: vm.teamBUsers,
                    scoreLabel: "\(vm.tieBreakB)",
                    action: { vm.scorePoint(.teamB) },
                    decrementAction: { vm.unscorePoint(.teamB) },
                    disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                    decrementDisabled: !vm.canUnscore(.teamB),
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
            }
        } else {
            HStack(alignment: .top, spacing: 8) {
                WatchScoringTeamColumn(
                    users: vm.teamAUsers,
                    scoreLabel: classicTeamAScoreLabel(lang),
                    action: { vm.scorePoint(.teamA) },
                    decrementAction: { vm.unscorePoint(.teamA) },
                    disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                    decrementDisabled: !vm.canUnscore(.teamA),
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
                WatchScoringTeamColumn(
                    users: vm.teamBUsers,
                    scoreLabel: classicTeamBScoreLabel(lang),
                    action: { vm.scorePoint(.teamB) },
                    decrementAction: { vm.unscorePoint(.teamB) },
                    disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                    decrementDisabled: !vm.canUnscore(.teamB),
                    levelSport: vm.game?.resolvedSport,
                    compact: true
                )
            }
        }
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
            .buttonStyle(.borderedProminent)
            .controlSize(.mini)
            .disabled(vm.isSaving)
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
            Button(WatchCopy.nextSet(lang)) { vm.beginAdvanceToNextSet() }
        }
    }

    private func classicTeamAScoreLabel(_ lang: String) -> String {
        switch vm.classicPointState {
        case .regular(let a, _):
            return a.label
        case .deuce:
            return PadelPoint.forty.label
        case .advantage(let side):
            return side == .teamA ? WatchCopy.advantageAbbrev(lang) : PadelPoint.forty.label
        }
    }

    private func classicTeamBScoreLabel(_ lang: String) -> String {
        switch vm.classicPointState {
        case .regular(_, let b):
            return b.label
        case .deuce:
            return PadelPoint.forty.label
        case .advantage(let side):
            return side == .teamB ? WatchCopy.advantageAbbrev(lang) : PadelPoint.forty.label
        }
    }
}
