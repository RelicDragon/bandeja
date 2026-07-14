import Foundation

public struct NextGamesEnvelope: Codable, Sendable, Equatable {
    public let isAuthenticated: Bool
    public let language: String
    public let games: [CachedNextGame]

    public init(isAuthenticated: Bool, language: String, games: [CachedNextGame]) {
        self.isAuthenticated = isAuthenticated
        self.language = language
        self.games = games
    }

    public static func unauthenticated(language: String = "en") -> NextGamesEnvelope {
        NextGamesEnvelope(isAuthenticated: false, language: language, games: [])
    }
}

public enum NextGamesEnvelopeStore {
    @discardableResult
    public static func write(_ envelope: NextGamesEnvelope, suite: UserDefaults? = AppGroupStorage.suite) -> Bool {
        guard let suite else { return false }
        guard NextGamesCache.write(envelope.games, suite: suite) else { return false }
        suite.set(envelope.language, forKey: AppGroupStorage.Keys.uiLanguage)
        suite.set(envelope.isAuthenticated, forKey: AppGroupStorage.Keys.isAuthenticated)
        suite.synchronize()
        return true
    }

    @discardableResult
    public static func clear(suite: UserDefaults? = AppGroupStorage.suite) -> Bool {
        let language = suite?.string(forKey: AppGroupStorage.Keys.uiLanguage) ?? "en"
        return write(.unauthenticated(language: language), suite: suite)
    }

    public static func read(suite: UserDefaults? = AppGroupStorage.suite) -> NextGamesEnvelope {
        let language = suite?.string(forKey: AppGroupStorage.Keys.uiLanguage) ?? "en"
        let isAuthenticated = suite?.object(forKey: AppGroupStorage.Keys.isAuthenticated) as? Bool ?? false
        let games = NextGamesCache.read(suite: suite)
        return NextGamesEnvelope(isAuthenticated: isAuthenticated, language: language, games: games)
    }
}
