import SwiftUI

struct ParticipantChipView: View {
    let participant: WatchParticipant
    var levelSport: WatchSport?

    var body: some View {
        VStack(spacing: 2) {
            WatchPlayerAvatarView(
                user: participant.user,
                size: 32,
                role: participant.role,
                levelSport: levelSport
            )
            Text(participant.user.displayName)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(width: 40)
    }
}
