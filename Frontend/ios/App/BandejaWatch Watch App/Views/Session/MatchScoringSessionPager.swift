import SwiftUI

/// Horizontal session pager: workout (left) · main scoring · serve guide (right, when enabled).
struct MatchScoringSessionPager: View {
    let gameId: String
    let matchId: String

    var body: some View {
        MatchScoringShell(gameId: gameId, matchId: matchId, entry: .session)
    }
}
