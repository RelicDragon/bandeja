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
                    text: HomeWidgetCopy.signIn(entry.language),
                    url: HomeWidgetDeepLink.login
                )
            } else if let game = entry.game {
                VStack(alignment: .leading, spacing: 6) {
                    Text(HomeWidgetCopy.nextGameWidgetTitle(entry.language))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(BandejaBrand.accent)
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
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BandejaBrand.accent)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .widgetURL(HomeWidgetDeepLink.game(id: game.id))
            } else {
                emptyState(
                    text: HomeWidgetCopy.noUpcomingGames(entry.language),
                    url: HomeWidgetDeepLink.home
                )
            }
        }
        .padding(14)
    }

    private func emptyState(text: String, url: URL) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            BandejaBrandMark(size: 36)
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
                    detail: HomeWidgetCopy.signIn(entry.language),
                    url: HomeWidgetDeepLink.login
                )
            } else if let game = entry.game {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(HomeWidgetCopy.nextGameWidgetTitle(entry.language))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(BandejaBrand.accent)
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
                                .foregroundStyle(BandejaBrand.accent)
                            Text(game.absoluteTimeString(lang: entry.language))
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 0)

                    playersBadge(game)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .widgetURL(HomeWidgetDeepLink.game(id: game.id))
            } else {
                emptyRow(
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
            .background(BandejaBrand.accent.opacity(0.14), in: Capsule())
            .foregroundStyle(BandejaBrand.accent)
    }

    private func emptyRow(detail: String, url: URL) -> some View {
        HStack(spacing: 14) {
            BandejaBrandMark(size: 52)
            VStack(alignment: .leading, spacing: 4) {
                Text(HomeWidgetCopy.brand())
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)
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
