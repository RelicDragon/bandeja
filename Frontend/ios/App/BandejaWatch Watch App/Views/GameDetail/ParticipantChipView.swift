import SwiftUI

struct ParticipantChipView: View {
    let participant: WatchParticipant

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(chipColor.opacity(0.2))
                    .frame(width: 32, height: 32)
                Text(initials)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(chipColor)
            }
            Text(participant.user.displayName)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(width: 40)
    }

    private var initials: String {
        let first = participant.user.firstName?.prefix(1) ?? ""
        let last = participant.user.lastName?.prefix(1) ?? ""
        return "\(first)\(last)"
    }

    private var chipColor: Color {
        switch participant.role {
        case "OWNER": return .yellow
        case "ADMIN": return .blue
        default: return .primary
        }
    }
}
