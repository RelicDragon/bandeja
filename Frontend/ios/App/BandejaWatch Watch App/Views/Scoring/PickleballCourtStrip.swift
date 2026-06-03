import SwiftUI

/// Compact pickleball court — USAPA proportions with down-court perspective (mirrors web).
struct PickleballCourtStrip: View {
    var serverTeam: TeamSide?
    var serveRight: Bool
    var matchDoubles: Bool = false
    var courtEndsSwapped: Bool = false

    private enum R {
        static let courtW: CGFloat = 20
        static let courtL: CGFloat = 44
        static let nvzFromNet: CGFloat = 7.0 / 22.0
        static let baselineFromBase: CGFloat = 0.10
        static let surroundFt: CGFloat = 2.5
        static let pad: CGFloat = 0.06
    }

    private enum Scene {
        static let cx: CGFloat = 56
        static let topY: CGFloat = 30
        static let bottomY: CGFloat = 194
        static let topHW: CGFloat = 35
        static let bottomHW: CGFloat = 47
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
            let nvzOff = innerHalf(sh) * R.nvzFromNet
            let nvzTop = netY - nvzOff
            let nvzBottom = netY + nvzOff
            let midX = sx + sw / 2
            let leftBoxX = sx + sw * 0.25
            let rightBoxX = sx + sw * 0.75
            let topBaselineY = sy + (nvzTop - sy) * R.baselineFromBase
            let bottomBaselineY = nvzBottom + (sy + sh - nvzBottom) * (1 - R.baselineFromBase)
            let padX = sw * (R.surroundFt / R.courtW)
            let padY = sh * (R.surroundFt / R.courtL)

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
                                Color(red: 0.24, green: 0.48, blue: 0.27),
                                Color(red: 0.18, green: 0.40, blue: 0.21),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                projectedPath(floor, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.10, green: 0.45, blue: 0.78),
                                Color(red: 0.08, green: 0.40, blue: 0.72),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .shadow(color: .black.opacity(0.14), radius: 1.2, x: 0, y: 1)

                courtLines(sx: sx, sy: sy, sw: sw, sh: sh, midX: midX, nvzTop: nvzTop, nvzBottom: nvzBottom, map: map)
                netBand(sx: sx, sy: sy, sw: sw, sh: sh, netY: netY, map: map)

                if showServe {
                    serveBoxesAndPlayers(
                        leftBoxX: leftBoxX, rightBoxX: rightBoxX,
                        sx: sx, sy: sy, sw: sw, sh: sh,
                        nvzTop: nvzTop, nvzBottom: nvzBottom,
                        topBaselineY: topBaselineY, bottomBaselineY: bottomBaselineY,
                        map: map
                    )
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func innerHalf(_ sh: CGFloat) -> CGFloat { sh / 2 }

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
        midX: CGFloat, nvzTop: CGFloat, nvzBottom: CGFloat,
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
        line(CGPoint(x: sx, y: nvzTop), CGPoint(x: sx + sw, y: nvzTop)).stroke(Color.white.opacity(0.82), lineWidth: 0.75)
        line(CGPoint(x: sx, y: nvzBottom), CGPoint(x: sx + sw, y: nvzBottom)).stroke(Color.white.opacity(0.82), lineWidth: 0.75)
        line(CGPoint(x: midX, y: sy), CGPoint(x: midX, y: nvzTop)).stroke(Color.white.opacity(0.82), lineWidth: 0.7)
        line(CGPoint(x: midX, y: nvzBottom), CGPoint(x: midX, y: sy + sh)).stroke(Color.white.opacity(0.82), lineWidth: 0.7)
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
        let postW = max(1.4, span * 0.028)
        let postH = max(7, span * 0.13)
        let tapeH = max(1.1, span * 0.022)
        let meshH = max(4.5, span * 0.085)
        let meshW = max(4, span - postW * 1.8)
        let meshTop = floorY - meshH
        let tapeTop = meshTop - tapeH

        ZStack {
            Ellipse()
                .fill(Color.black.opacity(0.12))
                .frame(width: span * 0.4, height: 1.6)
                .position(x: cx, y: floorY + 1.8)

            RoundedRectangle(cornerRadius: 0.5, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(white: 0.92), .white, Color(white: 0.82)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .overlay(RoundedRectangle(cornerRadius: 0.5).stroke(Color.secondary.opacity(0.35), lineWidth: 0.3))
                .frame(width: postW, height: postH)
                .position(x: left.x + postW / 2, y: floorY - postH / 2)

            RoundedRectangle(cornerRadius: 0.5, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(white: 0.92), .white, Color(white: 0.82)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .overlay(RoundedRectangle(cornerRadius: 0.5).stroke(Color.secondary.opacity(0.35), lineWidth: 0.3))
                .frame(width: postW, height: postH)
                .position(x: right.x - postW / 2, y: floorY - postH / 2)

            ZStack {
                LinearGradient(
                    colors: [Color.white.opacity(0.94), Color(red: 0.78, green: 0.82, blue: 0.86).opacity(0.86)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                netMesh(width: meshW, height: meshH)
            }
            .frame(width: meshW, height: meshH)
            .clipShape(RoundedRectangle(cornerRadius: 0.4, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 0.4).stroke(Color(white: 0.85), lineWidth: 0.25))
            .position(x: cx, y: floorY - meshH / 2)

            RoundedRectangle(cornerRadius: 0.4, style: .continuous)
                .fill(LinearGradient(colors: [.white, Color(red: 0.89, green: 0.92, blue: 0.95)], startPoint: .top, endPoint: .bottom))
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color.white.opacity(0.88))
                        .frame(height: 0.45)
                        .padding(.horizontal, 0.4)
                }
                .frame(width: span - 0.8, height: tapeH)
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

    @ViewBuilder
    private func serveBoxesAndPlayers(
        leftBoxX: CGFloat, rightBoxX: CGFloat,
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        nvzTop: CGFloat, nvzBottom: CGFloat,
        topBaselineY: CGFloat, bottomBaselineY: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> some View {
        let halfW = rightBoxX - leftBoxX
        let topBoxH = nvzTop - sy
        let bottomBoxH = sy + sh - nvzBottom
        let serverLeft = !serveRight
        let serverBoxX = serverLeft ? leftBoxX : rightBoxX
        let partnerBoxX = serverLeft ? rightBoxX : leftBoxX
        let recvBoxX = serveRight ? leftBoxX : rightBoxX
        let recvPartnerX = serveRight ? rightBoxX : leftBoxX

        if servingTop {
            servicePoly(x: serverBoxX, y: sy + topBoxH * 0.08, w: halfW, h: topBoxH * 0.52, sx: sx, sy: sy, sw: sw, sh: sh, map: map, active: true)
            servicePoly(x: recvBoxX, y: nvzBottom + bottomBoxH * 0.12, w: halfW, h: bottomBoxH * 0.48, sx: sx, sy: sy, sw: sw, sh: sh, map: map, active: false)
            playerDot(x: serverBoxX, y: topBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            if matchDoubles {
                playerDot(x: partnerBoxX, y: topBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                playerDot(x: recvBoxX, y: bottomBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                playerDot(x: recvPartnerX, y: bottomBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            } else {
                playerDot(x: recvBoxX, y: bottomBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            }
        } else {
            servicePoly(x: serverBoxX, y: nvzBottom + bottomBoxH * 0.08, w: halfW, h: bottomBoxH * 0.52, sx: sx, sy: sy, sw: sw, sh: sh, map: map, active: true)
            servicePoly(x: recvBoxX, y: sy + topBoxH * 0.12, w: halfW, h: topBoxH * 0.48, sx: sx, sy: sy, sw: sw, sh: sh, map: map, active: false)
            playerDot(x: serverBoxX, y: bottomBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            if matchDoubles {
                playerDot(x: partnerBoxX, y: bottomBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                playerDot(x: recvBoxX, y: topBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                playerDot(x: recvPartnerX, y: topBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            } else {
                playerDot(x: recvBoxX, y: topBaselineY, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            }
        }
    }

    @ViewBuilder
    private func servicePoly(
        x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat,
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        map: (CGPoint) -> CGPoint, active: Bool
    ) -> some View {
        let corners = [
            CGPoint(x: x - w / 2, y: y),
            CGPoint(x: x + w / 2, y: y),
            CGPoint(x: x + w / 2, y: y + h),
            CGPoint(x: x - w / 2, y: y + h),
        ]
        projectedPath(corners, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
            .fill(active ? Color.yellow.opacity(0.28) : Color.white.opacity(0.1))
            .overlay(
                projectedPath(corners, sx: sx, sy: sy, sw: sw, sh: sh, map: map)
                    .stroke(active ? Color.yellow.opacity(0.65) : Color.white.opacity(0.28), lineWidth: 0.7)
            )
    }

    @ViewBuilder
    private func playerDot(
        x: CGFloat, y: CGFloat,
        sx: CGFloat, sy: CGFloat, sw: CGFloat, sh: CGFloat,
        map: (CGPoint) -> CGPoint
    ) -> some View {
        let p = map(projectFlat(fx: x, fy: y, sx: sx, sy: sy, sw: sw, sh: sh))
        Circle()
            .fill(Color.white.opacity(0.92))
            .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 0.4))
            .frame(width: 3.5, height: 3.5)
            .position(x: p.x, y: p.y)
    }
}
