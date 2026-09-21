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
    /// PRD 346 — the viewer's own attendance answer. Loaded with the game and
    /// absent (`nil`) for anyone the game does not ask, e.g. a non-participant.
    var attendance: WatchGameAttendance?
    var isAnsweringAttendance = false

    private let gameId: String
    /// Read live from the Keychain on every access: the token can arrive (or rotate)
    /// via WatchConnectivity after this VM was created, and caching it at init
    /// would permanently hide actions the user is entitled to.
    private var currentUserId: String? { KeychainHelper.shared.readUserId() }
    private var isPlatformAdmin: Bool { KeychainHelper.shared.readIsPlatformAdmin() }
    private let api = APIClient()
    @ObservationIgnored
    nonisolated(unsafe) private var pollingTask: Task<Void, Never>?

    init(gameId: String) {
        self.gameId = gameId
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
            // Attendance is a courtesy signal: a failure here must never hide
            // the game. It is fetched optionally, and a failed refresh keeps
            // whatever was already on screen rather than blanking the section.
            if let refreshed: WatchGameAttendance = try? await api.fetch(
                .gameAttendance(gameId: gameId)
            ) {
                attendance = refreshed
            }
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
        guard game != nil else { return false }
        isStartingResultsEntry = true
        error = nil
        defer { isStartingResultsEntry = false }
        do {
            let payload: WatchStartResultsEntryApiData = try await api.send(
                .startResultsEntryWithRound(gameId: gameId),
                body: [String: String]()
            )
            self.game = payload.game
            results = try? await api.fetch(.gameResults(gameId: gameId))
            schedulePollingIfNeeded()
            return true
        } catch {
            self.error = error
            return false
        }
    }

    // MARK: - Attendance (PRD 346)

    /// Posts one answer. Informative only — the seat, the queue and the level
    /// are untouched either way, so a failure just leaves the question open.
    ///
    /// Deliberately does **not** set `error`: that slot is the game's, and a
    /// missed courtesy signal is not something the player has to act on. There
    /// is no deadline, so the unchanged buttons are the whole message — the
    /// same silence the push shade handlers keep.
    @discardableResult
    func answerAttendance(_ state: String) async -> Bool {
        guard let current = attendance, current.canAnswer, !isAnsweringAttendance else { return false }
        isAnsweringAttendance = true
        defer { isAnsweringAttendance = false }
        do {
            let response: WatchAttendanceAnswerResponse = try await api.send(
                .setGameAttendance(gameId: gameId),
                body: WatchAttendanceAnswerBody(state: state)
            )
            attendance = current.merging(response)
            return true
        } catch {
            return false
        }
    }

    // MARK: - Contextual action state

    /// Backend `canModifyResults` (owner/admin incl. NON_PLAYING organizers, parent-season
    /// organizers, or `resultsByAnyone` + PLAYING). Same predicate the web uses for its buttons.
    private var canModifyResults: Bool {
        guard let game else { return false }
        return WatchResultsPermissions.canModifyResults(game: game, userId: currentUserId, isPlatformAdmin: isPlatformAdmin)
    }

    /// ANNOUNCED → same PUT+sync as web “start results”; backend sets STARTED when results go IN_PROGRESS.
    var canStartAnnouncedGame: Bool {
        guard let game else { return false }
        guard game.status == "ANNOUNCED", game.resultsStatus == "NONE" else { return false }
        guard WatchResultsPermissions.entityTypeSupportsResults(game.entityType) else { return false }
        guard canModifyResults else { return false }
        return readinessAndRoundGates(for: game)
    }

    /// STARTED (or FINISHED without results, e.g. after a reset — web allows any non-archived status).
    var canEnterResults: Bool {
        guard let game else { return false }
        guard game.status == "STARTED" || game.status == "FINISHED", game.resultsStatus == "NONE" else { return false }
        guard WatchResultsPermissions.entityTypeSupportsResults(game.entityType) else { return false }
        guard canModifyResults else { return false }
        return readinessAndRoundGates(for: game)
    }

    private func readinessAndRoundGates(for game: WatchGame) -> Bool {
        guard game.participantsReady else { return false }
        if game.hasFixedTeams == true {
            guard game.teamsReady else { return false }
        }
        let playingCount = game.playingParticipants.count
        guard WatchMatchFormat.isPresetResultsRoster(playingCount: playingCount) else { return false }
        return WatchResultsRoundBuilder.canBuildFirstRound(for: game)
    }

    /// Only when the server would accept this user's live PATCH / saves (else the match list is view-only).
    var canContinueScoring: Bool {
        guard let game, game.resultsStatus == "IN_PROGRESS", game.status != "ARCHIVED" else { return false }
        return canModifyResults
    }

    var resultsAreFinal: Bool {
        game?.resultsStatus == "FINAL"
    }

    var hasResultsPreview: Bool {
        guard let rounds = results?.rounds else { return false }
        return rounds.contains { !$0.matches.isEmpty }
    }

    /// Real roster members (backend `canAccessGame`: PLAYING / NON_PLAYING / IN_QUEUE, or parent
    /// organizers) can open the match list when scoring/results exist. GUEST/INVITED cannot.
    var canOpenMatchList: Bool {
        guard let game else { return false }
        guard WatchResultsPermissions.canAccessGame(game: game, userId: currentUserId) else { return false }
        if game.resultsStatus == "IN_PROGRESS" || game.resultsStatus == "FINAL" { return true }
        return hasResultsPreview
    }
}
