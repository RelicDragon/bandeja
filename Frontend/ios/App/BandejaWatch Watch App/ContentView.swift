import SwiftUI

struct ContentView: View {
    @Environment(Router.self) private var router

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
    }
}
