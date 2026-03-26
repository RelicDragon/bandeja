import SwiftUI

struct GameListView: View {
    @Environment(GameListViewModel.self) private var vm
    @Environment(Router.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if !vm.isAuthenticated {
                NotAuthenticatedView()
            } else if vm.isLoading && vm.games.isEmpty {
                ProgressView("Loading games…")
            } else if let error = vm.error, vm.games.isEmpty {
                errorView(error)
            } else if vm.grouped.isEmpty {
                emptyView
            } else {
                gameList
            }
        }
        .navigationTitle("Bandeja")
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
    }

    private var gameList: some View {
        List {
            ForEach(vm.grouped, id: \.title) { section in
                Section(section.title) {
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

    private var emptyView: some View {
        List {
            VStack(spacing: 10) {
                Image(systemName: "calendar.badge.exclamationmark")
                    .font(.system(size: 32))
                    .foregroundStyle(.secondary)
                Text("No upcoming games")
                    .font(.headline)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
        .refreshable { await vm.loadGames() }
    }

    private func errorView(_ error: Error) -> some View {
        List {
            VStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 32))
                    .foregroundStyle(.red)
                Text(error.localizedDescription)
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                Button("Retry") { Task { await vm.loadGames() } }
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
        .refreshable { await vm.loadGames() }
    }
}
