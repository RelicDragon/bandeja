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
    public static func write(_ payload: LiveActiveSnapshotPayload, suite: UserDefaults? = AppGroupStorage.suite) {
        guard let suite,
              let data = try? JSONEncoder().encode(payload) else { return }
        suite.set(data, forKey: AppGroupStorage.Keys.liveActiveSnapshot)
    }

    public static func read(suite: UserDefaults? = AppGroupStorage.suite) -> LiveActiveSnapshotPayload? {
        guard let suite,
              let data = suite.data(forKey: AppGroupStorage.Keys.liveActiveSnapshot) else { return nil }
        return try? JSONDecoder().decode(LiveActiveSnapshotPayload.self, from: data)
    }

    public static func clear(suite: UserDefaults? = AppGroupStorage.suite) {
        suite?.removeObject(forKey: AppGroupStorage.Keys.liveActiveSnapshot)
    }
}
