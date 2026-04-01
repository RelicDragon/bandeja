import SwiftUI

struct ClassicScoringView: View {
    @Bindable var vm: MatchScoringViewModel
    let onFinish: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var showMoreActions = false

    var body: some View {
        let lang = prefs.uiLanguageCode
        ScrollView {
            VStack(spacing: 12) {
                ScoreHintBanner(vm: vm)

                if vm.isTieBreakMode {
                    Text(WatchCopy.tieBreak(lang))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    HStack(alignment: .top, spacing: 8) {
                        WatchScoringTeamColumn(
                            users: vm.teamAUsers,
                            scoreLabel: "\(vm.tieBreakA)",
                            action: { vm.scorePoint(.teamA) },
                            decrementAction: { vm.unscorePoint(.teamA) },
                            disabled: vm.isReadOnly,
                            decrementDisabled: !vm.canUnscore(.teamA)
                        )
                        WatchScoringTeamColumn(
                            users: vm.teamBUsers,
                            scoreLabel: "\(vm.tieBreakB)",
                            action: { vm.scorePoint(.teamB) },
                            decrementAction: { vm.unscorePoint(.teamB) },
                            disabled: vm.isReadOnly,
                            decrementDisabled: !vm.canUnscore(.teamB)
                        )
                    }
                } else {
                    if case .deuce = vm.classicPointState {
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
                            disabled: vm.isReadOnly,
                            decrementDisabled: !vm.canUnscore(.teamA)
                        )
                        WatchScoringTeamColumn(
                            users: vm.teamBUsers,
                            scoreLabel: classicTeamBScoreLabel(lang),
                            action: { vm.scorePoint(.teamB) },
                            decrementAction: { vm.unscorePoint(.teamB) },
                            disabled: vm.isReadOnly,
                            decrementDisabled: !vm.canUnscore(.teamB)
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
                            Task { await vm.saveCurrentSets() }
                        }
                        .disabled(vm.isSaving)
                        if vm.canAdvanceToNextSet() {
                            Button(WatchCopy.nextSet(lang)) { vm.nextSet() }
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
