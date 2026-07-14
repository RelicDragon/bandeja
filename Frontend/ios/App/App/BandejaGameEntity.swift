import AppIntents
import Foundation
import BandejaNextGames

/// Game AppEntity for the gameEntity assistant layer (#279).
/// Backed by the next-games envelope — not a substitute for feature `nextGame*` URLs.
struct BandejaGameEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Game")
    static var defaultQuery = BandejaGameEntityQuery()

    var id: String
    var title: String
    var clubName: String?
    var startTime: Date

    var displayRepresentation: DisplayRepresentation {
        var subtitleParts: [String] = []
        if let clubName, !clubName.isEmpty {
            subtitleParts.append(clubName)
        }
        // Start time disambiguates same-title games for Siri / Shortcuts picker.
        subtitleParts.append(
            startTime.formatted(date: .abbreviated, time: .shortened)
        )
        return DisplayRepresentation(
            title: "\(title)",
            subtitle: "\(subtitleParts.joined(separator: " · "))"
        )
    }

    init(id: String, title: String, clubName: String?, startTime: Date) {
        self.id = id
        self.title = title
        self.clubName = clubName
        self.startTime = startTime
    }

    init(cached: CachedNextGame) {
        self.init(
            id: cached.id,
            title: cached.title,
            clubName: cached.clubName,
            startTime: cached.startTime
        )
    }
}

struct BandejaGameEntityQuery: EntityQuery {
    private static let suggestLimit = 8

    /// Resolve by id from the full envelope (even if no longer displayable) so
    /// in-flight Siri parameter resolution does not fail when a game just aged out.
    func entities(for identifiers: [String]) async throws -> [BandejaGameEntity] {
        let games = NextGamesEnvelopeStore.read().games
        let idSet = Set(identifiers)
        return games.filter { idSet.contains($0.id) }.map(BandejaGameEntity.init(cached:))
    }

    func suggestedEntities() async throws -> [BandejaGameEntity] {
        Array(BandejaWidgetGames.displayableEntities().prefix(Self.suggestLimit))
    }
}

extension BandejaGameEntityQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [BandejaGameEntity] {
        let needle = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let pool = BandejaWidgetGames.displayableEntities()
        guard !needle.isEmpty else {
            return Array(pool.prefix(Self.suggestLimit))
        }
        return Array(
            pool
                .filter { game in
                    game.title.lowercased().contains(needle)
                        || (game.clubName?.lowercased().contains(needle) ?? false)
                }
                .prefix(Self.suggestLimit)
        )
    }
}

enum BandejaWidgetGames {
    /// Auth + displayable next-game policy — source for Assistant feature/entity resolution.
    static func displayableEntities(reference: Date = Date()) -> [BandejaGameEntity] {
        let envelope = NextGamesEnvelopeStore.read()
        guard envelope.isAuthenticated else { return [] }
        return NextGamePicker.listDisplayable(from: envelope.games, reference: reference)
            .map(BandejaGameEntity.init(cached:))
    }

    static func nextEntity(reference: Date = Date()) -> BandejaGameEntity? {
        displayableEntities(reference: reference).first
    }
}
