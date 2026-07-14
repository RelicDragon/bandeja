import Foundation
@testable import BandejaNextGames

/// Shared next-game picker golden catalog (parity with JS / Kotlin — #273).
///
/// Catalog: `Frontend/shared/nextGame/pickNextGameGolden.json`
/// Policy: `Frontend/shared/nextGame/policy.ts`
enum PickNextGameGoldenFixtures {
    static let expectedPolicy =
        "Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins."

    struct FixtureGame: Decodable, Sendable {
        var id: String
        var startTime: String
        var status: String
    }

    struct Case: Decodable, Sendable {
        var name: String
        var reference: String
        var games: [FixtureGame]
        var expectedId: String?
    }

    struct Catalog: Decodable, Sendable {
        var policy: String
        var minCases: Int
        var cases: [Case]
    }

    static func catalogURL() throws -> URL {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<12 {
            let candidate = dir.appendingPathComponent("shared/nextGame/pickNextGameGolden.json")
            if FileManager.default.fileExists(atPath: candidate.path) {
                return candidate
            }
            dir = dir.deletingLastPathComponent()
        }
        throw NSError(domain: "PickNextGameGoldenFixtures", code: 2, userInfo: [
            NSLocalizedDescriptionKey:
                "pickNextGameGolden.json not found (walk up from \(#filePath))",
        ])
    }

    static func loadCatalog() throws -> Catalog {
        let data = try Data(contentsOf: catalogURL())
        let catalog = try JSONDecoder().decode(Catalog.self, from: data)
        guard !catalog.cases.isEmpty else {
            throw NSError(domain: "PickNextGameGoldenFixtures", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "pickNextGameGolden.json must be non-empty",
            ])
        }
        return catalog
    }

    static func cachedGames(from games: [FixtureGame]) throws -> [CachedNextGame] {
        try games.map { game in
            guard let start = ISO8601Dates.parse(game.startTime) else {
                throw NSError(domain: "PickNextGameGoldenFixtures", code: 3, userInfo: [
                    NSLocalizedDescriptionKey: "invalid startTime \(game.startTime) for \(game.id)",
                ])
            }
            return CachedNextGame(
                id: game.id,
                title: game.id,
                clubName: nil,
                startTime: start,
                status: game.status,
                resultsStatus: "NONE",
                gameType: "MATCH",
                participantCount: 2,
                maxParticipants: 4,
                sport: "PADEL",
                playersPerMatch: 4
            )
        }
    }

    static func referenceDate(from iso: String) throws -> Date {
        guard let date = ISO8601Dates.parse(iso) else {
            throw NSError(domain: "PickNextGameGoldenFixtures", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "invalid reference \(iso)",
            ])
        }
        return date
    }
}
