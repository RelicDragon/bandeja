import SwiftUI

struct ClassicScoringView: View {
    @Bindable var vm: MatchScoringViewModel
    let onFinish: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        ScrollView {
            VStack(spacing: 10) {
                ScoreHintBanner(vm: vm)

                if vm.isTieBreakMode {
                    Text(WatchCopy.tieBreak(lang))
                        .font(.caption)
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
                            .font(.caption)
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

                let set = vm.sets[safe: vm.activeSetIndex]
                Text("\(WatchCopy.setLabel(lang, number: vm.activeSetIndex + 1)): \(set?.teamA ?? 0)-\(set?.teamB ?? 0)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button(WatchCopy.saveSet(lang)) {
                    Task { await vm.saveCurrentSets() }
                }
                .buttonStyle(.bordered)
                .disabled(vm.isSaving || vm.isReadOnly)

                if vm.canAdvanceToNextSet() && !vm.isReadOnly {
                    Button(WatchCopy.nextSet(lang)) { vm.nextSet() }
                        .buttonStyle(.bordered)
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
