import SwiftUI
import WatchKit
import os

/// Temporary English literals until the copy owner moves them into `WatchCopy`.

struct MatchTimerBarView: View {
    let gameId: String
    let matchId: String
    let game: WatchGame
    var compact: Bool = false
    var onTimerStopped: (() -> Void)? = nil
    @Environment(WatchPreferencesStore.self) private var prefs
    @Environment(\.scenePhase) private var scenePhase

    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "BandejaWatch", category: "MatchTimerBar")
    private static let errorDisplayDuration: Duration = .seconds(3)

    @State private var snapshot: WatchMatchTimerSnapshot?
    /// Local receipt time of `snapshot`; elapsed time is anchored here, not on `serverNow`.
    @State private var snapshotReceivedAt: Date = .now
    @State private var lastCapNotified = false
    @State private var isBusy = false
    @State private var errorText: String?
    @State private var errorDismissTask: Task<Void, Never>?

    private var lang: String { prefs.uiLanguageCode }
    private var isRunning: Bool { snapshot?.status == "RUNNING" }

    var body: some View {
        Group {
            if game.isMatchTimerEnabled {
                content
            }
        }
        .task {
            consumeRelay()
            await refresh()
        }
        .onChange(of: WatchMatchTimerRelayStore.shared.tick) { _, _ in
            consumeRelay()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, isRunning {
                Task { await refresh() }
            }
        }
        .onDisappear {
            errorDismissTask?.cancel()
            errorDismissTask = nil
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 2) {
            if compact {
                compactContent
            } else {
                fullContent
            }
            if let errorText {
                Text(errorText)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: errorText)
    }

    private var fullContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            timerLabelRow
            if snapshot != nil {
                HStack(spacing: 6) {
                    controlButtons
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var compactContent: some View {
        HStack(spacing: 6) {
            timerLabelRow
            Spacer(minLength: 0)
            if snapshot != nil {
                compactControlButtons
            }
        }
        .padding(.vertical, 1)
    }

    /// Ticks twice a second only while the timer is RUNNING; otherwise the schedule is paused
    /// so a stopped bar costs nothing.
    private var timerLabelRow: some View {
        TimelineView(.animation(minimumInterval: 0.5, paused: !isRunning)) { context in
            HStack(spacing: 4) {
                Text(formattedElapsed(now: context.date))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(overCap(now: context.date) ? .orange : .primary)
                if let cap = snapshot?.capMinutes ?? game.matchTimedCapMinutes, cap > 0 {
                    Text("/ \(formatCap(cap))")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func overCap(now: Date) -> Bool {
        guard let s = snapshot, s.status == "RUNNING" else { return false }
        let cap = s.capMinutes ?? game.matchTimedCapMinutes ?? 0
        guard cap > 0 else { return false }
        return liveElapsedMs(s, now: now) >= Double(cap * 60_000)
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

    @ViewBuilder
    private var compactControlButtons: some View {
        let st = snapshot?.status ?? "IDLE"
        if isBusy {
            ProgressView().controlSize(.mini)
        } else {
            if st == "IDLE" || st == "STOPPED" {
                timerIconButton("play.fill", label: WatchCopy.matchTimerStart(lang)) {
                    Task { await run("start") }
                }
            }
            if st == "RUNNING" {
                timerIconButton("pause.fill", label: WatchCopy.matchTimerPause(lang)) {
                    Task { await run("pause") }
                }
                timerIconButton("stop.fill", label: WatchCopy.matchTimerStop(lang)) {
                    Task { await run("stop") }
                }
            }
            if st == "PAUSED" {
                timerIconButton("play.fill", label: WatchCopy.matchTimerResume(lang)) {
                    Task { await run("resume") }
                }
                timerIconButton("stop.fill", label: WatchCopy.matchTimerStop(lang)) {
                    Task { await run("stop") }
                }
            }
        }
    }

    private func timerIconButton(_ systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.caption2.weight(.semibold))
                .frame(width: 26, height: 26)
        }
        .buttonStyle(.bordered)
        .controlSize(.mini)
        .accessibilityLabel(label)
    }

    private func formattedElapsed(now: Date) -> String {
        let ms = snapshot.map { liveElapsedMs($0, now: now) } ?? 0
        let s = Int(ms / 1000)
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }

    /// While RUNNING the server's `elapsedMs` is extended by the time since *we* received the
    /// snapshot; comparing `serverNow` to the local clock would leak server/watch clock skew.
    private func liveElapsedMs(_ s: WatchMatchTimerSnapshot, now: Date) -> Double {
        guard s.status == "RUNNING" else { return max(0, Double(s.elapsedMs)) }
        return max(0, Double(s.elapsedMs) + now.timeIntervalSince(snapshotReceivedAt) * 1000)
    }

    private func refresh() async {
        do {
            let s = try await WatchMatchTimerService.fetchSnapshot(gameId: gameId, matchId: matchId)
            let receivedAt = Date()
            applySnapshotIfNewer(s, receivedAt: receivedAt)
            WatchMatchTimerRelayStore.shared.ingest(gameId: gameId, matchId: matchId, snapshot: s)
        } catch {
            // Keep any relayed snapshot when the HTTP fallback fails, but say so.
            Self.log.error("Timer fetch failed: \(error.localizedDescription, privacy: .public)")
            showError(WatchCopy.matchTimerError(prefs.uiLanguageCode))
        }
    }

    private func consumeRelay() {
        let store = WatchMatchTimerRelayStore.shared
        guard let message = store.lastMessage else { return }
        guard message.gameId == gameId, message.matchId == matchId else { return }
        guard let relayed = message.snapshot else { return }
        applySnapshotIfNewer(relayed, receivedAt: message.receivedAt)
    }

    private func applySnapshotIfNewer(_ incoming: WatchMatchTimerSnapshot, receivedAt: Date) {
        guard WatchMatchTimerSnapshotOrdering.isIncomingAtLeastAsNew(incoming, than: snapshot) else { return }
        let previousStatus = snapshot?.status
        handleCapHaptic(incoming)
        snapshot = incoming
        snapshotReceivedAt = receivedAt
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

    private func showError(_ text: String) {
        errorText = text
        errorDismissTask?.cancel()
        errorDismissTask = Task { @MainActor in
            try? await Task.sleep(for: Self.errorDisplayDuration)
            guard !Task.isCancelled else { return }
            errorText = nil
        }
    }

    private func run(_ action: String) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let s = try await WatchMatchTimerService.transition(gameId: gameId, matchId: matchId, action: action)
            applySnapshotIfNewer(s, receivedAt: Date())
            // Publish before touching the workout: the bridge sees the store already at the
            // target status and skips its own (duplicate) pause/resume request.
            WatchMatchTimerRelayStore.shared.ingest(gameId: gameId, matchId: matchId, snapshot: s)
            if action == "pause" {
                WorkoutManager.shared.autoPause()
            } else if action == "resume" {
                WorkoutManager.shared.autoResume()
            }
        } catch {
            Self.log.error("Timer \(action, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            showError(WatchCopy.matchTimerError(prefs.uiLanguageCode))
        }
    }
}
