import SwiftUI
import WidgetKit
import BandejaNextGames

struct HomeNextGameEntryView: View {
    let entry: HomeNextGameEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallNextGameView(entry: entry)
        case .systemMedium:
            MediumNextGameView(entry: entry)
        default:
            MediumNextGameView(entry: entry)
        }
    }
}

private struct SmallNextGameView: View {
    let entry: HomeNextGameEntry

    var body: some View {
        Group {
            if !entry.isAuthenticated {
                emptyState(
                    icon: "person.crop.circle.badge.questionmark",
                    text: HomeWidgetCopy.signIn(entry.language),
                    url: HomeWidgetDeepLink.login
                )
            } else if let game = entry.game {
                VStack(alignment: .leading, spacing: 6) {
                    Label(HomeWidgetCopy.brand(), systemImage: "sportscourt.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)

                    Text(game.title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)

                    if let club = game.clubName, !club.isEmpty {
                        Text(club)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)

                    Text(game.relativeTimeString(lang: entry.language, reference: entry.date))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .widgetURL(HomeWidgetDeepLink.game(id: game.id))
            } else {
                emptyState(
                    icon: "calendar.badge.clock",
                    text: HomeWidgetCopy.noUpcomingGames(entry.language),
                    url: HomeWidgetDeepLink.home
                )
            }
        }
        .padding(14)
    }

    private func emptyState(icon: String, text: String, url: URL) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.accentColor)
            Text(text)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .lineLimit(4)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(url)
    }
}

private struct MediumNextGameView: View {
    let entry: HomeNextGameEntry

    var body: some View {
        Group {
            if !entry.isAuthenticated {
                emptyRow(
                    icon: "person.crop.circle.badge.questionmark",
                    title: HomeWidgetCopy.brand(),
                    detail: HomeWidgetCopy.signIn(entry.language),
                    url: HomeWidgetDeepLink.login
                )
            } else if let game = entry.game {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Label(HomeWidgetCopy.nextGameWidgetTitle(entry.language), systemImage: "sportscourt.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                            .labelStyle(.titleAndIcon)
                            .lineLimit(1)

                        Text(game.title)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .minimumScaleFactor(0.9)

                        if let club = game.clubName, !club.isEmpty {
                            Text(club)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        Spacer(minLength: 0)

                        HStack(spacing: 10) {
                            Text(game.relativeTimeString(lang: entry.language, reference: entry.date))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(game.absoluteTimeString(lang: entry.language))
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 0)

                    VStack(alignment: .trailing, spacing: 8) {
                        playersBadge(game)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right.circle.fill")
                            .font(.title3)
                            .foregroundStyle(Color.accentColor.opacity(0.85))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .widgetURL(HomeWidgetDeepLink.game(id: game.id))
            } else {
                emptyRow(
                    icon: "calendar.badge.clock",
                    title: HomeWidgetCopy.nextGameWidgetTitle(entry.language),
                    detail: HomeWidgetCopy.noUpcomingGames(entry.language),
                    url: HomeWidgetDeepLink.home
                )
            }
        }
        .padding(16)
    }

    private func playersBadge(_ game: CachedNextGame) -> some View {
        Text(HomeWidgetCopy.players(game.participantCount, max: game.maxParticipants, lang: entry.language))
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.accentColor.opacity(0.15), in: Capsule())
            .foregroundStyle(Color.accentColor)
    }

    private func emptyRow(icon: String, title: String, detail: String, url: URL) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(url)
    }
}
