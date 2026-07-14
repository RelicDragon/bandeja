import AppIntents

/// Donated App Shortcuts — max 10 (Apple). Priority matches
/// `Frontend/src/deepLinks/assistantRegistry.ts` (`iosAppShortcutPriorityList`).
///
/// Feature vs gameEntity layers stay separate: entity slots use `$\.$game`;
/// feature next-game chat/live use `OpenNextGameChatIntent` / `OpenNextGameLiveIntent`.
struct BandejaAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        // 1 — feature findToday
        AppShortcut(
            intent: FindGamesIntent(),
            phrases: [
                "Find games in \(.applicationName)",
                "Find padel games in \(.applicationName)",
                "Open find in \(.applicationName)",
                "Find games today in \(.applicationName)",
            ],
            shortTitle: "Find games",
            systemImageName: "magnifyingglass"
        )
        // 2 — feature findTomorrow
        AppShortcut(
            intent: FindGamesTomorrowIntent(),
            phrases: [
                "Find games tomorrow in \(.applicationName)",
                "Find tomorrow's games in \(.applicationName)",
            ],
            shortTitle: "Find tomorrow",
            systemImageName: "calendar.badge.plus"
        )
        // 3 — feature myGames
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
        // 4 — feature nextGame
        AppShortcut(
            intent: OpenNextGameIntent(),
            phrases: [
                "Open my next game in \(.applicationName)",
                "Next game in \(.applicationName)",
                "Open next game in \(.applicationName)",
                "Join my next game in \(.applicationName)",
            ],
            shortTitle: "Next game",
            systemImageName: "arrow.right.circle"
        )
        // 5 — feature createGame
        AppShortcut(
            intent: CreateGameIntent(),
            phrases: [
                "Create a game in \(.applicationName)",
                "New game in \(.applicationName)",
            ],
            shortTitle: "Create game",
            systemImageName: "plus.circle"
        )
        // 6 — gameEntity open
        AppShortcut(
            intent: OpenGameIntent(),
            phrases: [
                "Open \(\.$game) in \(.applicationName)",
                "Show \(\.$game) in \(.applicationName)",
            ],
            shortTitle: "Open game",
            systemImageName: "sportscourt"
        )
        // 7 — feature nextGameChat
        AppShortcut(
            intent: OpenNextGameChatIntent(),
            phrases: [
                "Open chat for my next game in \(.applicationName)",
                "Open game chat in \(.applicationName)",
                "Next game chat in \(.applicationName)",
            ],
            shortTitle: "Next game chat",
            systemImageName: "bubble.left.and.bubble.right"
        )
        // 8 — feature nextGameLive
        AppShortcut(
            intent: OpenNextGameLiveIntent(),
            phrases: [
                "Start scoring my next game in \(.applicationName)",
                "Open live scoring in \(.applicationName)",
                "Score my next game in \(.applicationName)",
            ],
            shortTitle: "Next live scoring",
            systemImageName: "sportscourt.fill"
        )
        // 9 — feature chats
        AppShortcut(
            intent: OpenChatsIntent(),
            phrases: [
                "Open my chats in \(.applicationName)",
                "Open chats in \(.applicationName)",
            ],
            shortTitle: "Chats",
            systemImageName: "message"
        )
        // 10 — feature invites
        AppShortcut(
            intent: OpenInvitesIntent(),
            phrases: [
                "Show my invites in \(.applicationName)",
                "Open invites in \(.applicationName)",
            ],
            shortTitle: "Invites",
            systemImageName: "envelope"
        )
    }
}
