import Foundation

public enum NextGamePicker {
    /// Canonical policy (keep in sync with `NEXT_GAME_DISPLAY_POLICY` / golden JSON — #273):
    /// Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins.
    public static let displayPolicy =
        "Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins."

    /// Integer-ms lookback — matches JS `NEXT_GAME_LOOKBACK_MS` / Kotlin `LOOKBACK_MS`.
    public static let lookbackMilliseconds: Int64 = 3_600_000

    /// Matches JS `pickNextGame` / Kotlin `NextGamePicker.pickNextDisplayable`.
    /// Compares truncated epoch milliseconds so cutoff edges agree across platforms.
    public static func pickNextDisplayable(
        from games: [CachedNextGame],
        reference: Date = Date()
    ) -> CachedNextGame? {
        listDisplayable(from: games, reference: reference).first
    }

    /// Displayable upcoming games sorted by soonest startTime (same filter as pickNext).
    /// Matches Kotlin `NextGamePicker.listDisplayable`.
    public static func listDisplayable(
        from games: [CachedNextGame],
        reference: Date = Date()
    ) -> [CachedNextGame] {
        let cutoffMs = epochMilliseconds(reference) - lookbackMilliseconds
        return games
            .compactMap { game -> (CachedNextGame, Int64)? in
                if game.status == "FINISHED" || game.status == "ARCHIVED" { return nil }
                let startMs = epochMilliseconds(game.startTime)
                if startMs <= cutoffMs { return nil }
                return (game, startMs)
            }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    /// Truncate toward −∞ to Integer ms (same semantics as JS `Date#getTime`).
    private static func epochMilliseconds(_ date: Date) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1000.0).rounded(.towardZero))
    }
}
