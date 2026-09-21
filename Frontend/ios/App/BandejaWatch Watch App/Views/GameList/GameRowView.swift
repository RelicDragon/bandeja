import SwiftUI

struct GameRowView: View {
    let game: WatchGame
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        VStack(alignment: .leading, spacing: 3) {
            Text(game.displayTitle)
                .font(.headline)
                .lineLimit(1)

            HStack(spacing: 6) {
                Group {
                    if game.timeIsSet {
                        Text(game.startTime, format: .relative(presentation: .named))
                    } else {
                        Text(game.startTime, format: Date.FormatStyle(date: .abbreviated, time: .omitted))
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                if let club = game.club {
                    Text("· \(club.name)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            HStack(spacing: 6) {
                Image(systemName: game.gameType.gameTypeIconName)
                    .font(.caption2)
                    .foregroundStyle(Color.accentColor)
                statusDot(lang: lang)
                Text(WatchCopy.participantCountLabel(
                    lang: lang,
                    count: game.participantCount,
                    max: game.maxParticipants,
                    isBar: game.entityType == "BAR"
                ))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if let summary = game.weatherSummary {
                    WatchWeatherBadgeView(summary: summary, lang: lang)
                }
                if game.needsAttendanceAnswer {
                    attendanceMarker(lang: lang)
                }
            }
        }
        .padding(.vertical, 2)
    }

    /// PRD 346 — a quiet "you have not answered yet" marker, so opening the
    /// game is an obvious next step. It is never a warning: silence is allowed.
    private func attendanceMarker(lang: String) -> some View {
        Image(systemName: "hand.raised")
            .font(.caption2)
            .foregroundStyle(.orange)
            .accessibilityLabel(WatchCopy.attendanceQuestion(lang))
    }

    private func statusDot(lang: String) -> some View {
        Circle()
            .fill(WatchGameStatusCopy.color(status: game.status))
            .frame(width: 6, height: 6)
            .accessibilityLabel(WatchGameStatusCopy.label(
                status: game.status,
                resultsStatus: game.resultsStatus,
                lang: lang
            ))
    }
}
