import XCTest
@testable import BandejaWatch_Watch_App

@MainActor
final class WatchWeatherTests: XCTestCase {
    func testGameDecodesWeatherSummary() throws {
        let game = try WatchTestFixtures.decodeGame("""
        {
          "id":"game-1",
          "gameType":"AMERICANO",
          "entityType":"GAME",
          "status":"STARTED",
          "resultsStatus":"NONE",
          "startTime":"2026-05-29T12:00:00.000Z",
          "maxParticipants":4,
          "sport":"PADEL",
          "participantsReady":true,
          "teamsReady":true,
          "hasFixedTeams":false,
          "participants":[\(WatchTestFixtures.participant(id: "u1"))],
          "weatherSummary":{
            "time":"2026-05-29T12:00:00.000Z",
            "temperatureC":23.4,
            "temperatureF":74.1,
            "weatherCode":1,
            "conditionKey":"mainly_clear",
            "precipitationProbability":15,
            "precipitationMm":0,
            "windSpeedKmh":11.8,
            "relativeHumidity":54,
            "isDay":true,
            "provider":"open-meteo",
            "fetchedAt":"2026-05-29T08:00:00.000Z",
            "stale":false
          }
        }
        """)

        XCTAssertEqual(game.weatherSummary?.conditionKey, "mainly_clear")
        XCTAssertEqual(game.weatherSummary?.temperatureLabel(localeIdentifier: "en-US"), "74°F")
        XCTAssertEqual(game.weatherSummary?.temperatureLabel(localeIdentifier: "en-GB"), "23°C")
        XCTAssertEqual(game.weatherSummary?.precipitationProbability, 15)
        XCTAssertEqual(Int((game.weatherSummary?.windSpeedKmh ?? 0).rounded()), 12)
    }

    func testMalformedWeatherDoesNotBreakGameDecoding() throws {
        let game = try WatchTestFixtures.decodeGame("""
        {
          "id":"game-1",
          "gameType":"AMERICANO",
          "entityType":"GAME",
          "status":"STARTED",
          "resultsStatus":"NONE",
          "startTime":"2026-05-29T12:00:00.000Z",
          "maxParticipants":4,
          "participantsReady":true,
          "teamsReady":true,
          "hasFixedTeams":false,
          "participants":[\(WatchTestFixtures.participant(id: "u1"))],
          "weatherSummary":{"conditionKey":"clear"}
        }
        """)

        XCTAssertNil(game.weatherSummary)
    }
}
