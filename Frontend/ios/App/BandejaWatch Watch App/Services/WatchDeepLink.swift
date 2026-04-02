import Foundation

enum WatchDeepLink {
    static let scheme = "bandejawatch"

    static func gameURL(gameId: String) -> URL {
        URL(string: "\(scheme)://games/\(gameId)")!
    }

    static func parseGameId(from url: URL) -> String? {
        guard url.scheme == scheme, url.host == "games" else { return nil }
        let trimmed = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty else { return nil }
        return trimmed.split(separator: "/").first.map(String.init)
    }
}
