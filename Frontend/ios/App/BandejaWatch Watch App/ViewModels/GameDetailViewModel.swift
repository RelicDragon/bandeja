import Foundation
import Observation

@Observable
@MainActor
final class GameDetailViewModel {
    var game: WatchGame?
    var isLoading = false
    var error: Error?

    private let gameId: String
    private let currentUserId: String?
    private let api = APIClient()
    @ObservationIgnored
    nonisolated(unsafe) private var pollingTask: Task<Void, Never>?

    init(gameId: String) {
        self.gameId = gameId
        self.currentUserId = KeychainHelper.shared.readUserId()
    }

    deinit {
        pollingTask?.cancel()
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        await fetchGame()
    }

    func refresh() async {
        await fetchGame()
    }

    private func fetchGame() async {
        do {
            game = try await api.fetch(.gameDetail(id: gameId))
            schedulePollingIfNeeded()
        } catch {
            self.error = error
        }
    }

    private func schedulePollingIfNeeded() {
        pollingTask?.cancel()
        guard game?.resultsStatus == "IN_PROGRESS" else { return }
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled, let self else { break }
                await self.fetchGame()
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    // MARK: - Contextual action state

    var canStartGame: Bool {
        guard let game else { return false }
        return game.status == "ANNOUNCED" && isCurrentUserOwnerOrAdmin
    }

    var canEnterResults: Bool {
        guard let game else { return false }
        return game.status == "STARTED"
            && game.resultsStatus == "NONE"
            && (isCurrentUserOwnerOrAdmin || game.resultsByAnyone == true)
    }

    var canContinueScoring: Bool {
        game?.resultsStatus == "IN_PROGRESS"
    }

    var resultsAreFinal: Bool {
        game?.resultsStatus == "FINAL"
    }

    /// True only if the currently signed-in user has OWNER or ADMIN role in this game.
    private var isCurrentUserOwnerOrAdmin: Bool {
        guard let uid = currentUserId, let game else { return false }
        return game.participants.contains {
            $0.userId == uid && ($0.role == "OWNER" || $0.role == "ADMIN")
        }
    }
}
