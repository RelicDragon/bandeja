import SwiftUI

struct GameDetailView: View {
    let gameId: String
    @State private var vm: GameDetailViewModel
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
                participantsSection(game)
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

    @ViewBuilder
    private func actionButton(_ game: WatchGame) -> some View {
        let lang = prefs.uiLanguageCode
        if vm.canStartGame {
            comingSoonButton(WatchCopy.startGame(lang), icon: "play.fill", color: .green)
        } else if vm.canEnterResults {
            comingSoonButton(WatchCopy.enterResults(lang), icon: "pencil.and.list.clipboard", color: .blue)
        } else if vm.canContinueScoring {
            comingSoonButton(WatchCopy.continueScoring(lang), icon: "arrow.clockwise", color: .orange)
        } else if vm.resultsAreFinal {
            Label(WatchCopy.resultsFinal(lang), systemImage: "checkmark.seal.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
    }

    private func comingSoonButton(_ title: String, icon: String, color: Color) -> some View {
        Button { } label: {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(color)
        .disabled(true)
        .overlay(alignment: .topTrailing) {
            Text(WatchCopy.soon(prefs.uiLanguageCode))
                .font(.system(size: 8).weight(.bold))
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(.ultraThinMaterial, in: Capsule())
                .offset(x: 2, y: -4)
        }
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
