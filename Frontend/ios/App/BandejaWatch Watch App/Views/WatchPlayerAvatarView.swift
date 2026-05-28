import SwiftUI

struct WatchPlayerAvatarView: View {
    let user: WatchUser
    var size: CGFloat = 32
    var role: String?
    var showLevel: Bool = true
    var levelSport: WatchSport?

    @Environment(\.colorScheme) private var colorScheme
    @State private var preferFullAvatar = false

    private var imageURL: URL? {
        if preferFullAvatar { return user.resolvedAvatarURL }
        if let t = user.resolvedTinyAvatarURL { return t }
        return user.resolvedAvatarURL
    }

    private var resolvedLevelSport: WatchSport {
        levelSport ?? WatchProfileSports.userPrimarySport(user)
    }

    private var levelBadgeText: String? {
        guard showLevel else { return nil }
        return WatchProfileSports.formatLevelBadge(for: user, sport: resolvedLevelSport)
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            avatarCircle
            if let text = levelBadgeText {
                levelBadge(text)
            }
        }
        .frame(width: size, height: size)
    }

    private var avatarCircle: some View {
        ZStack {
            if let url = imageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        placeholder
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                            .onAppear {
                                if user.resolvedTinyAvatarURL != nil && !preferFullAvatar {
                                    preferFullAvatar = true
                                }
                            }
                    @unknown default:
                        placeholder
                    }
                }
                .id(url)
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if let role, ringWidth > 0 {
                Circle()
                    .strokeBorder(accentColor(for: role).opacity(0.85), lineWidth: ringWidth)
            }
        }
    }

    @ViewBuilder
    private func levelBadge(_ text: String) -> some View {
        let badgeSize = max(11, size * 0.38)
        let fontSize = max(6, size * 0.2)
        let unavailable = text == "-"
        let level = unavailable
            ? 1.0
            : WatchProfileSports.displayLevel(for: user, sport: resolvedLevelSport)
        Text(text)
            .font(.system(size: fontSize, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            .frame(width: badgeSize, height: badgeSize)
            .background(
                unavailable
                    ? Color.gray.opacity(colorScheme == .dark ? 0.75 : 0.55)
                    : WatchLevelColor.color(for: level, isDark: colorScheme == .dark)
            )
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(Color.black.opacity(0.15), lineWidth: 0.5))
            .offset(x: size * 0.08, y: size * 0.08)
    }

    private var ringWidth: CGFloat {
        role == nil ? 0 : max(1, size * 0.06)
    }

    private var placeholder: some View {
        ZStack {
            Circle()
                .fill(placeholderTint.opacity(0.22))
            Text(user.initials)
                .font(.system(size: max(8, size * 0.34), weight: .semibold))
                .foregroundStyle(placeholderTint)
        }
    }

    private var placeholderTint: Color {
        guard let role else { return .secondary }
        return accentColor(for: role)
    }

    private func accentColor(for role: String) -> Color {
        switch role {
        case "OWNER": return .yellow
        case "ADMIN": return .blue
        default: return .primary
        }
    }
}
