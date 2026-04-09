import Foundation
import Observation

private struct MySessionPatchBody: Encodable, Sendable {
    let activeMatchId: String?
}

private struct MySessionPatchRow: Decodable, Sendable {
    let id: String
    let activeMatchId: String?
}

@Observable
@MainActor
final class ActiveSessionManager {
    static let shared = ActiveSessionManager()

    enum Phase: Equatable {
        case idle
        case gameActive(gameId: String)
        case matchActive(gameId: String, matchId: String)
    }

    private(set) var phase: Phase = .idle
    private(set) var workoutStartedForGame = false
    var scoringViewModel: ScoringViewModel?
    var finishMatchSignal = 0

    private let ud = UserDefaults(suiteName: KeychainHelper.accessGroup)
    private static let kGame = "bandeja.session.activeGameId"
    private static let kMatch = "bandeja.session.activeMatchId"
    private static let kWorkout = "bandeja.session.workoutStartedForGame"

    private let api = APIClient()

    private init() {}

    var activeGameId: String? {
        switch phase {
        case .idle: return nil
        case .gameActive(let id), .matchActive(let id, _): return id
        }
    }

    func enterScoringSession(gameId: String) async {
        scoringViewModel?.stopPolling()
        phase = .gameActive(gameId: gameId)
        let svm = ScoringViewModel(gameId: gameId)
        scoringViewModel = svm
        await svm.load()
        persistLocal()
    }

    func startMatch(matchId: String) async {
        guard case .gameActive(let gid) = phase else { return }
        phase = .matchActive(gameId: gid, matchId: matchId)
        if !workoutStartedForGame {
            await WorkoutManager.shared.startIfNeeded(gameId: gid, isIndoor: true)
            workoutStartedForGame = true
        } else {
            WorkoutManager.shared.autoResume()
        }
        await syncMySessionWithRetries(gameId: gid, activeMatchId: matchId)
        persistLocal()
    }

    func finishMatchAfterSave() async {
        guard case .matchActive(let gid, _) = phase else { return }
        WorkoutManager.shared.autoPause()
        await syncMySessionWithRetries(gameId: gid, activeMatchId: nil)
        phase = .gameActive(gameId: gid)
        await scoringViewModel?.refresh()
        persistLocal()
    }

    func finishGame() async {
        guard case .gameActive = phase else { return }
        guard let svm = scoringViewModel, svm.canFinalizeResults else { return }
        await svm.finalizeResults()
        if svm.error != nil {
            return
        }
        clearAfterFinalizeFromScoring()
    }

    func clearAfterFinalizeFromScoring() {
        scoringViewModel?.stopPolling()
        scoringViewModel = nil
        workoutStartedForGame = false
        phase = .idle
        clearLocalPersistence()
    }

    func resetSessionDiscardWorkout() async {
        let gid = activeGameId
        if let gid {
            await WorkoutManager.shared.discardIfStillActive(gameId: gid)
        }
        await syncMySessionWithRetries(gameId: gid, activeMatchId: nil)
        scoringViewModel?.stopPolling()
        scoringViewModel = nil
        workoutStartedForGame = false
        phase = .idle
        clearLocalPersistence()
    }

    func requestFinishMatchFromControl() {
        finishMatchSignal += 1
    }

    func recoverIfNeeded() async {
        guard case .idle = phase else { return }
        guard let gid = ud?.string(forKey: Self.kGame) else { return }
        let storedMatch = ud?.string(forKey: Self.kMatch)
        workoutStartedForGame = ud?.bool(forKey: Self.kWorkout) ?? false

        do {
            let game: WatchGame = try await api.fetch(.gameDetail(id: gid))
            if game.resultsStatus != "IN_PROGRESS" || game.status != "STARTED" {
                clearLocalPersistence()
                return
            }

            var matchId = storedMatch
            if let uid = KeychainHelper.shared.readUserId(),
               let p = game.participants.first(where: { $0.userId == uid }),
               let serverMid = p.activeMatchId, !serverMid.isEmpty {
                matchId = serverMid
            }

            scoringViewModel?.stopPolling()
            let svm = ScoringViewModel(gameId: gid)
            scoringViewModel = svm
            await svm.load()

            if let err = svm.error, svm.results == nil {
                scoringViewModel?.stopPolling()
                scoringViewModel = nil
                if Self.isTransientRecoveryError(err) {
                    return
                }
                clearLocalPersistence()
                return
            }

            if svm.isFinal {
                scoringViewModel?.stopPolling()
                scoringViewModel = nil
                workoutStartedForGame = false
                phase = .idle
                clearLocalPersistence()
                return
            }

            if let mid = matchId, svm.myMatches.contains(where: { $0.match.id == mid }) {
                phase = .matchActive(gameId: gid, matchId: mid)
                if workoutStartedForGame {
                    await WorkoutManager.shared.recoverIfNeeded()
                }
            } else {
                phase = .gameActive(gameId: gid)
            }
            persistLocal()
        } catch {
            if Self.isTransientRecoveryError(error) {
                return
            }
            clearLocalPersistence()
        }
    }

    private func syncMySessionWithRetries(gameId: String?, activeMatchId: String?) async {
        guard let gameId else { return }
        let maxAttempts = 3
        for attempt in 1...maxAttempts {
            do {
                try await syncMySession(gameId: gameId, activeMatchId: activeMatchId)
                return
            } catch {
                if attempt < maxAttempts {
                    try? await Task.sleep(for: .milliseconds(250 * attempt))
                }
            }
        }
    }

    private func syncMySession(gameId: String, activeMatchId: String?) async throws {
        _ = try await api.send(
            Endpoint.patchGameMySession(id: gameId),
            body: MySessionPatchBody(activeMatchId: activeMatchId)
        ) as MySessionPatchRow
    }

    private func persistLocal() {
        switch phase {
        case .idle:
            clearLocalPersistence()
        case .gameActive(let gid):
            ud?.set(gid, forKey: Self.kGame)
            ud?.removeObject(forKey: Self.kMatch)
            ud?.set(workoutStartedForGame, forKey: Self.kWorkout)
        case .matchActive(let gid, let mid):
            ud?.set(gid, forKey: Self.kGame)
            ud?.set(mid, forKey: Self.kMatch)
            ud?.set(workoutStartedForGame, forKey: Self.kWorkout)
        }
    }

    private func clearLocalPersistence() {
        ud?.removeObject(forKey: Self.kGame)
        ud?.removeObject(forKey: Self.kMatch)
        ud?.removeObject(forKey: Self.kWorkout)
    }

    private static func isTransientRecoveryError(_ error: Error) -> Bool {
        if let api = error as? APIError {
            switch api {
            case .httpError(let code):
                return code == 408 || code == 429 || (500...599).contains(code)
            case .decodingError, .noToken:
                return false
            }
        }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain
    }
}
