import Foundation
import BandejaNextGames

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
        formatter.locale = Locale(identifier: lang)
        return formatter.localizedString(for: startTime, relativeTo: .now)
    }

    var hoursUntilStart: Double {
        max(0, startTime.timeIntervalSince(.now) / 3600)
    }

    /// PRD 346 — the Next Game view offers Confirm when the viewer has not
    /// answered and the game starts within 24 h. Answering is a courtesy signal:
    /// not answering never costs the player their seat.
    ///
    /// TODO(PRD-346): `init(from: WatchGame)` never passes `attendance`, so this is
    /// always `false` on the watch. `GET /games/my-games` already exposes the viewer's
    /// answer as `attendanceSummary.viewerAttendance` (`UNANSWERED` / `CONFIRMED` /
    /// `UNSURE`, `null` when not PLAYING) — `WatchGame` needs to decode that field and
    /// the initializer above must forward it.
    var needsAttendanceAnswer: Bool {
        attendance == "UNANSWERED" && hoursUntilStart <= 24 && status == "ANNOUNCED"
    }
}
