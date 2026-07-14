import Foundation
import Capacitor
import UIKit

/// HTTPS deep links — keep equal to `Frontend/src/deepLinks/catalog.mirror.json` (#278).
enum BandejaDeepLink {
    static let myGames = URL(string: "https://bandeja.me/")!
    static let login = URL(string: "https://bandeja.me/login")!
    static let createGame = URL(string: "https://bandeja.me/create-game")!
    static let createLeague = URL(string: "https://bandeja.me/create-league")!
    static let nextGame = URL(string: "https://bandeja.me/next-game")!
    static let chats = URL(string: "https://bandeja.me/chats")!
    static let invites = URL(string: "https://bandeja.me/?focus=invites")!
    static let findToday = URL(string: "https://bandeja.me/find?view=calendar&dayOffset=0")!
    static let findTomorrow = URL(string: "https://bandeja.me/find?view=calendar&dayOffset=1")!
    static let nextGameChat = URL(string: "https://bandeja.me/next-game?open=chat")!
    static let nextGameLive = URL(string: "https://bandeja.me/next-game?open=live")!

    static func game(_ id: String) -> URL {
        URL(string: "https://bandeja.me/games/\(id)")!
    }

    static func gameChat(_ id: String) -> URL {
        URL(string: "https://bandeja.me/games/\(id)/chat")!
    }

    static func gameLive(_ id: String) -> URL {
        URL(string: "https://bandeja.me/games/\(id)/live")!
    }

    /// Route through Capacitor so Siri intents never bounce to Safari.
    @MainActor
    static func open(_ url: URL) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: url,
            options: [:]
        )
    }
}
