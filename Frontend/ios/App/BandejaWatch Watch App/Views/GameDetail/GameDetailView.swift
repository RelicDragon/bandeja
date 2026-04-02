import SwiftUI

struct GameDetailView: View {
    let gameId: String
    @State private var vm: GameDetailViewModel
    @Environment(Router.self) private var router
    @Environment(WatchPreferencesStore.self) private var prefs

    init(gameId: String) {
        self.gameId = gameId
        _vm = State(initialValue: GameDetailViewModel(gameId: gameId))
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.game == nil {
                ProgressView(WatchCopy.loadingEllipsis(prefs.uiLanguageCode))
            } else if let error = vm.error, vm.game == nil {
                errorView(error)
            } else if let game = vm.game {
                gameContent(game)
            } else {
                ProgressView(WatchCopy.loadingEllipsis(prefs.uiLanguageCode))
            }
        }
        .navigationTitle(vm.game?.displayTitle ?? WatchCopy.gameTitle(prefs.uiLanguageCode))
        .task { await vm.load() }
        .onDisappear { vm.stopPolling() }
    }

    @ViewBuilder
    private func gameContent(_ game: WatchGame) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                headerSection(game)
                statusBanner(game)
                if let err = vm.error {
                    Text((err as? APIError).map { $0.localizedMessage(uiLanguageCode: prefs.uiLanguageCode) } ?? err.localizedDescription)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.leading)
                }
                participantsSection(game)
                readinessSection(game)
                if vm.hasResultsPreview {
                    resultsPreviewSection
                }
                actionButton(game)
            }
            .padding(.horizontal, 4)
        }
        .refreshable { await vm.refresh() }
    }

    private func headerSection(_ game: WatchGame) -> some View {
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
    }

    private func statusBanner(_ game: WatchGame) -> some View {
        let color = statusColor(game.status)
        return HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(statusLabel(game, lang: prefs.uiLanguageCode))
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(color.opacity(0.15), in: Capsule())
    }

    private func participantsSection(_ game: WatchGame) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(WatchCopy.players(prefs.uiLanguageCode))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(game.participants) { participant in
                    ParticipantChipView(participant: participant)
                }
            }
        }
    }

    private func readinessSection(_ game: WatchGame) -> some View {
        let lang = prefs.uiLanguageCode
        return VStack(alignment: .leading, spacing: 4) {
            Text(WatchCopy.readinessHeading(lang))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            readinessRow(
                ok: game.participantsReady,
                okLabel: WatchCopy.readinessParticipantsOk(lang),
                waitingLabel: WatchCopy.readinessParticipantsWaiting(lang)
            )
            if game.hasFixedTeams == true {
                readinessRow(
                    ok: game.teamsReady,
                    okLabel: WatchCopy.readinessTeamsOk(lang),
                    waitingLabel: WatchCopy.readinessTeamsWaiting(lang)
                )
            }
        }
    }

    private func readinessRow(ok: Bool, okLabel: String, waitingLabel: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: ok ? "checkmark.circle.fill" : "clock.fill")
                .font(.caption2)
                .foregroundStyle(ok ? .green : .orange)
            Text(ok ? okLabel : waitingLabel)
                .font(.caption2)
                .foregroundStyle(ok ? .primary : .secondary)
        }
    }

    @ViewBuilder
    private func actionButton(_ game: WatchGame) -> some View {
        let lang = prefs.uiLanguageCode
        if vm.canStartAnnouncedGame {
            resultsEntryFlowButton(
                title: WatchCopy.startGame(lang),
                systemImage: "play.fill",
                color: .green
            )
        } else if vm.canEnterResults {
            resultsEntryFlowButton(
                title: WatchCopy.enterResults(lang),
                systemImage: "pencil.and.list.clipboard",
                color: .blue
            )
        } else if vm.canContinueScoring {
            actionNavButton(WatchCopy.continueScoring(lang), icon: "arrow.clockwise", color: .orange)
        } else if vm.resultsAreFinal {
            actionNavButton(WatchCopy.resultsFinal(lang), icon: "checkmark.seal.fill", color: .green)
        } else if vm.canOpenMatchList {
            actionNavButton(WatchCopy.matches(lang), icon: "list.bullet.rectangle", color: .blue)
        }
    }

    private var resultsPreviewSection: some View {
        let lang = prefs.uiLanguageCode
        return VStack(alignment: .leading, spacing: 6) {
            Text(WatchCopy.scoresPreview(lang))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ForEach((vm.results?.rounds ?? []).sorted { $0.roundNumber < $1.roundNumber }, id: \.id) { round in
                ForEach(round.matches.sorted { $0.matchNumber < $1.matchNumber }, id: \.id) { match in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(WatchCopy.roundMatch(lang, round: round.roundNumber, match: match.matchNumber))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        if match.sets.isEmpty {
                            Text("—")
                                .font(.caption2)
                        } else {
                            Text(
                                match.sets
                                    .sorted { $0.setNumber < $1.setNumber }
                                    .map { "\($0.teamAScore)-\($0.teamBScore)" }
                                    .joined(separator: "  ")
                            )
                            .font(.caption2.monospacedDigit())
                        }
                    }
                }
            }
        }
    }

    private func resultsEntryFlowButton(title: String, systemImage: String, color: Color) -> some View {
        Button {
            Task {
                if await vm.startResultsEntry() {
                    router.navigate(to: .scoringList(gameId: gameId))
                }
            }
        } label: {
            Group {
                if vm.isStartingResultsEntry {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Label(title, systemImage: systemImage)
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(color)
        .disabled(vm.isStartingResultsEntry)
    }

    private func actionNavButton(_ title: String, icon: String, color: Color) -> some View {
        Button {
            router.navigate(to: .scoringList(gameId: gameId))
        } label: {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(color)
    }

    private func errorView(_ error: Error) -> some View {
        let message: String
        if let api = error as? APIError {
            message = api.localizedMessage(uiLanguageCode: prefs.uiLanguageCode)
        } else {
            message = error.localizedDescription
        }
        return VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(.red)
            Text(message)
                .font(.caption2)
                .multilineTextAlignment(.center)
            Button(WatchCopy.retry(prefs.uiLanguageCode)) { Task { await vm.load() } }
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "STARTED":              return .green
        case "ANNOUNCED":            return .yellow
        case "FINISHED", "ARCHIVED": return .secondary
        default:                     return .secondary
        }
    }

    private func statusLabel(_ game: WatchGame, lang: String) -> String {
        switch (game.status, game.resultsStatus) {
        case ("ANNOUNCED", _):         return WatchCopy.statusAnnounced(lang)
        case ("STARTED", "NONE"):      return WatchCopy.statusInProgress(lang)
        case ("STARTED", "IN_PROGRESS"): return WatchCopy.statusScoring(lang)
        case (_, "FINAL"):             return WatchCopy.resultsFinal(lang)
        case ("FINISHED", _):          return WatchCopy.statusFinished(lang)
        case ("ARCHIVED", _):          return WatchCopy.statusArchived(lang)
        default:                       return game.status.capitalized
        }
    }
}
