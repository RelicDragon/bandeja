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
            playersPerMatch: game.playersPerMatch,
            attendance: game.attendanceSummary?.viewerAttendance
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

    /// PRD 346 — the Next Game surfaces offer Confirm when the viewer has not
    /// answered and the game starts within 24 h. Answering is a courtesy
    /// signal: not answering never costs the player their seat.
    var needsAttendanceAnswer: Bool {
        WatchAttendance.needsAnswer(
            attendance: attendance,
            status: status,
            startTime: startTime
        )
    }
}
