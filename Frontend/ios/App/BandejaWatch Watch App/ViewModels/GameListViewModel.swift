import Foundation
import Observation

@Observable
@MainActor
final class GameListViewModel {
    private(set) var games: [WatchGame] = [] {
        didSet { rebuildGrouped() }
    }
    private(set) var grouped: [(title: String, games: [WatchGame])] = []
    private(set) var isAuthenticated = false
    private(set) var currentUserId: String?
    var isLoading = false
    var error: Error?

    private let api = APIClient()

    func refreshAuthState() {
        isAuthenticated = KeychainHelper.shared.readToken() != nil
        currentUserId = KeychainHelper.shared.readUserId()
    }

    func handleLogout() {
        games = []
        isAuthenticated = false
        currentUserId = nil
        error = nil
    }

    func loadGames() async {
        refreshAuthState()
        guard isAuthenticated else { return }
        await WatchPreferencesStore.shared.refreshFromProfile(api: api)
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            games = try await api.fetch(.myGames)
        } catch {
            self.error = error
        }
    }

    private func rebuildGrouped() {
        let now = Date()
        let calendar = WatchPreferencesStore.shared.resolvedCalendar
        let todayStart = calendar.startOfDay(for: now)
        guard let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: todayStart) else {
            grouped = []
            return
        }

        let today = games
            .filter { $0.startTime >= todayStart && $0.startTime < tomorrowStart }
            .sorted { $0.startTime < $1.startTime }

        let upcoming = games
            .filter { $0.startTime >= tomorrowStart }
            .sorted { $0.startTime < $1.startTime }

        let recent = games
            .filter { $0.startTime < todayStart }
            .sorted { $0.startTime > $1.startTime }

        var result: [(title: String, games: [WatchGame])] = []
        if !today.isEmpty    { result.append(("Today", today)) }
        if !upcoming.isEmpty { result.append(("Upcoming", upcoming)) }
        if !recent.isEmpty   { result.append(("Recent", recent)) }
        grouped = result
    }

    func refreshSectionGrouping() {
        rebuildGrouped()
    }
}
