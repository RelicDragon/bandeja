import Foundation
import UIKit
import Capacitor

enum BandejaDeepLink {
    static let find = URL(string: "https://bandeja.me/find")!
    static let myGames = URL(string: "https://bandeja.me/")!
    static let createGame = URL(string: "https://bandeja.me/create-game")!
    static let nextGame = URL(string: "https://bandeja.me/next-game")!

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
