import SwiftUI

struct MatchReviewView: View {
    @Bindable var vm: MatchScoringViewModel
    @Environment(WatchPreferencesStore.self) private var prefs
    let onBack: () -> Void
    let onFinish: () -> Void

    var body: some View {
        let lang = prefs.uiLanguageCode
        List {
            Section(WatchCopy.sets(lang)) {
                ForEach(0..<vm.sets.count, id: \.self) { idx in
                    HStack {
                        Text(WatchCopy.setLabel(lang, number: idx + 1))
                            .font(.caption2)
                        Spacer(minLength: 8)
                        Text("\(vm.sets[idx].teamA)-\(vm.sets[idx].teamB)")
                            .font(.caption2.monospacedDigit().weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if !vm.isReadOnly {
                Button(WatchCopy.backToScoring(lang)) { onBack() }
                    .buttonStyle(.bordered)
                Button(vm.isSaving ? WatchCopy.saving(lang) : WatchCopy.finishMatch(lang)) { onFinish() }
                    .buttonStyle(.borderedProminent)
                    .disabled(vm.isSaving)
            } else {
                Button(WatchCopy.close(lang)) { onFinish() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .navigationTitle(WatchCopy.review(lang))
    }
}
