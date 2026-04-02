import SwiftUI

struct GameWinConfirmSheet: View {
    @Bindable var vm: MatchScoringViewModel
    let lang: String

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    let winners = vm.pendingGameWinWinningUsers()
                    let wonGrammarCount = winners.isEmpty ? 1 : winners.count

                    if winners.isEmpty {
                        HStack(alignment: .center, spacing: 8) {
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 18))
                                .foregroundStyle(.tertiary)
                                .frame(width: 28, height: 28)
                            Text(WatchCopy.gameWonUnknownSide(lang))
                                .font(.caption.weight(.semibold))
                                .lineLimit(2)
                        }
                    } else {
                        ForEach(winners, id: \.id) { user in
                            let trimmed = user.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                            HStack(alignment: .center, spacing: 8) {
                                WatchPlayerAvatarView(user: user, size: 28, role: nil)
                                Text(trimmed.isEmpty ? WatchCopy.gameWonUnknownSide(lang) : trimmed)
                                    .font(.caption.weight(.semibold))
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                    }

                    Text(WatchCopy.gameWonConfirmWonLabel(lang, playerCount: wonGrammarCount))
                        .font(.title3.weight(.bold))

                    if let p = vm.pendingGameWinProjectedScoresIfBalls() {
                        Text(WatchCopy.gameWonScoreWillBe(lang, teamA: p.teamA, teamB: p.teamB))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 8) {
                        Button(WatchCopy.confirmAction(lang)) {
                            vm.confirmPendingGameWin()
                        }
                        .buttonStyle(.borderedProminent)
                        .frame(maxWidth: .infinity)

                        Button(WatchCopy.cancelAction(lang), role: .cancel) {
                            vm.cancelPendingGameWinConfirm()
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
            }
            .navigationTitle(WatchCopy.gameWonConfirmAlertTitle(lang))
        }
    }
}
