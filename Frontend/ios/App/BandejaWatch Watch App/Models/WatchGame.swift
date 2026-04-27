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
    let scoringPreset: String?
    let matchTimedCapMinutes: Int?
    let matchTimerEnabled: Bool?
    let hasGoldenPoint: Bool?
    let maxParticipants: Int?
    let timeIsSet: Bool
    let affectsRating: Bool?
    let hasFixedTeams: Bool?
    let participantsReady: Bool
    let teamsReady: Bool
    let matchGenerationType: String?
    let fixedTeams: [WatchFixedTeam]?
    let resultsByAnyone: Bool?
    let participants: [WatchParticipant]
    let parent: WatchGameParent?
    let club: WatchClub?

    var displayTitle: String {
        if let name, !name.isEmpty { return name }
        return club?.name ?? gameType.capitalized
    }

    var participantCount: Int { participants.filter(\.isPlaying).count }

    var participantCountLabel: String {
        let n = participantCount
        if entityType == "BAR" {
            return "\(n)"
        }
        if let max = maxParticipants {
            return "\(n)/\(max)"
        }
        return "\(n) players"
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, gameType, entityType, status, resultsStatus
        case startTime, endTime, winnerOfMatch, winnerOfGame
        case fixedNumberOfSets, maxTotalPointsPerSet, maxPointsPerTeam, ballsInGames, scoringPreset, matchTimedCapMinutes, matchTimerEnabled, hasGoldenPoint
        case maxParticipants, timeIsSet, affectsRating, hasFixedTeams, participantsReady, teamsReady, matchGenerationType, fixedTeams, resultsByAnyone
        case participants, parent, club
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
        scoringPreset = try c.decodeIfPresent(String.self, forKey: .scoringPreset)
        matchTimedCapMinutes = try c.decodeIfPresent(Int.self, forKey: .matchTimedCapMinutes)
        matchTimerEnabled = try c.decodeIfPresent(Bool.self, forKey: .matchTimerEnabled)
        hasGoldenPoint = try c.decodeIfPresent(Bool.self, forKey: .hasGoldenPoint)
        maxParticipants = try c.decodeIfPresent(Int.self, forKey: .maxParticipants)
        timeIsSet = try c.decodeIfPresent(Bool.self, forKey: .timeIsSet) ?? false
        affectsRating = try c.decodeIfPresent(Bool.self, forKey: .affectsRating)
        hasFixedTeams = try c.decodeIfPresent(Bool.self, forKey: .hasFixedTeams)
        participantsReady = try c.decodeIfPresent(Bool.self, forKey: .participantsReady) ?? false
        teamsReady = try c.decodeIfPresent(Bool.self, forKey: .teamsReady) ?? false
        matchGenerationType = try c.decodeIfPresent(String.self, forKey: .matchGenerationType)
        fixedTeams = try c.decodeIfPresent([WatchFixedTeam].self, forKey: .fixedTeams)
        resultsByAnyone = try c.decodeIfPresent(Bool.self, forKey: .resultsByAnyone)
        participants = try c.decode([WatchParticipant].self, forKey: .participants)
        parent = try c.decodeIfPresent(WatchGameParent.self, forKey: .parent)
        club = try c.decodeIfPresent(WatchClub.self, forKey: .club)
    }

    var isMatchTimerEnabled: Bool {
        let cap = matchTimedCapMinutes ?? 0
        guard cap >= 1 else { return false }
        if matchTimerEnabled == true { return true }
        guard let p = scoringPreset?.uppercased() else { return false }
        return p == "TIMED" || p == "CLASSIC_TIMED"
    }
}

struct WatchGameParent: Decodable, Sendable {
    let participants: [WatchParticipant]?

    private enum CodingKeys: String, CodingKey {
        case participants
    }
}

struct WatchParticipant: Decodable, Sendable {
    let userId: String
    let role: String
    let status: String
    let user: WatchUser
    let activeMatchId: String?

    var isPlaying: Bool { status == "PLAYING" }

    private enum CodingKeys: String, CodingKey {
        case userId, role, status, user, activeMatchId
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        role = try c.decode(String.self, forKey: .role)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? ""
        user = try c.decode(WatchUser.self, forKey: .user)
        activeMatchId = try c.decodeIfPresent(String.self, forKey: .activeMatchId)
    }
}

extension WatchParticipant: Identifiable {
    var id: String { userId }
}

struct WatchFixedTeam: Decodable, Sendable {
    let teamNumber: Int
    let players: [WatchFixedTeamPlayer]

    private enum CodingKeys: String, CodingKey {
        case teamNumber, players
    }
}

struct WatchFixedTeamPlayer: Decodable, Sendable {
    let userId: String

    private enum CodingKeys: String, CodingKey {
        case userId
    }
}

struct WatchUser: Decodable, Sendable {
    let id: String
    let firstName: String?
    let lastName: String?
    let avatar: String?
    let level: Double?

    var displayName: String {
        let first = firstName ?? ""
        let lastInitial = lastName.map { " \($0.prefix(1))." } ?? ""
        return "\(first)\(lastInitial)".trimmingCharacters(in: .whitespaces)
    }

    private enum CodingKeys: String, CodingKey {
        case id, firstName, lastName, level, avatar
    }

    var resolvedAvatarURL: URL? {
        guard let raw = avatar?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            return URL(string: raw)
        }
        let path = raw.hasPrefix("/") ? raw : "/\(raw)"
        return URL(string: APIClient.mediaOrigin + path)
    }

    /// Circular avatars: `_avatar.jpg` or legacy `_avatar.jpeg`. Tiny is always `_avatar.tiny.jpg`.
    private static func userAvatarTinyRaw(from raw: String) -> String? {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        var endIdx = t.endIndex
        if let q = t.firstIndex(of: "?") { endIdx = min(endIdx, q) }
        if let h = t.firstIndex(of: "#") { endIdx = min(endIdx, h) }
        let base = String(t[..<endIdx])
        let baseLower = base.lowercased()
        let tailIdx: String.Index
        if baseLower.hasSuffix("_avatar.jpeg") {
            tailIdx = base.index(base.endIndex, offsetBy: -"_avatar.jpeg".count)
        } else if baseLower.hasSuffix("_avatar.jpg") {
            tailIdx = base.index(base.endIndex, offsetBy: -"_avatar.jpg".count)
        } else {
            return nil
        }
        let tinyBase = String(base[..<tailIdx]) + "_avatar.tiny.jpg"
        let rest = endIdx < t.endIndex ? String(t[endIdx...]) : ""
        return tinyBase + rest
    }

    var resolvedTinyAvatarURL: URL? {
        guard let raw = avatar?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        guard let tinyRaw = Self.userAvatarTinyRaw(from: raw) else { return nil }
        if tinyRaw.hasPrefix("http://") || tinyRaw.hasPrefix("https://") {
            return URL(string: tinyRaw)
        }
        let path = tinyRaw.hasPrefix("/") ? tinyRaw : "/\(tinyRaw)"
        return URL(string: APIClient.mediaOrigin + path)
    }

    var initials: String {
        let first = firstName?.prefix(1) ?? ""
        let last = lastName?.prefix(1) ?? ""
        let s = "\(first)\(last)"
        return s.isEmpty ? "?" : String(s)
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        firstName = try c.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName)
        avatar = try c.decodeIfPresent(String.self, forKey: .avatar)
        if let d = try? c.decode(Double.self, forKey: .level) {
            level = d
        } else if let s = try? c.decode(String.self, forKey: .level), let d = Double(s) {
            level = d
        } else {
            level = nil
        }
    }
}

extension WatchUser: Identifiable {}

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

struct ApiResponse<T: Decodable>: Decodable, Sendable {
    let success: Bool
    let data: T
}
