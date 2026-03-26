import Foundation

struct WatchGame: Codable, Identifiable, Sendable {
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
    let ballsInGames: Int?
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
}

struct WatchParticipant: Codable, Sendable {
    let userId: String
    let role: String
    let user: WatchUser
}

extension WatchParticipant: Identifiable {
    var id: String { userId }
}

struct WatchUser: Codable, Sendable {
    let id: String
    let firstName: String?
    let lastName: String?
    let level: Double?

    var displayName: String {
        let first = firstName ?? ""
        let lastInitial = lastName.map { " \($0.prefix(1))." } ?? ""
        return "\(first)\(lastInitial)".trimmingCharacters(in: .whitespaces)
    }
}

struct WatchClub: Codable, Sendable {
    let id: String
    let name: String
}

struct ApiResponse<T: Decodable & Sendable>: Decodable, Sendable {
    let success: Bool
    let data: T
}
