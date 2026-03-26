import SwiftUI

private struct WatchLocaleRoot<Content: View>: View {
    @Environment(WatchPreferencesStore.self) private var prefs
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .environment(\.locale, prefs.resolvedLocale)
            .environment(\.calendar, prefs.resolvedCalendar)
    }
}

@main
struct BandejaWatchApp: App {
    @State private var router = Router()
    @State private var gameListVM = GameListViewModel()

    init() {
        WatchSessionManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            WatchLocaleRoot {
                ContentView()
                    .environment(router)
                    .environment(gameListVM)
            }
            .environment(WatchPreferencesStore.shared)
        }
    }
}
