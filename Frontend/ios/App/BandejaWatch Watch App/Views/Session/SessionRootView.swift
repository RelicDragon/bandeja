import SwiftUI
import WidgetKit

struct SessionRootView: View {
    @Environment(Router.self) private var router
    @Environment(ActiveSessionManager.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = router
        Group {
            switch session.phase {
            case .idle:
                NavigationStack(path: $router.path) {
                    GameListView()
                        .navigationDestination(for: Router.Destination.self) { destination in
                            switch destination {
                            case .gameDetail(let id):
                                GameDetailView(gameId: id)
                            case .gameOutcomes(let gameId):
                                GameOutcomesListView(gameId: gameId)
                            case .gameOutcomeMatch(let gameId, let matchId):
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
            case .gameActive(let gameId):
                ScoringSessionHorizontalPager(gameId: gameId, matchId: nil)
            case .matchActive(let gameId, let matchId):
                ScoringSessionHorizontalPager(gameId: gameId, matchId: matchId)
            }
        }
        .onOpenURL { url in
            guard let id = WatchDeepLink.parseGameId(from: url) else { return }
            Task {
                await handleDeepLink(gameId: id)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                WidgetCenter.shared.reloadAllTimelines()
                Task { await session.recoverIfNeeded() }
            }
        }
    }

    private func handleDeepLink(gameId: String) async {
        switch session.phase {
        case .gameActive(let g) where g == gameId, .matchActive(let g, _) where g == gameId:
            return
        case .gameActive, .matchActive:
            await session.resetSessionDiscardWorkout()
        case .idle:
            break
        }

        do {
            let game: WatchGame = try await APIClient().fetch(.gameDetail(id: gameId))
            router.popToRoot()
            if game.status == "STARTED", game.resultsStatus == "IN_PROGRESS" {
                await session.enterScoringSession(gameId: gameId)
            } else {
                router.navigate(to: .gameDetail(id: gameId))
            }
        } catch {
            router.popToRoot()
            router.navigate(to: .gameDetail(id: gameId))
        }
    }
}

/// Workout/metrics on tag 0 (left when paging horizontally). Main matches or scoring on tag 1 (default).
private struct ScoringSessionHorizontalPager: View {
    let gameId: String
    let matchId: String?
    @State private var page = 1

    var body: some View {
        TabView(selection: $page) {
            if let matchId {
                WorkoutControlPage(mode: .matchActive, gameId: gameId)
                    .tag(0)
                ActiveMatchPage(gameId: gameId, matchId: matchId)
                    .tag(1)
            } else {
                WorkoutControlPage(mode: .gameActive, gameId: gameId)
                    .tag(0)
                ActiveGamePage(gameId: gameId)
                    .tag(1)
            }
        }
        .tabViewStyle(.page)
    }
}
