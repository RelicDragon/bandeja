import SwiftUI

struct ScoreHintBanner: View {
    let vm: MatchScoringViewModel
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        let set = vm.sets[safe: vm.activeSetIndex]
        let heading: String = {
            if let set, set.resolvedRole != .official {
                return WatchCopy.supplementalBanner(lang, role: set.resolvedRole)
            }
            return WatchCopy.setLabel(lang, number: vm.activeSetIndex + 1)
        }()
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(heading)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.primary.opacity(0.92))
            Text("\(set?.teamA ?? 0)-\(set?.teamB ?? 0)")
                .font(.footnote.weight(.semibold).monospacedDigit())
                .foregroundStyle(.secondary)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.snappy(duration: 0.2), value: set?.teamA)
        .animation(.snappy(duration: 0.2), value: set?.teamB)
    }
}
