import Foundation

public struct CachedNextGame: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let title: String
    public let clubName: String?
    public let startTime: Date
    public let status: String
    public let resultsStatus: String
    public let gameType: String
    public let participantCount: Int
    public let maxParticipants: Int?
    public let sport: String?
    public let playersPerMatch: Int?

    public init(
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
