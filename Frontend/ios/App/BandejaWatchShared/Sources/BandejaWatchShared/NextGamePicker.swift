import Foundation

public enum NextGamePicker {
    /// Soonest non-finished/archived game starting after now−1h (matches JS `pickNextGame`).
    public static func pickNextDisplayable(
        from games: [CachedNextGame],
        reference: Date = Date()
    ) -> CachedNextGame? {
        let cutoff = reference.addingTimeInterval(-3600)
        var best: CachedNextGame?
        var bestStart = Date.distantFuture
        for game in games {
            if game.status == "FINISHED" || game.status == "ARCHIVED" { continue }
            guard game.startTime > cutoff else { continue }
            if game.startTime < bestStart {
                best = game
                bestStart = game.startTime
            }
        }
        return best
    }
}
