import SwiftUI

struct MatchScoringView: View {
    let gameId: String
    let matchId: String
    @State private var vm: MatchScoringViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(WatchPreferencesStore.self) private var prefs
    @State private var isReviewing = false

    init(gameId: String, matchId: String) {
        self.gameId = gameId
        self.matchId = matchId
        _vm = State(initialValue: MatchScoringViewModel(gameId: gameId, matchId: matchId))
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.match == nil {
                ProgressView(WatchCopy.loadingEllipsis(prefs.uiLanguageCode))
            } else if let error = vm.error, vm.match == nil {
                Text(error.localizedDescription).font(.caption2)
            } else if isReviewing {
                MatchReviewView(
                    vm: vm,
                    onBack: { isReviewing = false },
                    onFinish: saveAndDismiss
                )
            } else if vm.isAmericano {
                AmericanoScoringView(vm: vm, onFinish: finish)
            } else {
                ClassicScoringView(vm: vm, onFinish: finish)
            }
        }
        .navigationTitle(WatchCopy.match(prefs.uiLanguageCode))
        .task { await vm.load() }
    }

    private func finish() {
        if vm.isReadOnly {
            dismiss()
            return
        }
        isReviewing = true
    }

    private func saveAndDismiss() {
        Task {
            await vm.saveCurrentSets()
            if vm.error == nil { dismiss() }
        }
    }
}
