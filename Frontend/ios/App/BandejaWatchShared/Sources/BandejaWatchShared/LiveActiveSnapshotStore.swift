import Foundation

public struct LiveActiveSnapshotPayload: Codable, Sendable {
    public var gameId: String
    public var matchId: String
    public var titleLine: String
    public var scoreLine: String
    public var sport: String?

    public init(
        gameId: String,
        matchId: String,
        titleLine: String,
        scoreLine: String,
        sport: String? = nil
    ) {
        self.gameId = gameId
        self.matchId = matchId
        self.titleLine = titleLine
        self.scoreLine = scoreLine
        self.sport = sport
    }
}

public enum LiveActiveSnapshotStore {
    public static let suiteName = "group.com.funified.bandeja"
    public static let storageKey = "watchLiveActiveScoringV1"

    public static var suite: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    public static func write(_ payload: LiveActiveSnapshotPayload, suite: UserDefaults? = suite) {
        guard let suite,
              let data = try? JSONEncoder().encode(payload) else { return }
        suite.set(data, forKey: storageKey)
    }

    public static func read(suite: UserDefaults? = suite) -> LiveActiveSnapshotPayload? {
        guard let suite,
              let data = suite.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(LiveActiveSnapshotPayload.self, from: data)
    }

    public static func clear(suite: UserDefaults? = suite) {
        suite?.removeObject(forKey: storageKey)
    }
}
