import HealthKit
import SwiftUI

struct WorkoutMetricsBar: View {
    let lang: String
    let calories: Double
    let heartRate: Double
    let elapsedSeconds: TimeInterval
    var sessionState: HKWorkoutSessionState = .running
    var isOffline: Bool = false
    var onTogglePause: (() -> Void)?

    var body: some View {
        let m = Int(elapsedSeconds) / 60
        let s = Int(elapsedSeconds) % 60
        HStack(spacing: 10) {
            if let onTogglePause, sessionState == .running || sessionState == .paused {
                Button {
                    onTogglePause()
                } label: {
                    Image(systemName: sessionState == .paused ? "play.fill" : "pause.fill")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(
                    sessionState == .paused ? WatchCopy.workoutResumeA11y(lang) : WatchCopy.workoutPauseA11y(lang)
                )
            }
            if isOffline {
                Image(systemName: "wifi.slash")
                    .foregroundStyle(.yellow)
                    .accessibilityLabel(WatchCopy.offline(lang))
            }
            Label(WatchCopy.workoutKcal(lang, value: Int(calories.rounded())), systemImage: "flame.fill")
                .foregroundStyle(.orange)
            if heartRate > 0 {
                Label(WatchCopy.workoutBpm(lang, value: Int(heartRate.rounded())), systemImage: "heart.fill")
                    .foregroundStyle(.red)
            }
            Label(WatchCopy.workoutTimerShort(lang, minutes: m, seconds: s), systemImage: "timer")
                .foregroundStyle(.green)
        }
        .font(.caption2)
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }
}
