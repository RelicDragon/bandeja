import Foundation

enum Endpoint: Sendable {
    case myGames
    case gameDetail(id: String)
    case userProfile

    var path: String {
        switch self {
        case .myGames:
            return "/games/my-games"
        case .gameDetail(let id):
            return "/games/\(id)"
        case .userProfile:
            return "/users/profile"
        }
    }

    var method: String { "GET" }

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
