import SwiftUI

/// Bird's-eye padel/tennis court diagram — geometry mirrors web `PadelCourt` / `TennisCourt`.
struct WatchServeCourtSchema: View {
    enum Variant { case padel, tennis }

    let snapshot: ServeGuideSnapshot
    let teamAUsers: [WatchUser]
    let teamBUsers: [WatchUser]
    var matchDoubles: Bool = false
    var variant: Variant = .padel
    var compact: Bool = false
    var levelSport: WatchSport?
    /// Bench preview during serve setup (no ball or serve arrow).
    var endsSetup: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum VB {
        static let w: CGFloat = 100
        static let h: CGFloat = 200
        static let netY: CGFloat = 100
        static let netHalfH: CGFloat = 5
        static let m: CGFloat = 2

        static func serviceFromNet(variant: Variant) -> CGFloat {
            variant == .tennis ? 64 : 69.5
        }

        static func playXLeft(variant: Variant, matchDoubles: Bool) -> CGFloat {
            if variant == .tennis, !matchDoubles { return 38 }
            return 26
        }

        static func playXRight(variant: Variant, matchDoubles: Bool) -> CGFloat {
            if variant == .tennis, !matchDoubles { return 62 }
            return 74
        }
    }

    private var westServe: Bool {
        WatchServeCourtLayout.serveTargetIsWest(
            serverTeam: snapshot.serverTeam,
            courtSide: snapshot.courtSide,
            endsSwapped: snapshot.courtEndsSwapped
        )
    }

    private var serverEnd: WatchServeCourtLayout.VisualEnd {
        WatchServeCourtLayout.visualEnd(team: snapshot.serverTeam, endsSwapped: snapshot.courtEndsSwapped)
    }

    var body: some View {
        let outerW = compact ? 44.0 : 58.0
        let outerH = compact ? 88.0 : 116.0
        courtDiagram
            .frame(width: VB.w, height: VB.h)
            .scaleEffect(x: outerW / VB.w, y: outerH / VB.h, anchor: .topLeading)
            .frame(width: outerW, height: outerH, alignment: .topLeading)
            .clipped()
    }

    private var courtDiagram: some View {
        ZStack {
            courtLines
            if !endsSetup { serviceHighlights }
            if !endsSetup {
                WatchServeArrowTrace(
                    path: WatchServeCourtLayout.serveDiagonalArrow(
                        serverEnd: serverEnd,
                        westServe: westServe,
                        variant: variant,
                        matchDoubles: matchDoubles
                    ),
                    motionKey: snapshot.motionToken
                )
                ballMarker
            }
            avatarOverlay(baselineOnly: endsSetup)
        }
    }

    private var courtLines: some View {
        let x1 = VB.m
        let x2 = VB.w - VB.m
        let midX = VB.w / 2
        let serviceFromNet = VB.serviceFromNet(variant: variant)
        let yServiceTop = VB.netY - serviceFromNet
        let yServiceBottom = VB.netY + serviceFromNet
        let netY0 = VB.netY - VB.netHalfH
        let netY1 = VB.netY + VB.netHalfH

        return ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .stroke(Color.secondary.opacity(0.55), lineWidth: 0.9)
                .frame(width: x2 - x1, height: VB.h - 2 * VB.m)
                .position(x: VB.w / 2, y: VB.h / 2)

            Path { p in
                p.move(to: CGPoint(x: x1, y: yServiceTop))
                p.addLine(to: CGPoint(x: x2, y: yServiceTop))
                p.move(to: CGPoint(x: x1, y: yServiceBottom))
                p.addLine(to: CGPoint(x: x2, y: yServiceBottom))
                p.move(to: CGPoint(x: midX, y: yServiceTop))
                p.addLine(to: CGPoint(x: midX, y: netY0))
                p.move(to: CGPoint(x: midX, y: netY1))
                p.addLine(to: CGPoint(x: midX, y: yServiceBottom))
            }
            .stroke(Color.secondary.opacity(0.45), lineWidth: 0.7)

            Rectangle()
                .fill(topHalfFill)
                .frame(width: x2 - x1, height: VB.netY - VB.m)
                .position(x: VB.w / 2, y: (VB.m + VB.netY) / 2)

            Rectangle()
                .fill(bottomHalfFill)
                .frame(width: x2 - x1, height: VB.h - VB.netY - VB.m)
                .position(x: VB.w / 2, y: (VB.netY + VB.h - VB.m) / 2)

            Rectangle()
                .fill(Color(red: 0.88, green: 0.91, blue: 0.94))
                .frame(width: x2 - x1, height: max(1, netY1 - netY0))
                .position(x: VB.w / 2, y: VB.netY)
        }
    }

    private var topHalfFill: Color {
        variant == .tennis
            ? Color(red: 0.75, green: 0.92, blue: 0.82).opacity(0.35)
            : Color.secondary.opacity(0.12)
    }

    private var bottomHalfFill: Color {
        variant == .tennis
            ? Color(red: 0.75, green: 0.92, blue: 0.82).opacity(0.35)
            : Color.secondary.opacity(0.12)
    }

    @ViewBuilder
    private var serviceHighlights: some View {
        let colW = (VB.w - 2 * VB.m) / 2
        let colLX = VB.m
        let colRX = VB.w / 2
        let bandH = VB.serviceFromNet(variant: variant)
        let yTop = VB.netY - VB.serviceFromNet
        let yBottom = VB.netY
        let highlight = Color.accentColor.opacity(0.32)
        let dim = Color.secondary.opacity(0.14)

        if serverEnd == .top {
            Rectangle().fill(westServe ? highlight : dim)
                .frame(width: colW, height: bandH)
                .position(x: colLX + colW / 2, y: yTop + bandH / 2)
            Rectangle().fill(westServe ? dim : highlight)
                .frame(width: colW, height: bandH)
                .position(x: colRX + colW / 2, y: yTop + bandH / 2)
        }
        if serverEnd == .bottom {
            Rectangle().fill(westServe ? highlight : dim)
                .frame(width: colW, height: bandH)
                .position(x: colLX + colW / 2, y: yBottom + bandH / 2)
            Rectangle().fill(westServe ? dim : highlight)
                .frame(width: colW, height: bandH)
                .position(x: colRX + colW / 2, y: yBottom + bandH / 2)
        }
    }

    private var ballMarker: some View {
        let pt = WatchServeCourtLayout.ballPoint(
            serverTeam: snapshot.serverTeam,
            courtSide: snapshot.courtSide,
            endsSwapped: snapshot.courtEndsSwapped,
            variant: variant,
            matchDoubles: matchDoubles
        )
        return Group {
            if variant == .tennis {
                tennisBallMarker
            } else {
                padelBallMarker
            }
        }
        .frame(width: compact ? 7 : 9, height: compact ? 7 : 9)
        .position(x: pt.x, y: pt.y)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.72), value: snapshot.motionToken)
    }

    private var padelBallMarker: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 0.96, green: 1, blue: 0.6),
                        Color(red: 0.91, green: 0.99, blue: 0.22),
                        Color(red: 0.72, green: 0.81, blue: 0.04)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(Circle().stroke(Color(red: 0.2, green: 0.3, blue: 0.05).opacity(0.35), lineWidth: 0.5))
            .shadow(color: Color(red: 0.86, green: 0.99, blue: 0.31).opacity(0.55), radius: 2)
    }

    private var tennisBallMarker: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 1, green: 0.98, blue: 0.76),
                        Color(red: 0.99, green: 0.88, blue: 0.28),
                        Color(red: 0.79, green: 0.54, blue: 0.02)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(Circle().stroke(Color(red: 0.63, green: 0.38, blue: 0.03).opacity(0.4), lineWidth: 0.5))
            .shadow(color: Color(red: 0.99, green: 0.88, blue: 0.28).opacity(0.45), radius: 2)
    }

    @ViewBuilder
    private func avatarOverlay(baselineOnly: Bool) -> some View {
        let topUsers = snapshot.courtEndsSwapped ? teamAUsers : teamBUsers
        let bottomUsers = snapshot.courtEndsSwapped ? teamBUsers : teamAUsers
        let topTeam: TeamSide = snapshot.courtEndsSwapped ? .teamA : .teamB
        let bottomTeam: TeamSide = snapshot.courtEndsSwapped ? .teamB : .teamA
        let size: CGFloat = compact ? 14 : 18

        ForEach(WatchServeCourtLayout.baselineSlots(
            players: topUsers,
            end: .top,
            team: topTeam,
            serverTeam: snapshot.serverTeam,
            courtSide: snapshot.courtSide,
            serverPlayerIndex: snapshot.serverPlayerIndex,
            endsSwapped: snapshot.courtEndsSwapped,
            teamASidesMirrored: snapshot.courtTeamASidesMirrored,
            teamBSidesMirrored: snapshot.courtTeamBSidesMirrored,
            matchDoubles: matchDoubles,
            variant: variant,
            baselineOnly: baselineOnly
        ), id: \.idx) { slot in
            avatarAt(slot: slot, size: size, servingTeam: topTeam, baselineOnly: baselineOnly)
        }
        ForEach(WatchServeCourtLayout.baselineSlots(
            players: bottomUsers,
            end: .bottom,
            team: bottomTeam,
            serverTeam: snapshot.serverTeam,
            courtSide: snapshot.courtSide,
            serverPlayerIndex: snapshot.serverPlayerIndex,
            endsSwapped: snapshot.courtEndsSwapped,
            teamASidesMirrored: snapshot.courtTeamASidesMirrored,
            teamBSidesMirrored: snapshot.courtTeamBSidesMirrored,
            matchDoubles: matchDoubles,
            variant: variant,
            baselineOnly: baselineOnly
        ), id: \.idx) { slot in
            avatarAt(slot: slot, size: size, servingTeam: bottomTeam, baselineOnly: baselineOnly)
        }
    }

    @ViewBuilder
    private func avatarAt(
        slot: WatchServeCourtLayout.AvatarSlot,
        size: CGFloat,
        servingTeam: TeamSide,
        baselineOnly: Bool
    ) -> some View {
        let ring = !baselineOnly && snapshot.serverTeam == servingTeam && slot.idx == snapshot.serverPlayerIndex
        ZStack {
            Ellipse()
                .fill(Color(red: 2 / 255, green: 6 / 255, blue: 23 / 255).opacity(0.14))
                .frame(width: size * 0.72, height: max(1.5, size * 0.15))
                .offset(y: size * 0.46)
            Group {
                if let user = slot.player {
                    WatchPlayerAvatarView(user: user, size: size, role: nil, levelSport: levelSport)
                } else {
                    Circle().fill(Color.secondary.opacity(0.2)).frame(width: size, height: size)
                }
            }
            .overlay {
                if ring {
                    Circle().stroke(Color.accentColor, lineWidth: 1.5)
                }
            }
        }
        .position(x: slot.x, y: slot.y)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.72), value: snapshot.motionToken)
    }
}

private struct WatchServeArrowTrace: View {
    let path: Path
    let motionKey: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var progress: CGFloat = 0

    var body: some View {
        path
            .trim(from: 0, to: progress)
            .stroke(
                Color.accentColor,
                style: StrokeStyle(lineWidth: 2.1, lineCap: .round, lineJoin: .round, dash: [5.25, 5.25])
            )
            .onAppear { syncProgress(animated: !reduceMotion) }
            .onChange(of: motionKey) { _, _ in syncProgress(animated: !reduceMotion) }
    }

    private func syncProgress(animated: Bool) {
        if animated {
            progress = 0
            withAnimation(.timingCurve(0.12, 0.82, 0.22, 1, duration: 0.58)) {
                progress = 1
            }
        } else {
            progress = 1
        }
    }
}

private enum WatchServeCourtLayout {
    enum VisualEnd { case top, bottom }

    struct AvatarSlot: Identifiable {
        var id: Int { idx }
        var idx: Int
        var x: CGFloat
        var y: CGFloat
        var player: WatchUser?
    }

    static func visualEnd(team: TeamSide, endsSwapped: Bool) -> VisualEnd {
        let aOnBottom = !endsSwapped
        if team == .teamA { return aOnBottom ? .bottom : .top }
        return aOnBottom ? .top : .bottom
    }

    static func serveTargetIsWest(serverTeam: TeamSide, courtSide: CourtServeSide, endsSwapped: Bool) -> Bool {
        let isRight = courtSide == .rightDeuce
        return visualEnd(team: serverTeam, endsSwapped: endsSwapped) == .top ? isRight : !isRight
    }

    static func ballPoint(
        serverTeam: TeamSide,
        courtSide: CourtServeSide,
        endsSwapped: Bool,
        variant: WatchServeCourtSchema.Variant,
        matchDoubles: Bool
    ) -> CGPoint {
        let west = serveTargetIsWest(serverTeam: serverTeam, courtSide: courtSide, endsSwapped: endsSwapped)
        let x: CGFloat = west ? VB.playXLeft(variant: variant, matchDoubles: matchDoubles) : VB.playXRight(variant: variant, matchDoubles: matchDoubles)
        let y: CGFloat = visualEnd(team: serverTeam, endsSwapped: endsSwapped) == .bottom ? 156 : 44
        return CGPoint(x: x, y: y)
    }

    static func serveDiagonalArrow(
        serverEnd: VisualEnd,
        westServe: Bool,
        variant: WatchServeCourtSchema.Variant,
        matchDoubles: Bool
    ) -> Path {
        let midX: CGFloat = 50
        let xL = VB.playXLeft(variant: variant, matchDoubles: matchDoubles)
        let xR = VB.playXRight(variant: variant, matchDoubles: matchDoubles)
        return Path { p in
            if serverEnd == .bottom {
                let cy: CGFloat = 78
                if westServe {
                    p.move(to: CGPoint(x: xL, y: 156))
                    p.addQuadCurve(to: CGPoint(x: 70, y: 56), control: CGPoint(x: midX, y: cy))
                } else {
                    p.move(to: CGPoint(x: xR, y: 156))
                    p.addQuadCurve(to: CGPoint(x: 30, y: 56), control: CGPoint(x: midX, y: cy))
                }
            } else {
                let cy: CGFloat = 128
                if westServe {
                    p.move(to: CGPoint(x: xL, y: 44))
                    p.addQuadCurve(to: CGPoint(x: 70, y: 144), control: CGPoint(x: midX, y: cy))
                } else {
                    p.move(to: CGPoint(x: xR, y: 44))
                    p.addQuadCurve(to: CGPoint(x: 30, y: 144), control: CGPoint(x: midX, y: cy))
                }
            }
        }
    }

    static func baselineSlots(
        players: [WatchUser],
        end: VisualEnd,
        team: TeamSide,
        serverTeam: TeamSide,
        courtSide: CourtServeSide,
        serverPlayerIndex: Int,
        endsSwapped: Bool,
        teamASidesMirrored: Bool,
        teamBSidesMirrored: Bool,
        matchDoubles: Bool,
        variant: WatchServeCourtSchema.Variant,
        baselineOnly: Bool = false
    ) -> [AvatarSlot] {
        let baselineY: CGFloat = end == .top ? 14 : 186
        let netY: CGFloat = end == .top ? 72 : 128
        let xR: CGFloat = VB.playXRight(variant: variant, matchDoubles: matchDoubles)
        let xL: CGFloat = VB.playXLeft(variant: variant, matchDoubles: matchDoubles)
        let teamMirrored = team == .teamA ? teamASidesMirrored : teamBSidesMirrored
        let west = serveTargetIsWest(serverTeam: serverTeam, courtSide: courtSide, endsSwapped: endsSwapped)
        let serverX = west ? xL : xR
        let partnerX = west ? xR : xL
        let serving = !baselineOnly && serverTeam == team
        let pair = Array(players.prefix(matchDoubles ? 2 : 1))
        let n = pair.count
        if n == 0 { return [] }
        if n == 1, !matchDoubles {
            return [AvatarSlot(idx: 0, x: serving ? serverX : 50, y: baselineY, player: pair[0])]
        }
        if n == 1, matchDoubles {
            let p0 = teamMirrored ? xL : xR
            let p1 = teamMirrored ? xR : xL
            return [
                AvatarSlot(idx: 0, x: p0, y: baselineY, player: pair[0]),
                AvatarSlot(idx: 1, x: p1, y: baselineY, player: nil)
            ]
        }
        let si = min(max(0, serverPlayerIndex), n - 1)
        let p0 = teamMirrored ? xL : xR
        let p1 = teamMirrored ? xR : xL
        if !serving {
            return [
                AvatarSlot(idx: 0, x: p0, y: baselineY, player: pair[0]),
                AvatarSlot(idx: 1, x: p1, y: baselineY, player: pair[1])
            ]
        }
        return [0, 1].map { idx in
            AvatarSlot(
                idx: idx,
                x: idx == si ? serverX : partnerX,
                y: idx == si ? baselineY : netY,
                player: pair[safe: idx]
            )
        }
    }
}
