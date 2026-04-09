import SwiftUI

struct ActiveGamePage: View {
    let gameId: String
    @Environment(ActiveSessionManager.self) private var session
    @Environment(WatchPreferencesStore.self) private var prefs
    @Bindable private var workoutOutbox = WorkoutSyncOutbox.shared
    @Bindable private var scoringOutbox = ScoringOutbox.shared

    var body: some View {
        let lang = prefs.uiLanguageCode
        Group {
            if let vm = session.scoringViewModel {
                if vm.isLoading && vm.results == nil {
                    ProgressView(WatchCopy.loadingEllipsis(lang))
                } else if let error = vm.error, vm.results == nil {
                    VStack(spacing: 8) {
                        Text(error.localizedDescription).font(.caption2).multilineTextAlignment(.center)
                        Button(WatchCopy.retry(lang)) { Task { await vm.load() } }
                    }
                } else {
                    activeContent(vm: vm, lang: lang)
                }
            } else {
                ProgressView(WatchCopy.loadingEllipsis(lang))
            }
        }
        .navigationTitle(WatchCopy.matches(lang))
        .task(id: gameId) {
            await WorkoutManager.shared.recoverIfNeeded()
            if let svm = session.scoringViewModel, svm.gameId == gameId {
                if svm.results == nil, !svm.isLoading {
                    await svm.load()
                }
            } else {
                await session.enterScoringSession(gameId: gameId)
            }
        }
    }

    private func activeContent(vm: ScoringViewModel, lang: String) -> some View {
        List {
            if let err = vm.error, vm.results != nil {
                Text(listErrorMessage(err, lang: lang))
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .listRowBackground(Color.clear)
            }
            if workoutOutbox.hasPending(forGameId: gameId) {
                Text(WatchCopy.workoutBandejaSyncPending(lang))
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .listRowBackground(Color.clear)
            }
            if scoringOutbox.hasPending(forGameId: gameId) {
                Text(WatchCopy.scoresSyncPending(lang))
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .listRowBackground(Color.clear)
            }
            if vm.postFinalizeHint == .refreshFailed {
                Text(WatchCopy.resultsRefreshFailed(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
            if vm.postFinalizeHint == .serverNotYetFinal {
                Text(WatchCopy.resultsServerProcessing(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }

            if let game = vm.game {
                Section {
                    gameHeader(game: game, lang: lang)
                }
                .listRowBackground(Color.clear)
            }

            if vm.myMatches.isEmpty {
                Text(WatchCopy.waitingForRound(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ForEach(matchesByRound(vm: vm), id: \.round.id) { group in
                Section(WatchCopy.roundSection(lang, number: group.round.roundNumber)) {
                    ForEach(group.matches, id: \.id) { match in
                        matchRow(vm: vm, roundNumber: group.round.roundNumber, match: match, lang: lang)
                    }
                }
            }

            if vm.canFinalizeResults {
                Button(vm.isFinalizing ? WatchCopy.finalizingResults(lang) : WatchCopy.finalizeResults(lang)) {
                    Task {
                        await vm.finalizeResults()
                        if vm.isFinal {
                            session.clearAfterFinalizeFromScoring()
                        }
                    }
                }
                .disabled(vm.isFinalizing)
                .buttonStyle(.borderedProminent)
            }

            if vm.isFinal, !vm.sortedOutcomes.isEmpty {
                Section(WatchCopy.outcomes(lang)) {
                    ForEach(Array(vm.sortedOutcomes.enumerated()), id: \.offset) { _, outcome in
                        HStack(spacing: 6) {
                            Text("#\(outcome.position ?? 0)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if let u = outcome.user {
                                WatchPlayerAvatarView(user: u, size: 22, role: nil)
                                Text(u.displayName)
                                    .font(.caption2)
                                    .lineLimit(1)
                            } else {
                                Text(outcome.userId)
                                    .font(.caption2)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Text("\(outcome.wins)-\(outcome.losses)-\(outcome.ties)")
                                .font(.caption2.monospacedDigit())
                        }
                    }
                }
            }
        }
        .refreshable {
            await vm.refresh()
            await ScoringOutbox.shared.flush()
            await WorkoutSyncOutbox.shared.flush()
        }
    }

    private func gameHeader(game: WatchGame, lang: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: game.gameType.gameTypeIconName)
                    .font(.caption2)
                    .foregroundStyle(Color.accentColor)
                Text(game.gameType.capitalized)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Label(
                game.startTime.formatted(date: .abbreviated, time: game.timeIsSet ? .shortened : .omitted),
                systemImage: "clock"
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            if let club = game.club {
                Label(club.name, systemImage: "mappin.circle")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func matchesByRound(vm: ScoringViewModel) -> [(round: WatchRound, matches: [WatchMatch])] {
        guard let rounds = vm.results?.rounds else { return [] }
        return rounds
            .sorted { $0.roundNumber < $1.roundNumber }
            .compactMap { r in
                let ms = vm.myMatches
                    .filter { $0.round.id == r.id }
                    .map(\.match)
                    .sorted { $0.matchNumber < $1.matchNumber }
                return ms.isEmpty ? nil : (r, ms)
            }
    }

    private func matchRow(vm: ScoringViewModel, roundNumber: Int, match: WatchMatch, lang: String) -> some View {
        let showStart = vm.canEditMatch(match) && !vm.isMatchCompleted(match) && !vm.isFinal
        return ZStack {
            MatchResultCard(
                roundNumber: roundNumber,
                match: match,
                isCurrent: vm.latestActiveMatchId == match.id,
                isFinal: vm.isFinal
            ) {
                if showStart {
                    Task { await session.startMatch(matchId: match.id) }
                }
            }
            .disabled(showStart)

            if showStart {
                Color.black.opacity(0.2)
                Button {
                    Task { await session.startMatch(matchId: match.id) }
                } label: {
                    Image(systemName: "play.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color.green.opacity(0.92)))
                }
                .buttonStyle(.plain)
            }
        }
        .listRowInsets(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
    }

    private func listErrorMessage(_ error: Error, lang: String) -> String {
        if let api = error as? APIError {
            return api.localizedMessage(uiLanguageCode: lang)
        }
        return error.localizedDescription
    }
}
