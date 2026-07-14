import SwiftUI
import WidgetKit
import BandejaNextGames

enum HomeNextGameWidgetKind {
    static let id = HomeWidgetKinds.nextGame
}

private let bandejaAccent = Color(red: 0.12, green: 0.72, blue: 0.52)

struct HomeNextGameWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = HomeWidgetCopy.widgetLang()
        return StaticConfiguration(kind: HomeNextGameWidgetKind.id, provider: HomeNextGameProvider()) { entry in
            HomeNextGameEntryView(entry: entry)
                .containerBackground(for: .widget) {
                    ZStack {
                        Color(.systemBackground)
                        LinearGradient(
                            colors: [
                                bandejaAccent.opacity(0.16),
                                Color.clear,
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    }
                }
                .tint(bandejaAccent)
        }
        .configurationDisplayName(HomeWidgetCopy.nextGameWidgetTitle(lang))
        .description(HomeWidgetCopy.nextGameWidgetDescription(lang))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
