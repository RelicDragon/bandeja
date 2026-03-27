import Foundation

enum Endpoint: Sendable {
    case myGames
    case gameDetail(id: String)
    case userProfile
    case gameResults(gameId: String)
    case createRound(gameId: String)
    case createMatch(gameId: String, roundId: String)
    case updateMatch(gameId: String, matchId: String)
    case recalculateOutcomes(gameId: String)

    var path: String {
        switch self {
        case .myGames:
            return "/games/my-games"
        case .gameDetail(let id):
            return "/games/\(id)"
        case .userProfile:
            return "/users/profile"
        case .gameResults(let gameId):
            return "/results/game/\(gameId)"
        case .createRound(let gameId):
            return "/results/game/\(gameId)/rounds"
        case .createMatch(let gameId, let roundId):
            return "/results/game/\(gameId)/rounds/\(roundId)/matches"
        case .updateMatch(let gameId, let matchId):
            return "/results/game/\(gameId)/matches/\(matchId)"
        case .recalculateOutcomes(let gameId):
            return "/results/game/\(gameId)/recalculate"
        }
    }

    var method: String {
        switch self {
        case .myGames, .gameDetail, .userProfile, .gameResults:
            return "GET"
        case .createRound, .createMatch, .recalculateOutcomes:
            return "POST"
        case .updateMatch:
            return "PUT"
        }
    }

    func urlRequest(baseURL: URL) -> URLRequest {
        // Use string concatenation — appendingPathComponent percent-encodes
        // internal slashes and would mangle multi-segment paths like /games/my-games.
        let urlString = baseURL.absoluteString + path
        let url = URL(string: urlString)! // path is always a valid literal
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }
}
