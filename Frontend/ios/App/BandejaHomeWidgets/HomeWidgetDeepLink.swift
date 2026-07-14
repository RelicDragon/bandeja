import Foundation

/// Home widget HTTPS targets — keep equal to `Frontend/src/deepLinks/catalog.mirror.json` (#278).
enum HomeWidgetDeepLink {
    static let home = URL(string: "https://bandeja.me/")!
    static let login = URL(string: "https://bandeja.me/login")!

    static func game(id: String) -> URL {
        URL(string: "https://bandeja.me/games/\(id)")!
    }
}
