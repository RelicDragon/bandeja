import SwiftUI

/// Watch-friendly table outline (mirrors web `TableTennisCourt` proportions).
struct TableTennisCourtStrip: View {
    var serverTeam: TeamSide?
    var serverOnRightHalf: Bool
    var matchDoubles: Bool = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(red: 0.12, green: 0.48, blue: 0.38).opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(Color.white.opacity(0.22), lineWidth: 1)
                )

            Rectangle()
                .fill(Color.white.opacity(0.55))
                .frame(width: 1.5)
                .padding(.vertical, 3)

            Rectangle()
                .fill(Color.white.opacity(0.28))
                .frame(height: 9)
                .padding(.horizontal, 4)

            if let serverTeam {
                HStack(spacing: 0) {
                    halfServeGlow(team: .teamA, serverTeam: serverTeam)
                    halfServeGlow(team: .teamB, serverTeam: serverTeam)
                }
                .padding(3)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func halfServeGlow(team: TeamSide, serverTeam: TeamSide) -> some View {
        let serving = serverTeam == team
        ZStack {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(serving ? Color.orange.opacity(0.42) : Color.clear)
            if serving {
                GeometryReader { geo in
                    let markerX = serveMarkerX(in: geo.size.width, serveRight: serverOnRightHalf, doubles: matchDoubles)
                    RoundedRectangle(cornerRadius: 1, style: .continuous)
                        .fill(Color.orange.opacity(0.9))
                        .frame(width: matchDoubles ? 3 : 4, height: 14)
                        .position(x: markerX, y: geo.size.height / 2)
                }
                .padding(.vertical, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func serveMarkerX(in width: CGFloat, serveRight: Bool, doubles: Bool) -> CGFloat {
        if doubles {
            return serveRight ? width - 4 : 4
        }
        return serveRight ? width * 0.68 : width * 0.32
    }
}
