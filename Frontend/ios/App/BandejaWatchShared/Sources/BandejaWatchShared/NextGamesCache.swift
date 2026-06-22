import Foundation

public enum NextGamesCache {
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    public static func write(_ games: [CachedNextGame], suite: UserDefaults? = AppGroupStorage.suite) {
        guard let suite,
              let data = try? encoder.encode(games) else { return }
        suite.set(data, forKey: AppGroupStorage.Keys.nextGames)
    }

    public static func read(suite: UserDefaults? = AppGroupStorage.suite) -> [CachedNextGame] {
        guard let suite,
              let data = suite.data(forKey: AppGroupStorage.Keys.nextGames) else { return [] }
        return (try? decoder.decode([CachedNextGame].self, from: data)) ?? []
    }

    public static func clear(suite: UserDefaults? = AppGroupStorage.suite) {
        suite?.removeObject(forKey: AppGroupStorage.Keys.nextGames)
    }
}
