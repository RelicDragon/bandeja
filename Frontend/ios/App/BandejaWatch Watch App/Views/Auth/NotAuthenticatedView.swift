import SwiftUI

struct NotAuthenticatedView: View {
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        VStack(spacing: 12) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.system(size: 36))
                .foregroundStyle(.yellow)
            Text(WatchCopy.signInRequired(lang))
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(WatchCopy.openOnIPhone(lang))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
