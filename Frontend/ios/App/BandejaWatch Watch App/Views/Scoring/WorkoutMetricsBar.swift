import SwiftUI

struct WorkoutMetricsBar: View {
    let lang: String
    let calories: Double
    let heartRate: Double
    let elapsedSeconds: TimeInterval

    var body: some View {
        let m = Int(elapsedSeconds) / 60
        let s = Int(elapsedSeconds) % 60
        HStack(spacing: 10) {
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
