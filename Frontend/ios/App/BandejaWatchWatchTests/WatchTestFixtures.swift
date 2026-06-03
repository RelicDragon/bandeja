import Foundation
@testable import BandejaWatch_Watch_App

enum WatchTestFixtures {
    static func decodeGame(_ json: String) throws -> WatchGame {
        let data = Data(json.utf8)
        return try JSONDecoder().decode(WatchGame.self, from: data)
    }

    static func participant(id: String) -> String {
        """
        {"userId":"\(id)","role":"PLAYER","status":"PLAYING","user":{"id":"\(id)","firstName":"P\(id.suffix(1))"}}
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
        let participants = participantIds.map(participant).joined(separator: ",")
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
}
