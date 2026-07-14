import AppIntents

struct BandejaAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: FindGamesIntent(),
            phrases: [
                "Find games in \(.applicationName)",
                "Find padel games in \(.applicationName)",
                "Open find in \(.applicationName)",
            ],
            shortTitle: "Find games",
            systemImageName: "magnifyingglass"
        )
        AppShortcut(
            intent: OpenMyGamesIntent(),
            phrases: [
                "Open my games in \(.applicationName)",
                "Show my schedule in \(.applicationName)",
                "My games in \(.applicationName)",
            ],
            shortTitle: "My games",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: CreateGameIntent(),
            phrases: [
                "Create a game in \(.applicationName)",
                "New game in \(.applicationName)",
            ],
            shortTitle: "Create game",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: OpenNextGameIntent(),
            phrases: [
                "Open my next game in \(.applicationName)",
                "Next game in \(.applicationName)",
                "Open next game in \(.applicationName)",
            ],
            shortTitle: "Next game",
            systemImageName: "arrow.right.circle"
        )
    }
}
