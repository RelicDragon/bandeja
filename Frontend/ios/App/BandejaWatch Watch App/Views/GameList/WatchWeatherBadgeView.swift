import SwiftUI

struct WatchWeatherBadgeView: View {
    let summary: WatchWeatherSummary
    var showCondition = false
    var lang = "en"

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: summary.systemImageName)
                .font(.caption2)
                .foregroundStyle(.yellow)
            Text(summary.temperatureLabel())
                .font(.caption2.weight(.semibold).monospacedDigit())
            if showCondition {
                Text(summary.conditionLabel(lang: lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if summary.stale {
                Circle()
                    .fill(.orange)
                    .frame(width: 5, height: 5)
                    .accessibilityLabel(WatchCopy.weatherStale(lang))
            }
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(.thinMaterial, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        "\(summary.temperatureLabel()), \(summary.conditionLabel(lang: lang))"
    }
}
