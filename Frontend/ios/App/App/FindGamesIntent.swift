import AppIntents

/// Feature layer (#279): browse Find calendar for today (`findToday`).
/// Sole owner of the findToday URL — do not add a FindGamesTodayIntent alias.
struct FindGamesIntent: AppIntent {
    static var title: LocalizedStringResource = "Find games"
    static var description = IntentDescription("Browse available games for today")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.findToday)
        return .result()
    }
}
