import Foundation

/// Client-side mirror of the backend results authorization
/// (`Backend/src/utils/parentGamePermissions.ts` `canModifyResults` + `hasParentGamePermission`)
/// and the web `canUserEditResults` (`Frontend/src/utils/gameResults.ts`).
/// The watch must never offer an action the server would reject with 403,
/// and must not hide one the web allows.
enum WatchResultsPermissions {
    nonisolated private static let organizerStatuses: Set<String> = ["PLAYING", "NON_PLAYING", "IN_QUEUE"]

    /// OWNER / ADMIN on the game or its parent (league season) with a real roster status.
    nonisolated static func isOwnerOrAdmin(game: WatchGame, userId: String?) -> Bool {
        guard let userId else { return false }
        let onGame = game.participants.contains {
            $0.userId == userId
                && ($0.role == "OWNER" || $0.role == "ADMIN")
                && organizerStatuses.contains($0.status)
        }
        if onGame { return true }
        return game.parent?.participants?.contains {
            $0.userId == userId
                && ($0.role == "OWNER" || $0.role == "ADMIN")
                && organizerStatuses.contains($0.status)
        } ?? false
    }

    /// PLAYING on the game or on its parent (backend `isPlayingParticipant`).
    nonisolated static func isPlayingParticipant(game: WatchGame, userId: String?) -> Bool {
        guard let userId else { return false }
        if game.participants.contains(where: { $0.userId == userId && $0.isPlaying }) { return true }
        return game.parent?.participants?.contains { $0.userId == userId && $0.isPlaying } ?? false
    }

    /// Roster membership the backend accepts for `canAccessGame` (PATCH my-session etc.).
    nonisolated static func canAccessGame(game: WatchGame, userId: String?) -> Bool {
        guard let userId else { return false }
        if isOwnerOrAdmin(game: game, userId: userId) { return true }
        if game.participants.contains(where: { $0.userId == userId && organizerStatuses.contains($0.status) }) {
            return true
        }
        return game.parent?.participants?.contains {
            $0.userId == userId && organizerStatuses.contains($0.status)
        } ?? false
    }

    /// Backend `canModifyResults`: not ARCHIVED, and owner/admin, or `resultsByAnyone` + PLAYING.
    /// Platform admins are also accepted server-side (`isAdmin` claim in the JWT).
    nonisolated static func canModifyResults(game: WatchGame, userId: String?, isPlatformAdmin: Bool = false) -> Bool {
        guard game.status != "ARCHIVED" else { return false }
        guard let userId else { return false }
        if isPlatformAdmin { return true }
        if isOwnerOrAdmin(game: game, userId: userId) { return true }
        if game.resultsByAnyone == true, isPlayingParticipant(game: game, userId: userId) { return true }
        return false
    }

    /// Entity types whose results are never entered from the watch
    /// (backend `assertEventForbidsResults`; web hides results for BAR/TRAINING/LEAGUE_SEASON).
    nonisolated static func entityTypeSupportsResults(_ entityType: String) -> Bool {
        !["BAR", "TRAINING", "LEAGUE_SEASON", "EVENT"].contains(entityType)
    }
}
