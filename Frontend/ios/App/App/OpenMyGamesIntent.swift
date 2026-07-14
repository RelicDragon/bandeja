import AppIntents

struct OpenMyGamesIntent: AppIntent {
    static var title: LocalizedStringResource = "Open my games"
    static var description = IntentDescription("Show your upcoming games")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.myGames)
        return .result()
    }
}
