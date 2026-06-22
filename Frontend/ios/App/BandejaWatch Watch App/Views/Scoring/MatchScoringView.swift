import SwiftUI

struct MatchScoringView: View {
    let gameId: String
    let matchId: String

    var body: some View {
        MatchScoringShell(gameId: gameId, matchId: matchId, entry: .browse)
    }
}
