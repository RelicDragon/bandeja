import SwiftUI
import WatchKit
import Combine

struct MatchTimerBarView: View {
    let gameId: String
    let matchId: String
    let game: WatchGame
    @Environment(WatchPreferencesStore.self) private var prefs

    @State private var snapshot: WatchMatchTimerSnapshot?
    @State private var tick = 0
    @State private var lastCapNotified = false
    @State private var isBusy = false

    private var lang: String { prefs.uiLanguageCode }

    var body: some View {
        Group {
            if game.isMatchTimerEnabled {
                content
            }
        }
        .task { await refresh() }
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
        var ms = Double(s.elapsedMs)
        if s.status == "RUNNING", let start = s.startedAt, let t0 = parseIso8601(start) {
            ms += Date().timeIntervalSince(t0) * 1000
        }
        return max(0, ms)
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
                handleCapHaptic(s)
                snapshot = s
            }
        } catch {
            await MainActor.run { snapshot = nil }
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
            handleCapHaptic(s)
            snapshot = s
            if action == "pause" {
                WorkoutManager.shared.autoPause()
            } else if action == "resume" {
                WorkoutManager.shared.autoResume()
            }
        } catch {}
    }
}
