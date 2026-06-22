import Foundation

public enum WatchConnectivityRelayLimits {
    public static let payloadLimitBytes = 60_000

    public static func exceedsLimit(_ payload: [String: Any]) -> Bool {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload) else {
            return true
        }
        return data.count > payloadLimitBytes
    }
}

public struct LiveScoringRelayPayload {
    public let gameId: String
    public let matchId: String
    public let revision: Int
    public let liveScoring: [String: Any]?
    public let isExplicitClear: Bool

    public init(
        gameId: String,
        matchId: String,
        revision: Int,
        liveScoring: [String: Any]?,
        isExplicitClear: Bool = false
    ) {
        self.gameId = gameId
        self.matchId = matchId
        self.revision = revision
        self.liveScoring = liveScoring
        self.isExplicitClear = isExplicitClear
    }

    public init?(decode dictionary: [String: Any]) {
        guard dictionary["event"] as? String == WatchConnectivityEvent.liveScoringRelay,
              let gameId = dictionary["gameId"] as? String,
              let matchId = dictionary["matchId"] as? String else { return nil }
        self.gameId = gameId
        self.matchId = matchId
        revision = Self.parseRevision(dictionary["revision"])
        if dictionary["liveScoring"] is NSNull {
            liveScoring = nil
            isExplicitClear = true
            return
        }
        isExplicitClear = false
        if let raw = dictionary["liveScoring"] as? [String: Any] {
            liveScoring = raw
        } else {
            liveScoring = nil
        }
    }

    public func encode() -> [String: Any] {
        var payload: [String: Any] = [
            "event": WatchConnectivityEvent.liveScoringRelay,
            "gameId": gameId,
            "matchId": matchId,
            "revision": revision,
        ]
        if isExplicitClear {
            payload["liveScoring"] = NSNull()
        } else if let liveScoring {
            payload["liveScoring"] = liveScoring
        } else {
            payload["liveScoring"] = NSNull()
        }
        return payload
    }

    public static func parseRevision(from liveScoring: [String: Any]?) -> Int {
        guard let liveScoring else { return 0 }
        return parseRevision(liveScoring["revision"])
    }

    private static func parseRevision(_ value: Any?) -> Int {
        if let revision = value as? Int { return revision }
        if let revision = value as? Double { return Int(revision) }
        return 0
    }
}

public struct MatchTimerRelayPayload {
    public let gameId: String
    public let matchId: String
    public let snapshot: [String: Any]

    public init(gameId: String, matchId: String, snapshot: [String: Any]) {
        self.gameId = gameId
        self.matchId = matchId
        self.snapshot = snapshot
    }

    public init?(decode dictionary: [String: Any]) {
        guard dictionary["event"] as? String == WatchConnectivityEvent.matchTimerRelay,
              let gameId = dictionary["gameId"] as? String,
              let matchId = dictionary["matchId"] as? String,
              let snapshot = dictionary["snapshot"] as? [String: Any] else { return nil }
        self.gameId = gameId
        self.matchId = matchId
        self.snapshot = snapshot
    }

    public func encode() -> [String: Any] {
        [
            "event": WatchConnectivityEvent.matchTimerRelay,
            "gameId": gameId,
            "matchId": matchId,
            "snapshot": snapshot,
        ]
    }
}

public struct ScoreUpdatedPayload: Sendable {
    public let gameId: String
    public let matchId: String
    public let revision: Int?

    public init(gameId: String, matchId: String, revision: Int? = nil) {
        self.gameId = gameId
        self.matchId = matchId
        self.revision = revision
    }

    public init?(decode dictionary: [String: Any]) {
        guard dictionary["event"] as? String == WatchConnectivityEvent.scoreUpdated,
              let gameId = dictionary["gameId"] as? String,
              let matchId = dictionary["matchId"] as? String else { return nil }
        self.gameId = gameId
        self.matchId = matchId
        if let revision = dictionary["revision"] as? Int {
            self.revision = revision
        } else if let revision = dictionary["revision"] as? Double {
            self.revision = Int(revision)
        } else {
            revision = nil
        }
    }

    public func encode() -> [String: Any] {
        var payload: [String: Any] = [
            "event": WatchConnectivityEvent.scoreUpdated,
            "gameId": gameId,
            "matchId": matchId,
        ]
        if let revision {
            payload["revision"] = revision
        }
        return payload
    }

    public var notificationUserInfo: [String: Any] {
        var payload: [String: Any] = [
            "gameId": gameId,
            "matchId": matchId,
        ]
        if let revision {
            payload["revision"] = revision
        }
        return payload
    }
}

public struct WatchAuthSyncPayload: Sendable {
    public let token: String?
    public let isLogout: Bool
    public let language: String?
    public let weekStart: String?
    public let defaultCurrency: String?
    public let timeFormat: String?
    public let prefsVersion: Double?

    public var hasPreferences: Bool {
        language != nil || weekStart != nil || defaultCurrency != nil
            || timeFormat != nil || prefsVersion != nil
    }

    public init(
        token: String? = nil,
        isLogout: Bool = false,
        language: String? = nil,
        weekStart: String? = nil,
        defaultCurrency: String? = nil,
        timeFormat: String? = nil,
        prefsVersion: Double? = nil
    ) {
        self.token = token
        self.isLogout = isLogout
        self.language = language
        self.weekStart = weekStart
        self.defaultCurrency = defaultCurrency
        self.timeFormat = timeFormat
        self.prefsVersion = prefsVersion
    }

    public init?(decode dictionary: [String: Any]) {
        isLogout = dictionary["event"] as? String == WatchConnectivityEvent.logout
        token = dictionary["token"] as? String
        language = dictionary["language"] as? String
        weekStart = dictionary["weekStart"] as? String
        defaultCurrency = dictionary["defaultCurrency"] as? String
        timeFormat = dictionary["timeFormat"] as? String
        if let version = dictionary["prefsVersion"] as? Double {
            prefsVersion = version
        } else if let version = dictionary["prefsVersion"] as? Int {
            prefsVersion = Double(version)
        } else {
            prefsVersion = nil
        }
        if !isLogout && token == nil && !hasPreferences {
            return nil
        }
    }

    public func encode() -> [String: Any] {
        if isLogout {
            return ["event": WatchConnectivityEvent.logout]
        }
        var payload: [String: Any] = [:]
        if let token, !token.isEmpty {
            payload["token"] = token
        }
        if let language, !language.isEmpty { payload["language"] = language }
        if let weekStart, !weekStart.isEmpty { payload["weekStart"] = weekStart }
        if let defaultCurrency, !defaultCurrency.isEmpty { payload["defaultCurrency"] = defaultCurrency }
        if let timeFormat, !timeFormat.isEmpty { payload["timeFormat"] = timeFormat }
        if let prefsVersion { payload["prefsVersion"] = prefsVersion }
        return payload
    }

    public static func logoutPayload() -> [String: Any] {
        ["event": WatchConnectivityEvent.logout]
    }
}
