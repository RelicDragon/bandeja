import Foundation

enum ScoringPostFinalizeHint: Equatable {
    case none
    /// Finalize succeeded on server but reloading game/results failed — pull to refresh.
    case refreshFailed
    /// Server returned non-FINAL after finalize; keep local final UX, may still be processing.
    case serverNotYetFinal
}
