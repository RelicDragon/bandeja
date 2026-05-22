import SwiftUI

/// Compact squash court outline for serve coach strip.
struct SquashCourtStrip: View {
    var serverTeam: TeamSide?
    var serverOnRightHalf: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(red: 0.15, green: 0.42, blue: 0.72).opacity(0.88))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(Color.white.opacity(0.22), lineWidth: 1)
                )
            Rectangle()
                .fill(Color.white.opacity(0.45))
                .frame(height: 1.5)
            Rectangle()
                .fill(Color.white.opacity(0.28))
                .frame(width: 1.5)
            if let serverTeam {
                HStack(spacing: 0) {
                    halfGlow(team: .teamA, serverTeam: serverTeam, isRight: false)
                    halfGlow(team: .teamB, serverTeam: serverTeam, isRight: true)
                }
                .padding(3)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func halfGlow(team: TeamSide, serverTeam: TeamSide, isRight: Bool) -> some View {
        let serving = serverTeam == team
        let deuceEdge = serverOnRightHalf == isRight
        ZStack(alignment: deuceEdge ? .trailing : .leading) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(serving ? Color.orange.opacity(0.42) : Color.clear)
            if serving {
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(Color.orange.opacity(0.9))
                    .frame(width: 3)
                    .padding(.vertical, 3)
                    .padding(deuceEdge ? .trailing : .leading, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
