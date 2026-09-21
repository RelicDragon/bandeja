import Foundation
@testable import BandejaWatch_Watch_App

enum WatchTestFixtures {
    static func decodeGame(_ json: String) throws -> WatchGame {
        let data = Data(json.utf8)
        return try JSONDecoder().decode(WatchGame.self, from: data)
    }

    static func participant(id: String, status: String = "PLAYING") -> String {
        """
        {"userId":"\(id)","role":"PLAYER","status":"\(status)","user":{"id":"\(id)","firstName":"P\(id.suffix(1))"}}
        """
    }

    static func baseGame(
        sport: String = "PADEL",
        playersPerMatch: Int? = nil,
        maxParticipants: Int = 4,
        participantsReady: Bool = true,
        teamsReady: Bool = true,
        hasFixedTeams: Bool = false,
        fixedTeamsJSON: String = "null",
        participantIds: [String]
    ) -> String {
        let ppmField = playersPerMatch.map { "\"playersPerMatch\":\($0)," } ?? ""
        let participants = participantIds.map { participant(id: $0) }.joined(separator: ",")
        return """
        {
          "id":"game-1",
          "gameType":"AMERICANO",
          "entityType":"GAME",
          "status":"STARTED",
          "resultsStatus":"NONE",
          "startTime":"2026-05-29T12:00:00.000Z",
          "maxParticipants":\(maxParticipants),
          "sport":"\(sport)",
          \(ppmField)
          "participantsReady":\(participantsReady),
          "teamsReady":\(teamsReady),
          "hasFixedTeams":\(hasFixedTeams),
          "fixedTeams":\(fixedTeamsJSON),
          "participants":[\(participants)]
        }
        """
    }

    /// PRD 346 — a `GET /games/my-games` row carrying the viewer's own answer.
    static func gameWithAttendance(
        viewerAttendance: String?,
        status: String = "ANNOUNCED",
        startTime: String = "2026-05-29T12:00:00.000Z",
        confirmedCount: Int = 1,
        playingCount: Int = 4
    ) -> String {
        let viewer = viewerAttendance.map { "\"\($0)\"" } ?? "null"
        let participants = ["a", "b", "c", "d"].map { participant(id: $0) }.joined(separator: ",")
        return """
        {
          "id":"game-1",
          "gameType":"AMERICANO",
          "entityType":"GAME",
          "status":"\(status)",
          "resultsStatus":"NONE",
          "startTime":"\(startTime)",
          "maxParticipants":4,
          "sport":"PADEL",
          "participantsReady":true,
          "teamsReady":true,
          "hasFixedTeams":false,
          "fixedTeams":null,
          "participants":[\(participants)],
          "attendanceSummary":{
            "viewerAttendance":\(viewer),
            "confirmedCount":\(confirmedCount),
            "unsureCount":0,
            "unansweredCount":\(max(0, playingCount - confirmedCount)),
            "playingCount":\(playingCount)
          }
        }
        """
    }
}
