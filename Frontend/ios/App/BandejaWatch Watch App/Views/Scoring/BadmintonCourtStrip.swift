import SwiftUI

/// Compact badminton court (mirrors web `BadmintonCourt` service-box highlight).
struct BadmintonCourtStrip: View {
    var serverTeam: TeamSide?
    var serveRight: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(red: 0.88, green: 0.94, blue: 1).opacity(0.95))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(Color(red: 0.1, green: 0.2, blue: 0.35).opacity(0.35), lineWidth: 1)
                )
            Rectangle()
                .fill(Color(red: 0.1, green: 0.2, blue: 0.35).opacity(0.25))
                .frame(height: 1.5)
                .padding(.horizontal, 4)
            Rectangle()
                .fill(Color(red: 0.1, green: 0.2, blue: 0.35).opacity(0.2))
                .frame(width: 1.5)
            if serverTeam != nil {
                HStack(spacing: 0) {
                    serviceHalf(active: !serveRight)
                    serviceHalf(active: serveRight)
                }
                .padding(4)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func serviceHalf(active: Bool) -> some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(active ? Color.orange.opacity(0.42) : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .stroke(active ? Color.orange.opacity(0.75) : Color.clear, lineWidth: 1)
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
