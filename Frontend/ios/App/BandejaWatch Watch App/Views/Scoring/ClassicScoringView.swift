import SwiftUI

struct ClassicScoringView: View {
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
        ScrollView {
            VStack(spacing: 12) {
                ScoreHintBanner(vm: vm)
                if vm.usesTennisStyleServeGuide {
                    ServeCoachStrip(
                        vm: vm,
                        record: $serveGuideRecord,
                        lang: lang,
                        gameId: gameId,
                        matchId: matchId
                    )
                }

                if vm.activeSetIsSupplemental {
                    Text(WatchCopy.supplementalBanner(
                        lang,
                        role: vm.sets[safe: vm.activeSetIndex]?.resolvedRole ?? .official
                    ))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    HStack(alignment: .top, spacing: 8) {
                        WatchScoringTeamColumn(
                            users: vm.teamAUsers,
                            scoreLabel: "\(vm.sets[safe: vm.activeSetIndex]?.teamA ?? 0)",
                            action: { vm.scorePoint(.teamA) },
                            decrementAction: { vm.unscorePoint(.teamA) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamA),
                            levelSport: vm.game?.resolvedSport
                        )
                        WatchScoringTeamColumn(
                            users: vm.teamBUsers,
                            scoreLabel: "\(vm.sets[safe: vm.activeSetIndex]?.teamB ?? 0)",
                            action: { vm.scorePoint(.teamB) },
                            decrementAction: { vm.unscorePoint(.teamB) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamB),
                            levelSport: vm.game?.resolvedSport
                        )
                    }
                } else if vm.activeSetIsSuperTieBreak {
                    Text(WatchCopy.superTieBreak(lang))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    HStack(alignment: .top, spacing: 8) {
                        WatchScoringTeamColumn(
                            users: vm.teamAUsers,
                            scoreLabel: "\(vm.sets[safe: vm.activeSetIndex]?.teamA ?? 0)",
                            action: { vm.scorePoint(.teamA) },
                            decrementAction: { vm.unscorePoint(.teamA) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamA),
                            levelSport: vm.game?.resolvedSport
                        )
                        WatchScoringTeamColumn(
                            users: vm.teamBUsers,
                            scoreLabel: "\(vm.sets[safe: vm.activeSetIndex]?.teamB ?? 0)",
                            action: { vm.scorePoint(.teamB) },
                            decrementAction: { vm.unscorePoint(.teamB) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamB),
                            levelSport: vm.game?.resolvedSport
                        )
                    }
                } else if vm.withinSetTieBreakMode {
                    Text(WatchCopy.tieBreak(lang))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    HStack(alignment: .top, spacing: 8) {
                        WatchScoringTeamColumn(
                            users: vm.teamAUsers,
                            scoreLabel: "\(vm.tieBreakA)",
                            action: { vm.scorePoint(.teamA) },
                            decrementAction: { vm.unscorePoint(.teamA) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamA),
                            levelSport: vm.game?.resolvedSport
                        )
                        WatchScoringTeamColumn(
                            users: vm.teamBUsers,
                            scoreLabel: "\(vm.tieBreakB)",
                            action: { vm.scorePoint(.teamB) },
                            decrementAction: { vm.unscorePoint(.teamB) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamB),
                            levelSport: vm.game?.resolvedSport
                        )
                    }
                } else {
                    if vm.rules.hasGoldenPoint,
                       case .regular(let a, let b) = vm.classicPointState,
                       a == .forty, b == .forty {
                        Text(WatchCopy.goldenPoint(lang))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    } else if case .deuce = vm.classicPointState {
                        Text(WatchCopy.deuce(lang))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    HStack(alignment: .top, spacing: 8) {
                        WatchScoringTeamColumn(
                            users: vm.teamAUsers,
                            scoreLabel: classicTeamAScoreLabel(lang),
                            action: { vm.scorePoint(.teamA) },
                            decrementAction: { vm.unscorePoint(.teamA) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamA),
                            levelSport: vm.game?.resolvedSport
                        )
                        WatchScoringTeamColumn(
                            users: vm.teamBUsers,
                            scoreLabel: classicTeamBScoreLabel(lang),
                            action: { vm.scorePoint(.teamB) },
                            decrementAction: { vm.unscorePoint(.teamB) },
                            disabled: vm.isReadOnly || vm.classicOfficialScoringLocked,
                            decrementDisabled: !vm.canUnscore(.teamB),
                            levelSport: vm.game?.resolvedSport
                        )
                    }
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
                            Button(WatchCopy.nextSet(lang)) { vm.beginAdvanceToNextSet() }
                        }
                    }
                }

                Button(vm.isSaving ? WatchCopy.saving(lang) : WatchCopy.finishMatch(lang)) {
                    onFinish()
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.isSaving)
            }
        }
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
