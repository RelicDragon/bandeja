import SwiftUI
import WidgetKit

struct ContentView: View {
    @Environment(Router.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.path) {
            GameListView()
                .navigationDestination(for: Router.Destination.self) { destination in
                    switch destination {
                    case .gameDetail(let id):
                        GameDetailView(gameId: id)
                    case .scoringList(let gameId):
                        MatchListView(gameId: gameId)
                    case .scoringMatch(let gameId, let matchId):
                        MatchScoringView(gameId: gameId, matchId: matchId)
                    }
                }
        }
        .onChange(of: router.path) { oldPath, newPath in
            guard let gid = WorkoutManager.shared.activeGameId else { return }
            let had = Router.pathContainsScoring(for: gid, path: oldPath)
            let has = Router.pathContainsScoring(for: gid, path: newPath)
            if had, !has {
                Task { await WorkoutManager.shared.discardIfStillActive(gameId: gid) }
            }
        }
        .onOpenURL { url in
            guard let id = WatchDeepLink.parseGameId(from: url) else { return }
            router.popToRoot()
            router.navigate(to: .gameDetail(id: id))
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}
