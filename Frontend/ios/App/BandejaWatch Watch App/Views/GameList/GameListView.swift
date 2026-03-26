import SwiftUI

struct GameListView: View {
    @Environment(GameListViewModel.self) private var vm
    @Environment(Router.self) private var router
    @Environment(WatchPreferencesStore.self) private var prefs
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if !vm.isAuthenticated {
                NotAuthenticatedView()
            } else if vm.isLoading && vm.games.isEmpty {
                ProgressView(WatchCopy.loadingGames(prefs.uiLanguageCode))
            } else if let error = vm.error, vm.games.isEmpty {
                errorView(error)
            } else if vm.grouped.isEmpty {
                emptyView
            } else {
                gameList
            }
        }
        .navigationTitle(WatchCopy.navTitle(prefs.uiLanguageCode))
        .task {
            await vm.loadGames()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await vm.loadGames() }
            }
        }
        .onChange(of: WatchSessionManager.shared.tokenDidArrive) { _, _ in
            Task { await vm.loadGames() }
        }
        .onChange(of: WatchSessionManager.shared.logoutDidArrive) { _, _ in
            vm.handleLogout()
        }
        .onChange(of: prefs.prefsRevision) { _, _ in
            vm.refreshSectionGrouping()
        }
    }

    private var gameList: some View {
        List {
            ForEach(vm.grouped, id: \.title) { section in
                Section(localizedSectionTitle(section.title)) {
                    ForEach(section.games) { game in
                        Button {
                            router.navigate(to: .gameDetail(id: game.id))
                        } label: {
                            GameRowView(game: game)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .refreshable { await vm.loadGames() }
    }

    private func localizedSectionTitle(_ title: String) -> String {
        let lang = prefs.uiLanguageCode
        switch title {
        case "Today": return WatchCopy.sectionToday(lang)
        case "Upcoming": return WatchCopy.sectionUpcoming(lang)
        case "Recent": return WatchCopy.sectionRecent(lang)
        default: return title
        }
    }

    private var emptyView: some View {
        List {
            VStack(spacing: 10) {
                Image(systemName: "calendar.badge.exclamationmark")
                    .font(.system(size: 32))
                    .foregroundStyle(.secondary)
                Text(WatchCopy.noUpcomingGames(prefs.uiLanguageCode))
                    .font(.headline)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
        .refreshable { await vm.loadGames() }
    }

    private func errorView(_ error: Error) -> some View {
        let message: String
        if let api = error as? APIError {
            message = api.localizedMessage(uiLanguageCode: prefs.uiLanguageCode)
        } else {
            message = error.localizedDescription
        }
        return List {
            VStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 32))
                    .foregroundStyle(.red)
                Text(message)
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                Button(WatchCopy.retry(prefs.uiLanguageCode)) { Task { await vm.loadGames() } }
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
        .refreshable { await vm.loadGames() }
    }
}
