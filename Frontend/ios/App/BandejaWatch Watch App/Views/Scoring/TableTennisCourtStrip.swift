import SwiftUI

/// Watch-friendly table outline (mirrors web `TableTennisCourt` proportions, no SVG).
struct TableTennisCourtStrip: View {
    var serverTeam: TeamSide?
    var serverOnRightHalf: Bool

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
                    halfServeGlow(team: .teamA, serverTeam: serverTeam, isRightHalf: false)
                    halfServeGlow(team: .teamB, serverTeam: serverTeam, isRightHalf: true)
                }
                .padding(3)
            }

            HStack {
                Text("TT")
                    .font(.system(size: 8, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white.opacity(0.75))
                    .padding(.leading, 5)
                    .padding(.top, 2)
                Spacer()
            }
            .frame(maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 30)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func halfServeGlow(team: TeamSide, serverTeam: TeamSide, isRightHalf: Bool) -> some View {
        let serving = serverTeam == team
        let deuceEdge = serverOnRightHalf == isRightHalf
        ZStack(alignment: deuceEdge ? .trailing : .leading) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(serving ? Color.orange.opacity(0.42) : Color.clear)
            if serving {
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(Color.orange.opacity(0.9))
                    .frame(width: 3)
                    .padding(.vertical, 4)
                    .padding(deuceEdge ? .trailing : .leading, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
