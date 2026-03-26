import Foundation

private enum WatchJSONCoding {
    nonisolated static func parseISO8601Date(_ string: String) throws -> Date {
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFrac.date(from: string) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let d = plain.date(from: string) { return d }
        throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Invalid ISO8601 date: \(string)"))
    }

    nonisolated static func parseOptionalISO8601Date(_ string: String?) -> Date? {
        guard let string else { return nil }
        return try? parseISO8601Date(string)
    }
}

struct WatchGame: Decodable, Identifiable, Sendable {
    let id: String
    let name: String?
    let gameType: String
    let entityType: String
    let status: String
    let resultsStatus: String
    let startTime: Date
    let endTime: Date?
    let winnerOfMatch: String?
    let winnerOfGame: String?
    let fixedNumberOfSets: Int?
    let maxTotalPointsPerSet: Int?
    let maxPointsPerTeam: Int?
    let ballsInGames: Bool?
    let maxParticipants: Int?
    let timeIsSet: Bool
    let affectsRating: Bool?
    let hasFixedTeams: Bool?
    let resultsByAnyone: Bool?
    let participants: [WatchParticipant]
    let club: WatchClub?

    var displayTitle: String {
        if let name, !name.isEmpty { return name }
        return club?.name ?? gameType.capitalized
    }

    var participantCount: Int { participants.count }

    var participantCountLabel: String {
        if let max = maxParticipants {
            return "\(participants.count)/\(max)"
        }
        return "\(participants.count) players"
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, gameType, entityType, status, resultsStatus
        case startTime, endTime, winnerOfMatch, winnerOfGame
        case fixedNumberOfSets, maxTotalPointsPerSet, maxPointsPerTeam, ballsInGames
        case maxParticipants, timeIsSet, affectsRating, hasFixedTeams, resultsByAnyone
        case participants, club
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        gameType = try c.decode(String.self, forKey: .gameType)
        entityType = try c.decode(String.self, forKey: .entityType)
        status = try c.decode(String.self, forKey: .status)
        resultsStatus = try c.decode(String.self, forKey: .resultsStatus)

        let startStr = try c.decode(String.self, forKey: .startTime)
        startTime = try WatchJSONCoding.parseISO8601Date(startStr)
        let endStr = try c.decodeIfPresent(String.self, forKey: .endTime)
        endTime = WatchJSONCoding.parseOptionalISO8601Date(endStr)

        winnerOfMatch = try c.decodeIfPresent(String.self, forKey: .winnerOfMatch)
        winnerOfGame = try c.decodeIfPresent(String.self, forKey: .winnerOfGame)
        fixedNumberOfSets = try c.decodeIfPresent(Int.self, forKey: .fixedNumberOfSets)
        maxTotalPointsPerSet = try c.decodeIfPresent(Int.self, forKey: .maxTotalPointsPerSet)
        maxPointsPerTeam = try c.decodeIfPresent(Int.self, forKey: .maxPointsPerTeam)
        ballsInGames = try c.decodeIfPresent(Bool.self, forKey: .ballsInGames)
        maxParticipants = try c.decodeIfPresent(Int.self, forKey: .maxParticipants)
        timeIsSet = try c.decodeIfPresent(Bool.self, forKey: .timeIsSet) ?? false
        affectsRating = try c.decodeIfPresent(Bool.self, forKey: .affectsRating)
        hasFixedTeams = try c.decodeIfPresent(Bool.self, forKey: .hasFixedTeams)
        resultsByAnyone = try c.decodeIfPresent(Bool.self, forKey: .resultsByAnyone)
        participants = try c.decode([WatchParticipant].self, forKey: .participants)
        club = try c.decodeIfPresent(WatchClub.self, forKey: .club)
    }
}

struct WatchParticipant: Decodable, Sendable {
    let userId: String
    let role: String
    let user: WatchUser

    private enum CodingKeys: String, CodingKey {
        case userId, role, user
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        role = try c.decode(String.self, forKey: .role)
        user = try c.decode(WatchUser.self, forKey: .user)
    }
}

extension WatchParticipant: Identifiable {
    var id: String { userId }
}

struct WatchUser: Decodable, Sendable {
    let id: String
    let firstName: String?
    let lastName: String?
    let level: Double?

    var displayName: String {
        let first = firstName ?? ""
        let lastInitial = lastName.map { " \($0.prefix(1))." } ?? ""
        return "\(first)\(lastInitial)".trimmingCharacters(in: .whitespaces)
    }

    private enum CodingKeys: String, CodingKey {
        case id, firstName, lastName, level
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        firstName = try c.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName)
        level = try c.decodeIfPresent(Double.self, forKey: .level)
    }
}

struct WatchClub: Decodable, Sendable {
    let id: String
    let name: String

    private enum CodingKeys: String, CodingKey {
        case id, name
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
    }
}

struct ApiResponse<T: Decodable & Sendable>: Decodable, Sendable {
    let success: Bool
    let data: T

    private enum CodingKeys: String, CodingKey {
        case success, data
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = try c.decode(Bool.self, forKey: .success)
        data = try c.decode(T.self, forKey: .data)
    }
}
