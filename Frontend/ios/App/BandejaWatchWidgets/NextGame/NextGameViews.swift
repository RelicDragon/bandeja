import SwiftUI
import WidgetKit

struct NextGameWidgetEntryView: View {
    let entry: NextGameEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            RectangularNextGameView(entry: entry)
        case .accessoryCircular:
            CircularNextGameView(entry: entry)
        case .accessoryInline:
            InlineNextGameView(entry: entry)
        case .accessoryCorner:
            CornerNextGameView(entry: entry)
        default:
            Text(WatchWidgetCopy.brand())
        }
    }
}

private struct RectangularNextGameView: View {
    let entry: NextGameEntry
    private var lang: String { WatchWidgetCopy.widgetLang() }

    var body: some View {
        if let game = entry.game {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                    Text(game.title)
                        .font(.headline)
                        .lineLimit(1)
                }
                Text(game.relativeTimeString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let club = game.clubName, !club.isEmpty {
                    Text(club)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(gameDeepLink(id: game.id))
        } else if !entry.isAuthenticated {
            VStack(spacing: 4) {
                Image(systemName: "person.crop.circle.badge.questionmark")
                Text(WatchWidgetCopy.signInOnIPhone(lang))
                    .font(.caption2)
                    .multilineTextAlignment(.center)
            }
        } else {
            VStack(spacing: 4) {
                Image(systemName: "sportscourt")
                Text(WatchWidgetCopy.noUpcomingGames(lang))
                    .font(.caption2)
            }
        }
    }
}

private struct CircularNextGameView: View {
    let entry: NextGameEntry

    var body: some View {
        if let game = entry.game {
            let hours = game.hoursUntilStart
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    if hours < 1 {
                        Text(game.startTime, style: .relative)
                            .font(.caption2)
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.8)
                    } else {
                        Text("\(Int(hours))h")
                            .font(.title3.bold())
                    }
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                }
            }
            .widgetURL(gameDeepLink(id: game.id))
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "sportscourt")
                    .font(.title3)
            }
        }
    }
}

private struct InlineNextGameView: View {
    let entry: NextGameEntry

    var body: some View {
        if let game = entry.game {
            Label {
                Text("\(game.title) · \(game.relativeTimeString)")
            } icon: {
                Image(systemName: "sportscourt.fill")
            }
            .widgetURL(gameDeepLink(id: game.id))
        } else {
            Label(WatchWidgetCopy.brand(), systemImage: "sportscourt")
        }
    }
}

private struct CornerNextGameView: View {
    let entry: NextGameEntry

    var body: some View {
        if let game = entry.game {
            Text(game.relativeTimeString)
                .font(.caption2)
                .widgetCurvesContent()
                .widgetLabel {
                    Text(WatchWidgetCopy.brand())
                }
                .widgetURL(gameDeepLink(id: game.id))
        } else {
            Image(systemName: "sportscourt.fill")
                .widgetLabel {
                    Text(WatchWidgetCopy.brand())
                }
        }
    }
}

private func gameDeepLink(id: String) -> URL {
    URL(string: "bandejawatch://games/\(id)")!
}
