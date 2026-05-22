import SwiftUI

/// Compact pickleball court (mirrors web `PickleballCourt` NVZ + service highlight).
struct PickleballCourtStrip: View {
    var serverTeam: TeamSide?
    var serveRight: Bool

    private var serverTop: Bool { serverTeam == .teamB }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(red: 0.72, green: 0.45, blue: 0.18).opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(Color(red: 0.35, green: 0.2, blue: 0.08).opacity(0.45), lineWidth: 1)
                )
            Rectangle()
                .fill(Color.white.opacity(0.7))
                .frame(height: 2)
            if serverTeam != nil {
                serveHighlight
            }
            HStack {
                Rectangle()
                    .fill(Color.white.opacity(0.35))
                    .frame(width: 1)
                Spacer()
            }
            .padding(.horizontal, 6)
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var serveHighlight: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let halfW = w / 2
            let x = serveRight ? halfW + 2 : 2
            let y = serverTop ? 2 : h / 2 + 1
            let boxH = serverTop ? h / 2 - 3 : h / 2 - 4
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color.orange.opacity(0.4))
                .overlay(
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .stroke(Color.orange.opacity(0.8), lineWidth: 1)
                )
                .frame(width: halfW - 4, height: boxH)
                .position(x: x + (halfW - 4) / 2, y: y + boxH / 2)
        }
        .padding(2)
    }
}
