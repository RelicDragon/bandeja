import AppIntents

/// Feature layer (#279): open next displayable game (`nextGame` / cache-first game URL).
struct OpenNextGameIntent: AppIntent {
    static var title: LocalizedStringResource = "Open next game"
    static var description = IntentDescription("Open your next upcoming game")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let next = BandejaWidgetGames.nextEntity() {
            BandejaDeepLink.open(BandejaDeepLink.game(next.id))
        } else {
            BandejaDeepLink.open(BandejaDeepLink.nextGame)
        }
        return .result()
    }
}
