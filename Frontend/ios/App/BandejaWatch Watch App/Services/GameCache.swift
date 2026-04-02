import Foundation

enum GameCache {
    private static let key = "bandeja.widget.nextGames.v1"

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private static var suite: UserDefaults? {
        UserDefaults(suiteName: KeychainHelper.accessGroup)
    }

    static func write(_ games: [CachedNextGame]) {
        guard let suite else { return }
        guard let data = try? encoder.encode(games) else { return }
        suite.set(data, forKey: key)
    }

    static func read() -> [CachedNextGame] {
        guard let suite, let data = suite.data(forKey: key) else { return [] }
        return (try? decoder.decode([CachedNextGame].self, from: data)) ?? []
    }

    static func clear() {
        suite?.removeObject(forKey: key)
    }
}
