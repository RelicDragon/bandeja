import SwiftUI
import WatchKit
import Combine

struct MatchTimerBarView: View {
    let gameId: String
    let matchId: String
    let game: WatchGame
    /// When the match timer reaches **STOPPED**, mirror web timed classic partial lock (`freezeTimedClassicSetAtPartialScore`).
    var onTimerStopped: (() -> Void)? = nil
    @Environment(WatchPreferencesStore.self) private var prefs
    @Environment(\.scenePhase) private var scenePhase

    @State private var snapshot: WatchMatchTimerSnapshot?
    @State private var tick = 0
    @State private var lastCapNotified = false
    @State private var isBusy = false
    @State private var lastObservedRelayTick = 0
    @State private var relayObserveTask: Task<Void, Never>?

    private var lang: String { prefs.uiLanguageCode }

    var body: some View {
        Group {
            if game.isMatchTimerEnabled {
                content
            }
        }
        .task {
            startRelayObserver()
            await refresh()
        }
        .onDisappear {
            relayObserveTask?.cancel()
            relayObserveTask = nil
            lastObservedRelayTick = 0
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, snapshot?.status == "RUNNING" {
                Task { await refresh() }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(formattedElapsed)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(overCap ? .orange : .primary)
                if let cap = snapshot?.capMinutes ?? game.matchTimedCapMinutes, cap > 0 {
                    Text("/ \(formatCap(cap))")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            if snapshot != nil {
                HStack(spacing: 6) {
                    controlButtons
                }
            }
        }
        .padding(.vertical, 2)
        .onReceive(Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()) { _ in
            if snapshot?.status == "RUNNING" { tick += 1 }
        }
    }

    private var overCap: Bool {
        guard let s = snapshot, s.status == "RUNNING" else { return false }
        let cap = s.capMinutes ?? game.matchTimedCapMinutes ?? 0
        guard cap > 0 else { return false }
        return liveElapsedMs(s) >= Double(cap * 60_000)
    }

    private func formatCap(_ minutes: Int) -> String {
        String(format: "%d:%02d", minutes, 0)
    }

    @ViewBuilder
    private var controlButtons: some View {
        let st = snapshot?.status ?? "IDLE"
        if isBusy {
            ProgressView().controlSize(.mini)
        } else {
            if st == "IDLE" || st == "STOPPED" {
                Button(WatchCopy.matchTimerStart(lang)) { Task { await run("start") } }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.mini)
            }
            if st == "RUNNING" {
                Button(WatchCopy.matchTimerPause(lang)) { Task { await run("pause") } }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                Button(WatchCopy.matchTimerStop(lang)) { Task { await run("stop") } }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
            }
            if st == "PAUSED" {
                Button(WatchCopy.matchTimerResume(lang)) { Task { await run("resume") } }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.mini)
                Button(WatchCopy.matchTimerStop(lang)) { Task { await run("stop") } }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
            }
            if st != "IDLE" {
                Button(WatchCopy.matchTimerReset(lang)) { Task { await run("reset") } }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
            }
        }
    }

    private var formattedElapsed: String {
        let ms = snapshot.map { liveElapsedMs($0) } ?? 0
        let s = Int(ms / 1000)
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }

    private func liveElapsedMs(_ s: WatchMatchTimerSnapshot) -> Double {
        if s.status == "RUNNING" {
            if let anchor = parseIso8601(s.serverNow) {
                return max(0, Double(s.elapsedMs) + Date().timeIntervalSince(anchor) * 1000)
            }
            if let start = s.startedAt, let t0 = parseIso8601(start) {
                return max(0, Double(s.elapsedMs) + Date().timeIntervalSince(t0) * 1000)
            }
        }
        return max(0, Double(s.elapsedMs))
    }

    private func parseIso8601(_ string: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: string) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: string)
    }

    private func refresh() async {
        do {
            let s = try await WatchMatchTimerService.fetchSnapshot(gameId: gameId, matchId: matchId)
            await MainActor.run {
                applySnapshotIfNewer(s)
            }
        } catch {
            // Keep any relayed snapshot when HTTP fallback fails.
        }
    }

    private func startRelayObserver() {
        relayObserveTask?.cancel()
        lastObservedRelayTick = WatchMatchTimerRelayStore.shared.tick
        relayObserveTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 150_000_000)
                await MainActor.run {
                    consumePendingRelayIfNeeded()
                }
            }
        }
    }

    private func consumePendingRelayIfNeeded() {
        let store = WatchMatchTimerRelayStore.shared
        guard store.tick != lastObservedRelayTick else { return }
        lastObservedRelayTick = store.tick
        guard let message = store.lastMessage else { return }
        guard message.gameId == gameId, message.matchId == matchId else { return }
        guard let relayed = message.snapshot else { return }
        applySnapshotIfNewer(relayed)
    }

    private func applySnapshotIfNewer(_ incoming: WatchMatchTimerSnapshot) {
        guard WatchMatchTimerSnapshotOrdering.isIncomingAtLeastAsNew(incoming, than: snapshot) else { return }
        let previousStatus = snapshot?.status
        handleCapHaptic(incoming)
        snapshot = incoming
        if incoming.status == "STOPPED", previousStatus != "STOPPED" {
            onTimerStopped?()
        }
    }

    private func handleCapHaptic(_ s: WatchMatchTimerSnapshot) {
        if s.capJustNotified == true, !lastCapNotified {
            WKInterfaceDevice.current().play(.notification)
        }
        lastCapNotified = s.capJustNotified == true
    }

    private func run(_ action: String) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let s = try await WatchMatchTimerService.transition(gameId: gameId, matchId: matchId, action: action)
            applySnapshotIfNewer(s)
            if action == "pause" {
                WorkoutManager.shared.autoPause()
            } else if action == "resume" {
                WorkoutManager.shared.autoResume()
            }
        } catch {}
    }
}
