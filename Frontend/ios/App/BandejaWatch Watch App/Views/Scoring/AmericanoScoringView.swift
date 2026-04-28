import SwiftUI

struct AmericanoScoringView: View {
    @Bindable var vm: MatchScoringViewModel
    let onFinish: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        VStack(spacing: 10) {
            Text(vm.ballCapScoringTitle(lang: lang))
                .font(.caption)
                .foregroundStyle(.secondary)
            if vm.rawFixedNumberOfSets > 1 {
                Text("\(WatchCopy.setWord(lang)) \(vm.activeSetIndex + 1)/\(vm.rawFixedNumberOfSets)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
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
                    disabled: vm.isReadOnly,
                    decrementDisabled: aScore <= 0
                )
                WatchScoringTeamColumn(
                    users: vm.teamBUsers,
                    scoreLabel: "\(bScore)",
                    action: { vm.incrementAmericanoTeamB() },
                    decrementAction: { vm.decrementAmericanoTeamB() },
                    disabled: vm.isReadOnly,
                    decrementDisabled: bScore <= 0
                )
            }
            if vm.canAdvanceToNextSet {
                Button(WatchCopy.nextSet(lang)) {
                    vm.nextSet()
                }
                .buttonStyle(.bordered)
            }
            Button(vm.isSaving ? WatchCopy.saving(lang) : WatchCopy.finishMatch(lang)) {
                onFinish()
            }
            .disabled(vm.isSaving)
            .buttonStyle(.borderedProminent)
        }
    }
}
