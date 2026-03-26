import SwiftUI

@main
struct BandejaWatchApp: App {
    @State private var router = Router()
    @State private var gameListVM = GameListViewModel()

    init() {
        WatchSessionManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(router)
                .environment(gameListVM)
        }
    }
}
