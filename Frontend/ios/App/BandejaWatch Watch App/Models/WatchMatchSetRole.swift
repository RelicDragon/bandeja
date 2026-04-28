import Foundation

enum WatchMatchSetRole: String, Codable, Sendable, Equatable {
    case official = "OFFICIAL"
    case extraGames = "EXTRA_GAMES"
    case extraBalls = "EXTRA_BALLS"
}

extension Array where Element == WatchSet {
    func watchDisplayScoresLine() -> String {
        sorted { $0.setNumber < $1.setNumber }
            .map { s in
                let base = "\(s.teamAScore)-\(s.teamBScore)"
                if s.resolvedRole == .official { return base }
                return base + "*"
            }
            .joined(separator: "  ")
    }
}
