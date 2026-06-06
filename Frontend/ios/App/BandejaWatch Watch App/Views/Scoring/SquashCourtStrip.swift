import SwiftUI

/// Vertical squash court — WSF floor lines, no front wall (matches phone serve guide).
struct SquashCourtStrip: View {
    var serverTeam: TeamSide?
    var serveRight: Bool
    var courtEndsSwapped: Bool = false

    private enum R {
        static let courtL: CGFloat = 9.75
        static let courtW: CGFloat = 8.42
        static let shortLineY: CGFloat = 5.44
        static let lineM: CGFloat = 0.05
        static let boxM: CGFloat = 1.6
        static var boxFrontY: CGFloat { shortLineY + lineM }
    }

    private func project(
        cxCourt: CGFloat,
        depth: CGFloat,
        cx: CGFloat,
        frontY: CGFloat,
        backY: CGFloat,
        frontHW: CGFloat,
        backHW: CGFloat
    ) -> CGPoint {
        let t = depth / R.courtL
        let y = frontY + t * (backY - frontY)
        let hw = frontHW + t * (backHW - frontHW)
        let x = cx + (cxCourt / R.courtW - 0.5) * 2 * hw
        return CGPoint(x: x, y: y)
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let cx = w / 2
            let frontY = h * 0.33
            let backY = h * 0.9
            let frontHW = w * 0.31
            let backHW = w * 0.44
            let proj: (CGFloat, CGFloat) -> CGPoint = { cxCourt, depth in
                project(
                    cxCourt: cxCourt,
                    depth: depth,
                    cx: cx,
                    frontY: frontY,
                    backY: backY,
                    frontHW: frontHW,
                    backHW: backHW
                )
            }

            let fl = proj(0, 0)
            let fr = proj(R.courtW, 0)
            let bl = proj(0, R.courtL)
            let br = proj(R.courtW, R.courtL)
            let shortL = proj(0, R.shortLineY)
            let shortR = proj(R.courtW, R.shortLineY)
            let midShort = proj(R.courtW / 2, R.shortLineY)
            let midBack = proj(R.courtW / 2, R.courtL)

            ZStack {
                Path { p in
                    p.move(to: fl)
                    p.addLine(to: fr)
                    p.addLine(to: br)
                    p.addLine(to: bl)
                    p.closeSubpath()
                }
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.93, green: 0.95, blue: 0.97), Color(red: 0.72, green: 0.77, blue: 0.83)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )

                Path { p in
                    p.move(to: shortL)
                    p.addLine(to: shortR)
                    p.move(to: midShort)
                    p.addLine(to: midBack)
                }
                .stroke(Color(white: 0.25), lineWidth: 0.75)

                Path { p in
                    let blBox = proj(0, R.boxFrontY + R.boxM)
                    let brInner = proj(R.boxM, R.boxFrontY + R.boxM)
                    p.move(to: bl)
                    p.addLine(to: blBox)
                    p.addLine(to: brInner)
                    p.addLine(to: proj(R.boxM, R.boxFrontY))
                    p.addLine(to: midShort)
                }
                .stroke(Color(white: 0.25), lineWidth: 0.55)

                Path { p in
                    let brBox = proj(R.courtW, R.boxFrontY + R.boxM)
                    let blInner = proj(R.courtW - R.boxM, R.boxFrontY + R.boxM)
                    p.move(to: br)
                    p.addLine(to: brBox)
                    p.addLine(to: blInner)
                    p.addLine(to: proj(R.courtW - R.boxM, R.boxFrontY))
                    p.addLine(to: midShort)
                }
                .stroke(Color(white: 0.25), lineWidth: 0.55)

                if serverTeam != nil {
                    let sideLeft = !serveRight
                    let x0: CGFloat = sideLeft ? 0 : R.courtW - R.boxM
                    let x1: CGFloat = sideLeft ? R.boxM : R.courtW
                    let p0 = proj(x0, R.boxFrontY)
                    let p1 = proj(x1, R.boxFrontY + R.boxM)
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.orange.opacity(0.45))
                        .overlay(RoundedRectangle(cornerRadius: 1).stroke(Color.orange, lineWidth: 0.75))
                        .frame(width: max(abs(p1.x - p0.x), 4), height: max(abs(p1.y - p0.y), 4))
                        .position(x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2)
                }
            }
        }
        .aspectRatio(180 / 172, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
