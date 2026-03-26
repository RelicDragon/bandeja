import SwiftUI

struct GameRowView: View {
    let game: WatchGame

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(game.displayTitle)
                .font(.headline)
                .lineLimit(1)

            HStack(spacing: 6) {
                Group {
                    if game.timeIsSet {
                        Text(game.startTime, format: .relative(presentation: .named))
                    } else {
                        Text(game.startTime.formatted(date: .abbreviated, time: .omitted))
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
                statusDot
                Text(game.participantCountLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private var statusDot: some View {
        let color: Color
        switch game.status {
        case "STARTED":   color = .green
        case "ANNOUNCED": color = .yellow
        default:          color = .secondary
        }
        return Circle()
            .fill(color)
            .frame(width: 6, height: 6)
    }
}
