import Foundation
import Observation

@Observable
@MainActor
final class GameDetailViewModel {
    var game: WatchGame?
    /// True until first successful game load finishes (avoids blank first frame).
    var isLoading = true
    var error: Error?
    /// Loaded when available; used for scores preview on game detail.
    var results: WatchResultsGame?
    /// Start game (ANNOUNCED) or enter results both run the same API flow.
    var isStartingResultsEntry = false

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
            results = try? await api.fetch(.gameResults(gameId: gameId))
            error = nil
            schedulePollingIfNeeded()
        } catch {
            self.error = error
            results = nil
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

    @discardableResult
    func startResultsEntry() async -> Bool {
        guard let game else { return false }
        isStartingResultsEntry = true
        error = nil
        defer { isStartingResultsEntry = false }
        do {
            let round = try WatchResultsRoundBuilder.firstRound(for: game)
            _ = try await api.put(
                .updateGame(id: gameId),
                body: WatchGameResultsStatusPatch(resultsStatus: "IN_PROGRESS")
            ) as WatchGame
            try await api.sendVoid(
                .syncGameResults(gameId: gameId),
                body: WatchSyncResultsBody(rounds: [round])
            )
            self.game = try await api.fetch(.gameDetail(id: gameId))
            results = try? await api.fetch(.gameResults(gameId: gameId))
            schedulePollingIfNeeded()
            return true
        } catch {
            self.error = error
            return false
        }
    }

    // MARK: - Contextual action state

    /// ANNOUNCED → same PUT+sync as web “start results”; backend sets STARTED when results go IN_PROGRESS.
    var canStartAnnouncedGame: Bool {
        guard let game, currentUserId != nil else { return false }
        guard game.status == "ANNOUNCED", game.resultsStatus == "NONE" else { return false }
        guard !["BAR", "TRAINING", "LEAGUE_SEASON"].contains(game.entityType) else { return false }
        guard isCurrentUserPlayingOnGame else { return false }
        let allowed: Bool
        if isCurrentUserOwnerOrAdmin || isCurrentUserOwnerOrAdminOnParent {
            allowed = true
        } else if game.resultsByAnyone == true {
            allowed = true
        } else {
            allowed = false
        }
        guard allowed else { return false }
        return readinessAndRoundGates(for: game)
    }

    var canEnterResults: Bool {
        guard let game, let uid = currentUserId else { return false }
        guard game.status == "STARTED", game.resultsStatus == "NONE" else { return false }
        guard !["BAR", "TRAINING", "LEAGUE_SEASON"].contains(game.entityType) else { return false }
        let canEdit: Bool
        if isCurrentUserOwnerOrAdmin || isCurrentUserOwnerOrAdminOnParent {
            canEdit = true
        } else if game.resultsByAnyone == true {
            canEdit = game.participants.contains { $0.userId == uid && $0.isPlaying }
        } else {
            canEdit = false
        }
        guard canEdit else { return false }
        return readinessAndRoundGates(for: game)
    }

    private func readinessAndRoundGates(for game: WatchGame) -> Bool {
        guard game.participantsReady else { return false }
        if game.hasFixedTeams == true {
            guard game.teamsReady else { return false }
        }
        let playingCount = game.participants.filter(\.isPlaying).count
        guard playingCount == 4 else { return false }
        return WatchResultsRoundBuilder.canBuildFirstRound(for: game)
    }

    var canContinueScoring: Bool {
        game?.resultsStatus == "IN_PROGRESS"
    }

    var resultsAreFinal: Bool {
        game?.resultsStatus == "FINAL"
    }

    var hasResultsPreview: Bool {
        guard let rounds = results?.rounds else { return false }
        return rounds.contains { !$0.matches.isEmpty }
    }

    /// Participant can open match list when scoring/results exist or rounds are present.
    var canOpenMatchList: Bool {
        guard let game, let uid = currentUserId else { return false }
        let isParticipant = game.participants.contains { $0.userId == uid }
        guard isParticipant else { return false }
        if game.resultsStatus == "IN_PROGRESS" || game.resultsStatus == "FINAL" { return true }
        return hasResultsPreview
    }

    /// True only if the currently signed-in user has OWNER or ADMIN role in this game.
    private var isCurrentUserOwnerOrAdmin: Bool {
        guard let uid = currentUserId, let game else { return false }
        return game.participants.contains {
            $0.userId == uid && ($0.role == "OWNER" || $0.role == "ADMIN")
        }
    }

    private var isCurrentUserOwnerOrAdminOnParent: Bool {
        guard let uid = currentUserId, let parts = game?.parent?.participants else { return false }
        return parts.contains {
            $0.userId == uid && ($0.role == "OWNER" || $0.role == "ADMIN")
        }
    }

    private var isCurrentUserPlayingOnGame: Bool {
        guard let uid = currentUserId, let game else { return false }
        return game.participants.contains { $0.userId == uid && $0.isPlaying }
    }
}
