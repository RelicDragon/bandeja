import Foundation
import BandejaNextGames

enum WidgetGameCache {
    static func read() -> [CachedNextGame] {
        NextGamesCache.read()
    }

    static func nextDisplayableGame(reference: Date = .now) -> CachedNextGame? {
        NextGamePicker.pickNextDisplayable(from: read(), reference: reference)
    }
}

