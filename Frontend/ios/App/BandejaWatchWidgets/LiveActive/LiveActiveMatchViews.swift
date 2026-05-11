import SwiftUI
import WidgetKit

struct LiveActiveMatchEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: LiveActiveMatchEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            VStack(spacing: 0) {
                Text(entry.score)
                    .font(.system(.title3, design: .rounded).weight(.bold))
                    .minimumScaleFactor(0.5)
            }
            .widgetAccentable()
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(entry.score)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(entry.active ? .primary : .secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            Text(entry.active ? "\(entry.title) · \(entry.score)" : "—")
                .font(.caption2)
        }
    }
}
