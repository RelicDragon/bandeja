import AppIntents

struct OpenBandejaIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Bandeja"
    static let description = IntentDescription("Opens the Bandeja app on Apple Watch.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}
