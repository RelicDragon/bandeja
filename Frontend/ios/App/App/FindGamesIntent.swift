import AppIntents

struct FindGamesIntent: AppIntent {
    static var title: LocalizedStringResource = "Find games"
    static var description = IntentDescription("Browse available games")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.find)
        return .result()
    }
}
