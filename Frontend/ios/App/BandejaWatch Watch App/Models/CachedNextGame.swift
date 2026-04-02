import Foundation

struct CachedNextGame: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let title: String
    let clubName: String?
    let startTime: Date
    let status: String
    let resultsStatus: String
    let gameType: String
    let participantCount: Int
    let maxParticipants: Int?

    init(
        id: String,
        title: String,
        clubName: String?,
        startTime: Date,
        status: String,
        resultsStatus: String,
        gameType: String,
        participantCount: Int,
        maxParticipants: Int?
    ) {
        self.id = id
        self.title = title
        self.clubName = clubName
        self.startTime = startTime
        self.status = status
        self.resultsStatus = resultsStatus
        self.gameType = gameType
        self.participantCount = participantCount
        self.maxParticipants = maxParticipants
    }

    init(from game: WatchGame) {
        id = game.id
        title = game.displayTitle
        clubName = game.club?.name
        startTime = game.startTime
        status = game.status
        resultsStatus = game.resultsStatus
        gameType = game.gameType
        participantCount = game.participantCount
        maxParticipants = game.maxParticipants
    }
}

extension CachedNextGame {
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
