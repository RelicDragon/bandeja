import SwiftUI
import WidgetKit
import BandejaNextGames

enum HomeNextGameWidgetKind {
    static let id = HomeWidgetKinds.nextGame
}

struct HomeNextGameWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = HomeWidgetCopy.widgetLang()
        return StaticConfiguration(kind: HomeNextGameWidgetKind.id, provider: HomeNextGameProvider()) { entry in
            HomeNextGameEntryView(entry: entry)
                .containerBackground(for: .widget) {
                    ZStack {
                        Color(.systemBackground)
                        BandejaBrand.wash.opacity(0.28)
                    }
                }
                .tint(BandejaBrand.accent)
        }
        .configurationDisplayName(HomeWidgetCopy.nextGameWidgetTitle(lang))
        .description(HomeWidgetCopy.nextGameWidgetDescription(lang))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
