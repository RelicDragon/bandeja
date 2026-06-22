import Foundation
import BandejaWatchShared

extension CachedNextGame {
    init(from game: WatchGame) {
        self.init(
            id: game.id,
            title: game.displayTitle,
            clubName: game.club?.name,
            startTime: game.startTime,
            status: game.status,
            resultsStatus: game.resultsStatus,
            gameType: game.gameType,
            participantCount: game.participantCount,
            maxParticipants: game.maxParticipants,
            sport: game.sport,
            playersPerMatch: game.playersPerMatch
        )
    }

    var relativeTimeString: String {
        let lang = WatchWidgetLangBridge.normalizedFromStorageOrDevice()
        let interval = startTime.timeIntervalSince(.now)
        if interval < 0, interval > -3600 { return WatchCopy.now(lang) }
        if interval < 0 { return WatchCopy.gameEnded(lang) }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.locale = Locale(identifier: lang == "en" ? "en" : lang)
        return formatter.localizedString(for: startTime, relativeTo: .now)
    }

    var hoursUntilStart: Double {
        max(0, startTime.timeIntervalSince(.now) / 3600)
    }
}
