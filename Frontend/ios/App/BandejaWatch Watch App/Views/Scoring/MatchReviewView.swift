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
                ForEach(Array(vm.sets.enumerated()), id: \.offset) { idx, _ in
                    HStack {
                        Text(WatchCopy.setLabel(lang, number: idx + 1))
                            .font(.caption2)
                        Spacer()
                        Stepper(value: bindingA(idx), in: 0...99) {
                            Text("A \(vm.sets[idx].teamA)")
                                .font(.caption2)
                        }
                        Stepper(value: bindingB(idx), in: 0...99) {
                            Text("B \(vm.sets[idx].teamB)")
                                .font(.caption2)
                        }
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

    private func bindingA(_ index: Int) -> Binding<Int> {
        Binding(
            get: { vm.sets[safe: index]?.teamA ?? 0 },
            set: { newValue in
                guard !vm.isReadOnly, vm.sets.indices.contains(index) else { return }
                vm.sets[index].teamA = newValue
            }
        )
    }

    private func bindingB(_ index: Int) -> Binding<Int> {
        Binding(
            get: { vm.sets[safe: index]?.teamB ?? 0 },
            set: { newValue in
                guard !vm.isReadOnly, vm.sets.indices.contains(index) else { return }
                vm.sets[index].teamB = newValue
            }
        )
    }
}
