import SwiftUI

struct WatchPlayerAvatarView: View {
    let user: WatchUser
    var size: CGFloat = 32
    var role: String?

    @State private var preferFullAvatar = false

    private var imageURL: URL? {
        if preferFullAvatar { return user.resolvedAvatarURL }
        if let t = user.resolvedTinyAvatarURL { return t }
        return user.resolvedAvatarURL
    }

    var body: some View {
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
