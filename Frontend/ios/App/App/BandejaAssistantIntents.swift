import AppIntents

// MARK: - Feature layer (#279)
// Static catalog deep links — no Game AppEntity. Donated via BandejaAppShortcuts
// when listed in Frontend/src/deepLinks/assistantRegistry.ts.

struct FindGamesTomorrowIntent: AppIntent {
    static var title: LocalizedStringResource = "Find games tomorrow"
    static var description = IntentDescription("Browse games for tomorrow")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.findTomorrow)
        return .result()
    }
}

struct OpenChatsIntent: AppIntent {
    static var title: LocalizedStringResource = "Open chats"
    static var description = IntentDescription("Open your chats inbox")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.chats)
        return .result()
    }
}

struct OpenInvitesIntent: AppIntent {
    static var title: LocalizedStringResource = "Show invites"
    static var description = IntentDescription("Show your game invites")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.invites)
        return .result()
    }
}

struct CreateLeagueIntent: AppIntent {
    static var title: LocalizedStringResource = "Create a league"
    static var description = IntentDescription("Start creating a new league")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.createLeague)
        return .result()
    }
}

/// Feature: open chat for the next displayable game (catalog `nextGameChat`).
struct OpenNextGameChatIntent: AppIntent {
    static var title: LocalizedStringResource = "Open next game chat"
    static var description = IntentDescription("Open chat for your next upcoming game")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let next = BandejaWidgetGames.nextEntity() {
            BandejaDeepLink.open(BandejaDeepLink.gameChat(next.id))
        } else {
            BandejaDeepLink.open(BandejaDeepLink.nextGameChat)
        }
        return .result()
    }
}

/// Feature: open live scoring for the next displayable game (catalog `nextGameLive`).
struct OpenNextGameLiveIntent: AppIntent {
    static var title: LocalizedStringResource = "Open next game live scoring"
    static var description = IntentDescription("Open live scoring for your next upcoming game")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let next = BandejaWidgetGames.nextEntity() {
            BandejaDeepLink.open(BandejaDeepLink.gameLive(next.id))
        } else {
            BandejaDeepLink.open(BandejaDeepLink.nextGameLive)
        }
        return .result()
    }
}

// MARK: - Game-entity layer (#279)
// Parameterized by BandejaGameEntity — distinct from feature next-game* intents.

struct OpenGameIntent: AppIntent {
    static var title: LocalizedStringResource = "Open game"
    static var description = IntentDescription("Open a specific game from your schedule")
    static var openAppWhenRun = true

    @Parameter(title: "Game", requestValueDialog: IntentDialog("Which game?"))
    var game: BandejaGameEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.game(game.id))
        return .result()
    }
}

struct OpenGameChatIntent: AppIntent {
    static var title: LocalizedStringResource = "Open game chat"
    static var description = IntentDescription("Open chat for a specific game")
    static var openAppWhenRun = true

    @Parameter(title: "Game", requestValueDialog: IntentDialog("Which game?"))
    var game: BandejaGameEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.gameChat(game.id))
        return .result()
    }
}

struct OpenLiveScoringIntent: AppIntent {
    static var title: LocalizedStringResource = "Open live scoring"
    static var description = IntentDescription("Open live scoring for a specific game")
    static var openAppWhenRun = true

    @Parameter(title: "Game", requestValueDialog: IntentDialog("Which game?"))
    var game: BandejaGameEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        BandejaDeepLink.open(BandejaDeepLink.gameLive(game.id))
        return .result()
    }
}
