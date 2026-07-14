import AppIntents

struct OpenNextGameIntent: AppIntent {
    static var title: LocalizedStringResource = "Open next game"
    static var description = IntentDescription("Open your next upcoming game")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.nextGame)
        return .result()
    }
}
