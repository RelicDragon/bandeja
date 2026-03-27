import SwiftUI
import Observation

@Observable
@MainActor
final class Router {
    var path = NavigationPath()

    enum Destination: Hashable {
        case gameDetail(id: String)
        case scoringList(gameId: String)
        case scoringMatch(gameId: String, matchId: String)
    }

    func navigate(to destination: Destination) {
        path.append(destination)
    }

    func popToRoot() {
        path.removeLast(path.count)
    }
}
