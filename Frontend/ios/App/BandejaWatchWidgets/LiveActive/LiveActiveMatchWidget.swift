import SwiftUI
import WidgetKit

struct LiveActiveMatchWidget: Widget {
    private let kind = "com.funified.bandeja.liveActiveMatch"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LiveActiveMatchProvider()) { entry in
            LiveActiveMatchEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Live scoring")
        .description("Active match from Bandeja scoring.")
        .supportedFamilies([
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}
