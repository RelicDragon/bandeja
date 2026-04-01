import Foundation
import Observation

@Observable
@MainActor
final class ScoringViewModel {
    let gameId: String
    var game: WatchGame?
    var results: WatchResultsGame?
    var isLoading = false
    var isFinal = false
    var isFinalizing = false
    var error: Error?
    var postFinalizeHint: ScoringPostFinalizeHint = .none

    private let api = APIClient()
    private let currentUserId: String?
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
        await refresh()
    }

    func refresh() async {
        do {
            game = try await api.fetch(.gameDetail(id: gameId))
            results = try await api.fetch(.gameResults(gameId: gameId))
            isFinal = game?.resultsStatus == "FINAL"
            postFinalizeHint = .none
            schedulePolling()
        } catch {
            self.error = error
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    var myMatches: [(round: WatchRound, match: WatchMatch)] {
        guard let currentUserId, let rounds = results?.rounds else { return [] }
        return rounds
            .sorted { $0.roundNumber < $1.roundNumber }
            .flatMap { round in
                round.matches
                    .sorted { $0.matchNumber < $1.matchNumber }
                    .filter { match in
                        match.teams.contains { team in
                            team.players.contains { $0.userId == currentUserId }
                        }
                    }
                    .map { (round: round, match: $0) }
            }
    }

    var latestActiveMatchId: String? {
        myMatches.last(where: { !isMatchCompleted($0.match) })?.match.id
    }

    var hasAnyMatchToScore: Bool {
        latestActiveMatchId != nil
    }

    var canFinalizeResults: Bool {
        guard !isFinal else { return false }
        return myMatches.contains { matchItem in
            matchItem.match.sets.contains { $0.teamAScore > 0 || $0.teamBScore > 0 }
        }
    }

    var sortedOutcomes: [WatchOutcome] {
        (results?.outcomes ?? []).sorted {
            ($0.position ?? Int.max) < ($1.position ?? Int.max)
        }
    }

    func canEditMatch(_ match: WatchMatch) -> Bool {
        guard !isFinal, let uid = currentUserId else { return false }
        return match.teams.contains { team in
            team.players.contains { $0.userId == uid }
        }
    }

    func finalizeResults() async {
        guard canFinalizeResults, !isFinalizing else { return }
        isFinalizing = true
        defer { isFinalizing = false }

        do {
            try await api.sendVoid(.recalculateOutcomes(gameId: gameId))
        } catch {
            self.error = error
            return
        }

        error = nil
        postFinalizeHint = .none
        await WorkoutManager.shared.endSessionUploadAndClear(gameId: gameId)
        isFinal = true
        stopPolling()

        do {
            game = try await api.fetch(.gameDetail(id: gameId))
            results = try await api.fetch(.gameResults(gameId: gameId))
            isFinal = true
            if let g = game, g.resultsStatus != "FINAL" {
                postFinalizeHint = .serverNotYetFinal
            } else {
                postFinalizeHint = .none
            }
        } catch {
            postFinalizeHint = .refreshFailed
            isFinal = true
        }
    }

    func isMatchCompleted(_ match: WatchMatch) -> Bool {
        let scoredSets = match.sets.filter { $0.teamAScore > 0 || $0.teamBScore > 0 }
        guard !scoredSets.isEmpty else { return false }
        if match.winnerId != nil { return true }
        if let fixedSets = game?.fixedNumberOfSets, fixedSets > 0 {
            return scoredSets.count >= fixedSets
        }
        return true
    }

    private func schedulePolling() {
        pollingTask?.cancel()
        guard !isFinal else { return }
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(12))
                guard !Task.isCancelled, let self else { break }
                await self.refresh()
            }
        }
    }
}
