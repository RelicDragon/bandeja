import SwiftUI
import WidgetKit
import BandejaNextGames

struct NextGameWidgetEntryView: View {
    let entry: NextGameEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
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
        // Same locale the app uses for its relative-time strings, so `Text(_, style: .relative)`
        // and `RelativeDateTimeFormatter` agree with the watch app UI.
        .environment(\.locale, WatchWidgetCopy.formatterLocale())
    }
}

/// Live countdown while the game is in the future; static "Now" / "Ended" afterwards.
private struct NextGameRelativeText: View {
    let game: CachedNextGame
    let reference: Date

    var body: some View {
        if game.startsAfter(reference) {
            Text(game.startTime, style: .relative)
        } else {
            Text(game.relativeTimeString(reference: reference))
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
                NextGameRelativeText(game: game, reference: entry.date)
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
            let hours = game.hoursUntilStart(reference: entry.date)
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
                if game.startsAfter(entry.date) {
                    Text("\(game.title) · ") + Text(game.startTime, style: .relative)
                } else {
                    Text("\(game.title) · \(game.relativeTimeString(reference: entry.date))")
                }
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
            NextGameRelativeText(game: game, reference: entry.date)
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
