import SwiftUI
import WidgetKit

struct NextGameWidget: Widget {
    private let kind = "com.funified.bandeja.nextGame"

    var body: some WidgetConfiguration {
        let lang = WatchWidgetCopy.widgetLang()
        return StaticConfiguration(kind: kind, provider: NextGameProvider()) { entry in
            NextGameWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(WatchWidgetCopy.nextGameWidgetTitle(lang))
        .description(WatchWidgetCopy.nextGameWidgetDescription(lang))
        .supportedFamilies([
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline,
            .accessoryCorner
        ])
    }
}
