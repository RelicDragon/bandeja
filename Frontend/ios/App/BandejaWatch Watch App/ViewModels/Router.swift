import SwiftUI
import Observation

@Observable
@MainActor
final class Router {
    var path: [Destination] = []

    enum Destination: Hashable {
        case gameDetail(id: String)
        case scoringList(gameId: String)
        case scoringMatch(gameId: String, matchId: String)

        var scoringGameId: String? {
            switch self {
            case .scoringList(let g), .scoringMatch(let g, _): return g
            case .gameDetail: return nil
            }
        }
    }

    func navigate(to destination: Destination) {
        path.append(destination)
    }

    func popToRoot() {
        path.removeAll()
    }

    static func pathContainsScoring(for gameId: String, path: [Destination]) -> Bool {
        path.contains { $0.scoringGameId == gameId }
    }
}
