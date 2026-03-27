import SwiftUI

struct WatchScoringTeamColumn: View {
    let users: [WatchUser]
    let scoreLabel: String
    let action: () -> Void
    let decrementAction: () -> Void
    var disabled: Bool = false
    var decrementDisabled: Bool = false

    var body: some View {
        VStack(spacing: 6) {
            VStack(spacing: 4) {
                if users.isEmpty {
                    Text("—")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                } else {
                    HStack(spacing: 4) {
                        ForEach(users) { user in
                            WatchPlayerAvatarView(user: user, size: 22, role: nil)
                        }
                    }
                    ForEach(users) { user in
                        Text(user.displayName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .minimumScaleFactor(0.65)
                            .multilineTextAlignment(.center)
                    }
                }
            }
            .frame(maxWidth: .infinity)

            Button(action: action) {
                Text(scoreLabel)
                    .font(.title3.monospacedDigit())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .disabled(disabled)

            Button(action: decrementAction) {
                Image(systemName: "minus")
                    .font(.system(size: 11, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.bordered)
            .controlSize(.mini)
            .disabled(disabled || decrementDisabled)
        }
        .frame(maxWidth: .infinity)
    }
}
