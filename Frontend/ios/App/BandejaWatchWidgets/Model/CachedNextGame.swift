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
    let sport: String?
    let playersPerMatch: Int?

    init(
        id: String,
        title: String,
        clubName: String?,
        startTime: Date,
        status: String,
        resultsStatus: String,
        gameType: String,
        participantCount: Int,
        maxParticipants: Int?,
        sport: String? = nil,
        playersPerMatch: Int? = nil
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
        self.sport = sport
        self.playersPerMatch = playersPerMatch
    }
}

extension CachedNextGame {
    var relativeTimeString: String {
        let lang = WatchWidgetCopy.widgetLang()
        let interval = startTime.timeIntervalSince(.now)
        if interval < 0, interval > -3600 { return WatchWidgetCopy.now(lang) }
        if interval < 0 { return WatchWidgetCopy.ended(lang) }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: startTime, relativeTo: .now)
    }

    var hoursUntilStart: Double {
        max(0, startTime.timeIntervalSince(.now) / 3600)
    }
}
