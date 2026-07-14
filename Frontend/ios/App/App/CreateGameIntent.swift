import AppIntents

struct CreateGameIntent: AppIntent {
    static var title: LocalizedStringResource = "Create a game"
    static var description = IntentDescription("Start creating a new game")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.createGame)
        return .result()
    }
}
