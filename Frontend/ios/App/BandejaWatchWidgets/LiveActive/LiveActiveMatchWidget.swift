import SwiftUI
import WidgetKit

struct LiveActiveMatchWidget: Widget {
    private let kind = "com.funified.bandeja.liveActiveMatch"

    var body: some WidgetConfiguration {
        let lang = WatchWidgetCopy.widgetLang()
        return StaticConfiguration(kind: kind, provider: LiveActiveMatchProvider()) { entry in
            LiveActiveMatchEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(WatchWidgetCopy.liveWidgetTitle(lang))
        .description(WatchWidgetCopy.liveWidgetDescription(lang))
        .supportedFamilies([
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}
