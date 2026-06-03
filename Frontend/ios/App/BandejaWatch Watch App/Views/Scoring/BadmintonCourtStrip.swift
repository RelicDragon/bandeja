import SwiftUI

/// Compact badminton court — BWF 6.10 × 13.40 m with down-court perspective (mirrors web).
struct BadmintonCourtStrip: View {
    var serverTeam: TeamSide?
    var serveRight: Bool
    var matchDoubles: Bool = false
    var courtEndsSwapped: Bool = false

    private enum R {
        static let courtW: CGFloat = 6.10
        static let courtL: CGFloat = 13.40
        static let shortFromNet: CGFloat = 1.98 / 6.70
        static let doublesLongFromBase: CGFloat = 0.76 / 6.70
        static let singlesAlley: CGFloat = 0.46 / 6.10
        static let surroundM: CGFloat = 0.55
        static let pad: CGFloat = 0.06
    }

    private enum Scene {
        static let cx: CGFloat = 56
        static let topY: CGFloat = 30
        static let bottomY: CGFloat = 194
        static let topHW: CGFloat = 32
        static let bottomHW: CGFloat = 42
    }

    private var servingTop: Bool {
        guard let serverTeam else { return false }
        return courtEndsSwapped ? serverTeam == .teamA : serverTeam == .teamB
    }
    private var showServe: Bool { serverTeam != nil }

    private func projectCourt(cx: CGFloat, cy: CGFloat) -> CGPoint {
        let t = cy / R.courtL
        let hw = Scene.topHW + t * (Scene.bottomHW - Scene.topHW)
        return CGPoint(
            x: Scene.cx + (cx / R.courtW - 0.5) * 2 * hw,
            y: Scene.topY + t * (Scene.bottomY - Scene.topY)
        )
    }

    private func flatToCourt(fx: CGFloat, fy: CGFloat, sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat) -> CGPoint {
        CGPoint(x: (fx - sx) / sw * R.courtW, y: (fy - sy) / sh * R.courtL)
    }

    private func projectFlat(fx: CGFloat, fy: CGFloat, sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat) -> CGPoint {
        let c = flatToCourt(fx: fx, fy: fy, sx: sx, sy: sy, sw: sw, sh: sh)
        return projectCourt(cx: c.x, cy: c.y)
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let sx = w * R.pad
            let sy = h * R.pad
            let sw = w * (1 - 2 * R.pad)
            let sh = h * (1 - 2 * R.pad)
            let netY = sy + sh / 2
            let shortOff = sh / 2 * R.shortFromNet
            let alley = sw * R.singlesAlley
            let singlesL = sx + alley
            let singlesR = sx + sw - alley
            let midX = sx + sw / 2
            let shortTop = netY - shortOff
            let shortBottom = netY + shortOff
            let dblLongTop = sy + sh / 2 * R.doublesLongFromBase
            let dblLongBottom = sy + sh - sh / 2 * R.doublesLongFromBase
            let padX = sw * (R.surroundM / R.courtW)
            let padY = sh * (R.surroundM / R.courtL)

            let scaleX = w / 112
            let scaleY = h / 218
            func map(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * scaleX, y: p.y * scaleY) }

            let floor = [CGPoint(x: sx, y: sy), CGPoint(x: sx + sw, y: sy), CGPoint(x: sx + sw, y: sy + sh), CGPoint(x: sx, y: sy + sh)]
            let surround = [
                CGPoint(x: sx - padX, y: sy - padY),
                CGPoint(x: sx + sw + padX, y: sy - padY),
                CGPoint(x: sx + sw + padX, y: sy + sh + padY),
                CGPoint(x: sx - padX, y: sy + sh + padY),
            ]

            let bl = map(projectFlat(fx: sx, fy: sy + sh, sx: sx, sy: sy, sw: sw, sh: sh))
            let br = map(projectFlat(fx: sx + sw, fy: sy + sh, sx: sx, sy: sy, sw: sw, sh: sh))

            ZStack {
                Ellipse()
                    .fill(Color.black.opacity(0.1))
                    .frame(width: (br.x - bl.x) * 0.88, height: 4 * scaleY)
                    .position(x: (bl.x + br.x) / 2, y: bl.y + 5 * scaleY)

                projectedPath(surround, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.86, green: 0.77, blue: 0.60),
                                Color(red: 0.72, green: 0.57, blue: 0.35),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                projectedPath(floor, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.12, green: 0.42, blue: 0.32),
                                Color(red: 0.08, green: 0.35, blue: 0.27),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .shadow(color: .black.opacity(0.16), radius: 1.4, x: 0, y: 1.2)

                courtLines(
                    sx: sx, sy: sy, sw: sw, sh: sh,
                    singlesL: singlesL, singlesR: singlesR, midX: midX,
                    shortTop: shortTop, shortBottom: shortBottom,
                    dblLongTop: dblLongTop, dblLongBottom: dblLongBottom,
                    map: map
                )

                netBand(sx: sx, sy: sy, sw: sw, sh: sh, netY: netY, map: map)

                if showServe {
                    serveFrontBoxes(
                        singlesL: singlesL, singlesR: singlesR, midX: midX,
                        shortTop: shortTop, shortBottom: shortBottom,
                        dblLongTop: dblLongTop, dblLongBottom: dblLongBottom,
                        sx: sx, sy: sy, sw: sw, sh: sh, map: map
                    )
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func projectedPath(
        _ corners: [CGPoint], sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> Path {
        var path = Path()
        guard let first = corners.first else { return path }
        path.move(to: map(projectFlat(fx: first.x, fy: first.y, sx: sx, sy: sy, sw: sw, sh: sh)))
        for pt in corners.dropFirst() {
            path.addLine(to: map(projectFlat(fx: pt.x, fy: pt.y, sx: sx, sy: sy, sw: sw, sh: sh)))
        }
        path.closeSubpath()
        return path
    }

    @ViewBuilder
    private func courtLines(
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        singlesL: CGFloat, singlesR: CGFloat, midX: CGFloat,
        shortTop: CGFloat, shortBottom: CGFloat,
        dblLongTop: CGFloat, dblLongBottom: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> some View {
        func line(_ a: CGPoint, _ b: CGPoint) -> Path {
            var p = Path()
            p.move(to: map(projectFlat(fx: a.x, fy: a.y, sx: sx, sy: sy, sw: sw, sh: sh)))
            p.addLine(to: map(projectFlat(fx: b.x, fy: b.y, sx: sx, sy: sy, sw: sw, sh: sh)))
            return p
        }

        line(CGPoint(x: sx, y: sy), CGPoint(x: sx + sw, y: sy)).stroke(Color.white.opacity(0.88), lineWidth: 0.85)
        line(CGPoint(x: sx + sw, y: sy), CGPoint(x: sx + sw, y: sy + sh)).stroke(Color.white.opacity(0.88), lineWidth: 0.85)
        line(CGPoint(x: sx + sw, y: sy + sh), CGPoint(x: sx, y: sy + sh)).stroke(Color.white.opacity(0.88), lineWidth: 0.85)
        line(CGPoint(x: sx, y: sy + sh), CGPoint(x: sx, y: sy)).stroke(Color.white.opacity(0.88), lineWidth: 0.85)
        line(CGPoint(x: sx, y: shortTop), CGPoint(x: sx + sw, y: shortTop)).stroke(Color.white.opacity(0.82), lineWidth: 0.75)
        line(CGPoint(x: sx, y: shortBottom), CGPoint(x: sx + sw, y: shortBottom)).stroke(Color.white.opacity(0.82), lineWidth: 0.75)
        line(CGPoint(x: sx, y: dblLongTop), CGPoint(x: sx + sw, y: dblLongTop)).stroke(Color.white.opacity(0.78), lineWidth: 0.7)
        line(CGPoint(x: sx, y: dblLongBottom), CGPoint(x: sx + sw, y: dblLongBottom)).stroke(Color.white.opacity(0.78), lineWidth: 0.7)
        line(CGPoint(x: singlesL, y: sy), CGPoint(x: singlesL, y: sy + sh)).stroke(Color.white.opacity(0.82), lineWidth: 0.7)
        line(CGPoint(x: singlesR, y: sy), CGPoint(x: singlesR, y: sy + sh)).stroke(Color.white.opacity(0.82), lineWidth: 0.7)
        line(CGPoint(x: midX, y: sy), CGPoint(x: midX, y: shortTop)).stroke(Color.white.opacity(0.78), lineWidth: 0.65)
        line(CGPoint(x: midX, y: shortBottom), CGPoint(x: midX, y: sy + sh)).stroke(Color.white.opacity(0.78), lineWidth: 0.65)
    }

    @ViewBuilder
    private func serveFrontBoxes(
        singlesL: CGFloat, singlesR: CGFloat, midX: CGFloat,
        shortTop: CGFloat, shortBottom: CGFloat,
        dblLongTop: CGFloat, dblLongBottom: CGFloat,
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> some View {
        let boxW = (singlesR - singlesL) / 2 - 1
        let backTopH = shortTop - dblLongTop - 1
        let backBottomH = dblLongBottom - shortBottom - 1

        func boxMinX(topEnd: Bool, rightServiceCourt: Bool) -> CGFloat {
            if topEnd {
                return rightServiceCourt ? singlesL : midX
            }
            return rightServiceCourt ? midX : singlesL
        }

        let serverMinX = boxMinX(topEnd: servingTop, rightServiceCourt: serveRight)

        if servingTop {
            servicePoly(
                x: serverMinX + boxW / 2, y: dblLongTop + backTopH / 2, w: boxW, h: backTopH,
                sx: sx, sy: sy, sw: sw, sh: sh, map: map
            )
        } else {
            servicePoly(
                x: serverMinX + boxW / 2, y: shortBottom + backBottomH / 2, w: boxW, h: backBottomH,
                sx: sx, sy: sy, sw: sw, sh: sh, map: map
            )
        }
    }

    @ViewBuilder
    private func servicePoly(
        x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat,
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> some View {
        let corners = [
            CGPoint(x: x - w / 2, y: y - h / 2),
            CGPoint(x: x + w / 2, y: y - h / 2),
            CGPoint(x: x + w / 2, y: y + h / 2),
            CGPoint(x: x - w / 2, y: y + h / 2),
        ]
        projectedPath(corners, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            .fill(Color.orange.opacity(0.38))
            .overlay(
                projectedPath(corners, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                    .stroke(Color.orange.opacity(0.72), lineWidth: 0.7)
            )
    }

    private enum Net {
        static let bottomClearanceM: CGFloat = 0.76
        static let postHeightM: CGFloat = 1.55
        static var meshHeightM: CGFloat { postHeightM - bottomClearanceM }
    }

    private func screenPxPerMeterAtNet(
        midX: CGFloat, netY: CGFloat, sh: CGFloat,
        sx: CGFloat, sy: CGFloat, sw: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> CGFloat {
        let atNet = map(projectFlat(fx: midX, fy: netY, sx: sx, sy: sy, sw: sw, sh: sh))
        let oneMeterNear = map(projectFlat(fx: midX, fy: netY + sh / R.courtL, sx: sx, sy: sy, sw: sw, sh: sh))
        return abs(oneMeterNear.y - atNet.y)
    }

    @ViewBuilder
    private func netBand(
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat, netY: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> some View {
        let left = map(projectFlat(fx: sx, fy: netY, sx: sx, sy: sy, sw: sw, sh: sh))
        let right = map(projectFlat(fx: sx + sw, fy: netY, sx: sx, sy: sy, sw: sw, sh: sh))
        let floorY = left.y
        let span = right.x - left.x
        let cx = (left.x + right.x) / 2
        let midX = sx + sw / 2
        let pxPerM = screenPxPerMeterAtNet(midX: midX, netY: netY, sh: sh, sx: sx, sy: sy, sw: sw, map: map)
        let meshH = Net.meshHeightM * pxPerM
        let postH = Net.postHeightM * pxPerM
        let meshBottomOffset = Net.bottomClearanceM * pxPerM
        let tapeH = max(0.8, meshH * 0.07)
        let postW = max(1.2, span * 0.022)
        let meshW = max(4, span - postW * 1.8)
        let meshBottom = floorY - meshBottomOffset
        let meshTop = meshBottom - meshH
        let tapeTop = meshTop - tapeH
        let meshCenterY = meshBottom - meshH / 2

        ZStack {
            Ellipse()
                .fill(Color.black.opacity(0.12))
                .frame(width: span * 0.38, height: 1.5)
                .position(x: cx, y: floorY + 1.6)

            RoundedRectangle(cornerRadius: 0.5, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.65, green: 0.45, blue: 0.05),
                            Color(red: 0.98, green: 0.88, blue: 0.28),
                            Color(red: 0.79, green: 0.58, blue: 0.08),
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(width: postW, height: postH)
                .position(x: left.x + postW / 2, y: floorY - postH / 2)

            RoundedRectangle(cornerRadius: 0.5, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.65, green: 0.45, blue: 0.05),
                            Color(red: 0.98, green: 0.88, blue: 0.28),
                            Color(red: 0.79, green: 0.58, blue: 0.08),
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(width: postW, height: postH)
                .position(x: right.x - postW / 2, y: floorY - postH / 2)

            ZStack {
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.94),
                        Color(red: 0.78, green: 0.82, blue: 0.86).opacity(0.86),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                netMesh(width: meshW, height: meshH)
            }
            .frame(width: meshW, height: meshH)
            .clipShape(RoundedRectangle(cornerRadius: 0.4, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 0.4).stroke(Color(white: 0.85), lineWidth: 0.25))
            .position(x: cx, y: meshCenterY)

            RoundedRectangle(cornerRadius: 0.4, style: .continuous)
                .fill(LinearGradient(colors: [.white, Color(red: 0.89, green: 0.92, blue: 0.95)], startPoint: .top, endPoint: .bottom))
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color.white.opacity(0.88))
                        .frame(height: 0.4)
                        .padding(.horizontal, 0.35)
                }
                .frame(width: span - 0.7, height: tapeH)
                .position(x: cx, y: tapeTop + tapeH / 2)
        }
    }

    private func netMesh(width: CGFloat, height: CGFloat) -> some View {
        Canvas { ctx, size in
            let step: CGFloat = max(2, width * 0.08)
            var x: CGFloat = 0
            while x < size.width + step {
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0))
                p.addLine(to: CGPoint(x: x - step, y: size.height))
                ctx.stroke(p, with: .color(Color.secondary.opacity(0.3)), lineWidth: 0.35)
                x += step
            }
        }
        .frame(width: width, height: height)
    }
}
