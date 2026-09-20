import Foundation

public enum NextGamesCache {
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = ISO8601Dates.parse(raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(raw)"
            )
        }
        return decoder
    }()

    /// Writes the list and marks the viewer as signed in: only an authenticated fetch can
    /// produce games, so widgets read `isAuthenticated` instead of touching the Keychain.
    /// (`NextGamesEnvelopeStore.write` overrides the flag with the envelope's own value.)
    @discardableResult
    public static func write(_ games: [CachedNextGame], suite: UserDefaults? = AppGroupStorage.suite) -> Bool {
        guard let suite,
              let data = try? encoder.encode(games) else { return false }
        suite.set(data, forKey: AppGroupStorage.Keys.nextGames)
        suite.set(true, forKey: AppGroupStorage.Keys.isAuthenticated)
        return true
    }

    public static func read(suite: UserDefaults? = AppGroupStorage.suite) -> [CachedNextGame] {
        guard let suite,
              let data = suite.data(forKey: AppGroupStorage.Keys.nextGames) else { return [] }
        return (try? decoder.decode([CachedNextGame].self, from: data)) ?? []
    }

    /// Logout / lost credentials: drops the list and marks the viewer as signed out.
    public static func clear(suite: UserDefaults? = AppGroupStorage.suite) {
        suite?.removeObject(forKey: AppGroupStorage.Keys.nextGames)
        suite?.set(false, forKey: AppGroupStorage.Keys.isAuthenticated)
    }

    /// Whether the last cache write came from a signed-in session. Missing flag = signed out.
    public static func isAuthenticated(suite: UserDefaults? = AppGroupStorage.suite) -> Bool {
        suite?.object(forKey: AppGroupStorage.Keys.isAuthenticated) as? Bool ?? false
    }
}

enum ISO8601Dates {
    private static let lock = NSLock()
    nonisolated(unsafe) private static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ string: String) -> Date? {
        lock.lock()
        defer { lock.unlock() }
        if let date = withFractionalSeconds.date(from: string) { return date }
        return plain.date(from: string)
    }
}
