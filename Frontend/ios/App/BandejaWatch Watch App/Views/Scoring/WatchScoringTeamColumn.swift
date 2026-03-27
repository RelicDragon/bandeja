import SwiftUI

struct WatchScoringTeamColumn: View {
    let users: [WatchUser]
    let scoreLabel: String
    let action: () -> Void
    let decrementAction: () -> Void
    var disabled: Bool = false
    var decrementDisabled: Bool = false

    var body: some View {
        VStack(spacing: 8) {
            Button(action: action) {
                VStack(spacing: 6) {
                    if users.isEmpty {
                        Text("—")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    } else {
                        HStack(spacing: 4) {
                            ForEach(users) { user in
                                WatchPlayerAvatarView(user: user, size: 24, role: nil)
                            }
                        }

                        ForEach(users) { user in
                            Text(user.displayName)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.88))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                                .multilineTextAlignment(.center)
                        }
                    }

                    Text(scoreLabel)
                        .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity, minHeight: 112)
                .padding(.horizontal, 8)
                .padding(.vertical, 10)
                .background(
                    LinearGradient(
                        colors: [
                            Color.accentColor.opacity(0.95),
                            Color.accentColor.opacity(0.65)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.white.opacity(0.25), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(disabled)

            Button(action: decrementAction) {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .semibold))
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
