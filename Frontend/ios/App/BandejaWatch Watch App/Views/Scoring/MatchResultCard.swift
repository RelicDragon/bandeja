import SwiftUI

struct MatchResultCard: View {
    let roundNumber: Int
    let match: WatchMatch
    let isCurrent: Bool
    let isFinal: Bool
    let onOpen: () -> Void
    @Environment(WatchPreferencesStore.self) private var prefs

    var body: some View {
        let lang = prefs.uiLanguageCode
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("R\(roundNumber) · M\(match.matchNumber)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    if isCurrent && !isFinal {
                        Text(WatchCopy.now(lang))
                            .font(.caption2.bold())
                            .foregroundStyle(.orange)
                    }
                }
                teamRow(teamNumber: 1)
                teamRow(teamNumber: 2)
                if !match.sets.isEmpty {
                    Text(setsLabel())
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func teamRow(teamNumber: Int) -> some View {
        HStack(alignment: .top, spacing: 6) {
            if let team = match.teams.first(where: { $0.teamNumber == teamNumber }), !team.players.isEmpty {
                HStack(spacing: 3) {
                    ForEach(team.players, id: \.userId) { p in
                        WatchPlayerAvatarView(user: p.user, size: 20, role: nil)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(team.players, id: \.userId) { p in
                        Text(p.user.displayName)
                            .font(.caption)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                }
            } else {
                Text("—")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
        }
    }

    private func setsLabel() -> String {
        match.sets
            .sorted { $0.setNumber < $1.setNumber }
            .map { "\($0.teamAScore)-\($0.teamBScore)" }
            .joined(separator: "  ")
    }
}
