import SwiftUI

struct ScoreHintBanner: View {
    let vm: MatchScoringViewModel
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        HStack {
            Text(WatchCopy.setLabel(lang, number: vm.activeSetIndex + 1))
            Spacer()
            let set = vm.sets[safe: vm.activeSetIndex]
            Text("\(set?.teamA ?? 0)-\(set?.teamB ?? 0)")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
}
